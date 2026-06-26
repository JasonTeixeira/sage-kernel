// Static application security testing (AST-based). Detects vulnerable code
// patterns — not just secrets/dependencies: command injection, dynamic code
// execution, path traversal, and prototype pollution. Tuned for low false
// positives: only string-built shell commands and unwrapped path concatenation
// are flagged, so idiomatic path.join()/array-arg spawns are not penalized.

import fs from "node:fs";
import path from "node:path";
import { walkAst, nodeLine } from "../ast/parse.mjs";
import { parseByPath } from "../plugins/registry.mjs";
import { analyzeTaintFile } from "./taint.mjs";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated"]);
const SHELL_ALWAYS = new Set(["exec", "execSync"]);
const SPAWN_LIKE = new Set(["spawn", "spawnSync", "execFile", "execFileSync"]);
const CHILD_PROCESS_ALIASES = new Set(["child_process", "cp", "childProcess", "node:child_process"]);
const FS_SINKS = new Set([
  "readFile", "readFileSync", "writeFile", "writeFileSync", "appendFile", "appendFileSync",
  "createReadStream", "createWriteStream", "unlink", "unlinkSync", "rm", "rmSync", "readdir", "readdirSync"
]);
const POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const CODE_FILE = /\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$/;
const MAX_FILES = 1000;
const MAX_BYTES = 400000;

export function scanSastFile(relPath, source) {
  // Route parsing through the plugin registry so a registered LANGUAGE plugin
  // extends SAST to its language; falls back to the built-in JS/TS parser.
  const ast = parseByPath(relPath, source);
  if (!ast) return [];
  const findings = [];
  const at = (node) => `${relPath}:${nodeLine(node) ?? "?"}`;
  const add = (severity, rule, message, node, recommendation) =>
    findings.push({ severity, rule, message, evidence: at(node), recommendation });

  // Security-sensitive binding names (for insecure-randomness detection).
  const SECRET_NAME = /token|secret|password|passwd|nonce|salt|otp|session|apikey|api_key|csrf|cookie/i;

  walkAst(ast, {
    CallExpression(node) {
      if (node.callee?.type === "Identifier" && node.callee.name === "eval") {
        add("high", "dynamic-eval", "Uses eval() — dynamic code execution.", node, "Remove eval(); parse or dispatch explicitly.");
      }
      // Dynamic require(non-literal) — arbitrary module load from untrusted input.
      if (node.callee?.type === "Identifier" && node.callee.name === "require" && isDynamic(node.arguments?.[0])) {
        add("medium", "dynamic-require", "require() called with a non-literal specifier — arbitrary module load.", node, "Require static module paths; map allowed names to literal requires.");
      }
      // vm.runInNewContext / runInThisContext / runInContext / compileFunction — eval-equivalent.
      if (node.callee?.type === "MemberExpression" && VM_EXEC_METHODS.has(node.callee.property?.name)) {
        add("high", "dynamic-eval", `vm.${node.callee.property.name}() executes arbitrary code — eval-equivalent.`, node, "Do not execute dynamic source; use a real parser/dispatch.");
      }
      // setTimeout/setInterval with a string body is eval-equivalent.
      if (node.callee?.type === "Identifier" && (node.callee.name === "setTimeout" || node.callee.name === "setInterval") && isStringExpr(node.arguments?.[0])) {
        add("high", "timer-string-eval", `${node.callee.name} called with a string body — eval-equivalent.`, node, "Pass a function, never a string, to timers.");
      }
      // Deprecated, IV-less symmetric crypto.
      const cipher = node.callee?.type === "MemberExpression" ? node.callee.property?.name : null;
      if (cipher === "createCipher" || cipher === "createDecipher") {
        add("high", "weak-cipher", `${cipher} is deprecated and IV-less — insecure symmetric crypto.`, node, "Use createCipheriv/createDecipheriv with a random IV.");
      }
      // SSRF: a request to a URL assembled by string concatenation/interpolation.
      if (isRequestCall(node.callee) && isCommandString(node.arguments?.[0])) {
        add("medium", "ssrf", "Outbound request to a URL built from interpolation — SSRF risk.", node, "Validate/allowlist the host; never interpolate untrusted input into request URLs.");
      }
      const exec = execCallName(node.callee);
      if (exec) {
        const arg0 = node.arguments?.[0];
        const shelled = SHELL_ALWAYS.has(exec) || hasShellTrue(node.arguments);
        if (shelled && isDynamic(arg0)) {
          if (isCommandString(arg0)) add("high", "command-injection", `Shell command built from interpolation (${exec}).`, node, "Pass a literal command with a validated argument array.");
          else add("medium", "shell-dynamic-command", `Dynamic command run through a shell (${exec}).`, node, "Avoid shell:true; pass command and args separately; allowlist provider commands.");
        }
        // sh/bash -c "<dynamic>" pattern: shell invoked explicitly with a dynamic
        // -c payload (e.g. spawnSync('sh', ['-c', 'cat ' + name])).
        if (isShellBinary(arg0) && hasDynamicDashC(node.arguments?.[1])) {
          add("high", "command-injection", `Shell invoked with a dynamic -c payload (${exec}).`, node, "Never pass interpolated input to sh -c; use an argument array without a shell.");
        }
      }
      const fsSink = fsSinkName(node.callee);
      if (fsSink) {
        const arg0 = node.arguments?.[0];
        if (isCommandString(arg0) && !isPathWrapped(arg0)) {
          add("medium", "path-traversal", `Filesystem path built by concatenation (${fsSink}) — path traversal risk.`, node, "Wrap with path.join/resolve and validate against an allowed root.");
        }
      }
      const hash = weakHashAlgorithm(node);
      if (hash) {
        add("medium", "weak-hash", `Weak hash algorithm (${hash}) — unsuitable for integrity/security use.`, node, "Use SHA-256 or stronger; reserve md5/sha1 only for non-security checksums.");
      }
    },
    NewExpression(node) {
      if (node.callee?.type === "Identifier" && node.callee.name === "Function") {
        add("high", "dynamic-function", "Uses new Function() — dynamic code execution.", node, "Replace dynamic Function construction with explicit code.");
      }
    },
    ImportExpression(node) {
      if (isDynamic(node.source)) {
        add("medium", "dynamic-require", "Dynamic import() with a non-literal specifier — arbitrary module load.", node, "Import static module paths; map allowed names to literal imports.");
      }
    },
    AssignmentExpression(node) {
      const target = node.left;
      if (target?.type === "MemberExpression" && target.computed && target.property?.type === "Literal" && POLLUTION_KEYS.has(String(target.property.value))) {
        add("high", "prototype-pollution", `Assignment to ${target.property.value} via computed member — prototype pollution risk.`, node, "Never write __proto__/constructor/prototype from dynamic data; use a null-proto map.");
      } else if (target?.type === "MemberExpression" && assignmentTouchesProto(target)) {
        // Non-computed nested access, e.g. o.__proto__.polluted = v
        add("high", "prototype-pollution", "Assignment through __proto__/constructor/prototype — prototype pollution risk.", node, "Never write through __proto__/constructor/prototype; use a null-proto map.");
      }
    }
  });

  // Insecure randomness: Math.random() feeding a security-sensitive binding —
  // needs ancestor context, so it runs as a separate ancestor walk.
  walkAst(ast, {
    CallExpression(node, _state, ancestors) {
      if (!isMathRandom(node.callee)) return;
      for (let i = ancestors.length - 2; i >= 0; i -= 1) {
        const ancestor = ancestors[i];
        const name = ancestor.type === "VariableDeclarator" ? ancestor.id?.name
          : ancestor.type === "Property" ? (ancestor.key?.name || ancestor.key?.value)
          : ancestor.type === "AssignmentExpression" && ancestor.left?.type === "Identifier" ? ancestor.left.name
          : null;
        if (name && SECRET_NAME.test(String(name))) {
          add("medium", "insecure-randomness", "Math.random() used for a security-sensitive value — not cryptographically secure.", node, "Use crypto.randomBytes/randomUUID for tokens, secrets, salts, or IDs.");
          return;
        }
        if (ancestor.type === "FunctionDeclaration" || ancestor.type === "FunctionExpression" || ancestor.type === "ArrowFunctionExpression") return;
      }
    }
  }, { mode: "ancestor" });

  // Dataflow taint findings (source -> sink) are folded into the SAST result.
  for (const finding of analyzeTaintFile(relPath, source)) findings.push(finding);

  return findings;
}

// Canonical scannable-file list — shared by the full scan and the incremental
// scanner so both analyze exactly the same set (no drift between the two paths).
export function collectScanFiles(root, options = {}) {
  const all = (options.files || listSourceFiles(root)).slice(0, options.maxFiles || MAX_FILES);
  const maxBytes = options.maxBytes || MAX_BYTES;
  return all.filter((rel) => {
    if (!CODE_FILE.test(rel) || /\.d\.ts$/.test(rel)) return false;
    if (isTestOrFixture(rel)) return false;
    try {
      if (fs.statSync(path.join(root, rel)).size > maxBytes) return false;
    } catch {
      return false;
    }
    return true;
  });
}

export function scanSast(options = {}) {
  const projectRoot = options.root || process.cwd();
  const files = collectScanFiles(projectRoot, options);
  const findings = [];
  for (const rel of files) {
    let source;
    try {
      source = fs.readFileSync(path.join(projectRoot, rel), "utf8");
    } catch {
      continue;
    }
    for (const finding of scanSastFile(rel, source)) findings.push(finding);
  }
  const high = findings.filter((finding) => finding.severity === "high" || finding.severity === "critical").length;
  return {
    // Only high/critical vulnerabilities fail the gate; mediums are surfaced as
    // hardening signals (consistent with the review engine's calibration).
    status: high > 0 ? "failed" : "passed",
    filesScanned: files.length,
    high,
    findings,
    summary: { high, medium: findings.filter((f) => f.severity === "medium").length, total: findings.length }
  };
}

const VM_EXEC_METHODS = new Set(["runInNewContext", "runInThisContext", "runInContext", "compileFunction"]);
const SHELL_BINARIES = new Set(["sh", "bash", "zsh", "/bin/sh", "/bin/bash", "/usr/bin/sh", "/usr/bin/bash"]);

// arg0 is a literal shell binary name (sh / bash / /bin/sh ...).
function isShellBinary(node) {
  return node?.type === "Literal" && typeof node.value === "string" && SHELL_BINARIES.has(node.value);
}

// The args array contains a "-c" entry followed by a dynamic command string.
function hasDynamicDashC(argsNode) {
  if (argsNode?.type !== "ArrayExpression") return false;
  const elements = argsNode.elements || [];
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    if (el?.type === "Literal" && el.value === "-c") {
      const next = elements[i + 1];
      if (next && isDynamic(next)) return true;
    }
  }
  return false;
}

// A member-assignment target whose object chain passes through a non-computed
// __proto__/constructor/prototype property (e.g. o.__proto__.x).
function assignmentTouchesProto(target) {
  let node = target;
  while (node?.type === "MemberExpression") {
    if (!node.computed && node.property?.type === "Identifier" && POLLUTION_KEYS.has(node.property.name)) return true;
    node = node.object;
  }
  return false;
}

function execCallName(callee) {
  if (!callee) return null;
  if (callee.type === "Identifier" && (SHELL_ALWAYS.has(callee.name) || SPAWN_LIKE.has(callee.name))) return callee.name;
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
    const name = callee.property.name;
    const objectName = callee.object?.type === "Identifier" ? callee.object.name : null;
    if ((SHELL_ALWAYS.has(name) || SPAWN_LIKE.has(name)) && objectName && CHILD_PROCESS_ALIASES.has(objectName)) return name;
  }
  return null;
}

// crypto.createHash("md5"|"sha1") — weak algorithm for security/integrity use.
function weakHashAlgorithm(node) {
  const callee = node.callee;
  if (callee?.type !== "MemberExpression" || callee.property?.name !== "createHash") return null;
  const arg0 = node.arguments?.[0];
  if (arg0?.type !== "Literal" || typeof arg0.value !== "string") return null;
  const algo = arg0.value.toLowerCase();
  return algo === "md5" || algo === "sha1" ? algo : null;
}

function fsSinkName(callee) {
  if (callee?.type !== "MemberExpression" || callee.property?.type !== "Identifier") return null;
  const objectName = callee.object?.type === "Identifier" ? callee.object.name : null;
  if ((objectName === "fs" || objectName === "fsp" || objectName === "fileSystem") && FS_SINKS.has(callee.property.name)) return callee.property.name;
  return null;
}

function isStringExpr(node) {
  if (!node) return false;
  if (node.type === "Literal") return typeof node.value === "string";
  if (node.type === "TemplateLiteral") return true;
  return node.type === "BinaryExpression" && node.operator === "+";
}

const REQUEST_OBJECTS = new Set(["http", "https", "axios", "got", "fetch", "request"]);
function isRequestCall(callee) {
  if (!callee) return false;
  if (callee.type === "Identifier") return callee.name === "fetch";
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
    const method = callee.property.name;
    const objectName = callee.object?.type === "Identifier" ? callee.object.name : null;
    if (["get", "request", "post", "fetch"].includes(method) && objectName && REQUEST_OBJECTS.has(objectName)) return true;
  }
  return false;
}

function isMathRandom(callee) {
  return callee?.type === "MemberExpression"
    && callee.object?.type === "Identifier" && callee.object.name === "Math"
    && callee.property?.name === "random";
}

function isDynamic(node) {
  if (!node) return false;
  if (node.type === "Literal") return false;
  if (node.type === "TemplateLiteral") return (node.expressions || []).length > 0;
  return node.type === "BinaryExpression" || node.type === "Identifier" || node.type === "CallExpression" || node.type === "MemberExpression";
}

function isCommandString(node) {
  if (!node) return false;
  if (node.type === "BinaryExpression" && node.operator === "+") return true;
  return node.type === "TemplateLiteral" && (node.expressions || []).length > 0;
}

// A path argument wrapped by path.join/resolve/normalize is considered sanitized.
function isPathWrapped(node) {
  if (node?.type !== "CallExpression") return false;
  const callee = node.callee;
  return callee?.type === "MemberExpression"
    && callee.object?.type === "Identifier" && callee.object.name === "path"
    && ["join", "resolve", "normalize"].includes(callee.property?.name);
}

function hasShellTrue(args = []) {
  for (const arg of args) {
    if (arg?.type !== "ObjectExpression") continue;
    for (const prop of arg.properties || []) {
      if (prop.type === "Property" && prop.key?.name === "shell" && prop.value?.type === "Literal" && prop.value.value === true) return true;
    }
  }
  return false;
}

const isTestOrFixture = (file) => /(^|\/)(tests?|__tests__|test-fixtures|fixtures)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);

function listSourceFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full, base));
    else if (CODE_FILE.test(entry.name)) out.push(path.relative(base, full));
  }
  return out.sort();
}
