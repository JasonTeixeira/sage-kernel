// Taint analysis (cat 13): intra-procedural source -> sink dataflow. Flags when
// untrusted input (req/body/query/params, process.env/argv) reaches a dangerous
// sink (shell exec, eval/Function, SQL query) without passing through a
// sanitizer (path.join/resolve, parseInt/Number, escape/sanitize/validate, zod).
// Conservative + evidence-backed: only flags a real tainted-name reaching a sink.

import { safeParse, walkAst, collectNodes, nodeLine } from "../ast/parse.mjs";

// Genuinely-external untrusted inputs only. `req`/`request` cover req.body/query/
// params (tainted via the object). Bare query/params/body/args are NOT sources
// (too common in non-web code). Operator-controlled process.env is left to the
// existing shell-dynamic-command rule rather than double-flagged here.
const SOURCE_NAME = /^(req|request|userinput|untrusted|payload)$/i;
const SANITIZERS = /^(parseInt|parseFloat|Number|encodeURIComponent|escape|sanitize|validate|clean|join|resolve|normalize)$/i;
const SQL_SINKS = new Set(["query", "execute", "raw"]);
// Filesystem read/write sinks: a request-tainted path reaching these is a path
// traversal / arbitrary file access risk (unless wrapped in a sanitizer).
const FS_PATH_SINKS = new Set(["readFile", "readFileSync", "writeFile", "writeFileSync", "createReadStream", "createWriteStream", "appendFile", "appendFileSync", "unlink", "unlinkSync"]);
// Dynamic code-execution member sinks (vm.*) — tainted source reaching these is eval-equivalent.
const VM_EXEC_SINKS = new Set(["runInNewContext", "runInThisContext", "runInContext", "compileFunction"]);

export function analyzeTaintFile(relPath, source) {
  const ast = safeParse(source);
  if (!ast) return [];
  const findings = [];
  const at = (node) => `${relPath}:${nodeLine(node) ?? "?"}`;
  const scopes = [ast, ...collectNodes(ast, "FunctionDeclaration"), ...collectNodes(ast, "FunctionExpression"), ...collectNodes(ast, "ArrowFunctionExpression")];
  for (const scope of scopes) analyzeScope(scope, findings, at);
  // De-dup by evidence (a sink can appear under both Program and its function scope).
  const seen = new Set();
  return findings.filter((finding) => (seen.has(finding.evidence) ? false : seen.add(finding.evidence)));
}

function analyzeScope(scope, findings, at) {
  const tainted = new Set();
  // Seed: parameters named like an untrusted source.
  for (const param of scope.params || []) {
    if (param.type === "Identifier" && SOURCE_NAME.test(param.name)) tainted.add(param.name);
  }
  // Normalize a scope's statements: Program.body is already an array; a function
  // body is a BlockStatement (.body) or, for arrows, a single expression.
  const body = scope.type === "Program"
    ? (scope.body || [])
    : scope.body?.type === "BlockStatement"
      ? scope.body.body
      : scope.body
        ? [{ type: "ExpressionStatement", expression: scope.body }]
        : [];
  // Propagate taint through declarations/assignments, then detect sink usage.
  walkAst({ type: "Program", body }, {
    VariableDeclarator(node) {
      if (node.id?.type === "Identifier" && node.init && referencesTaint(node.init, tainted)) tainted.add(node.id.name);
    },
    AssignmentExpression(node) {
      if (node.left?.type === "Identifier" && referencesTaint(node.right, tainted)) tainted.add(node.left.name);
    }
  });
  walkAst({ type: "Program", body }, {
    CallExpression(node) {
      const sink = sinkKind(node.callee, node.arguments);
      if (!sink) return;
      const arg = sink === "sql" ? node.arguments?.[0] : node.arguments?.[0];
      if (arg && referencesTaint(arg, tainted) && !wrappedInSanitizer(arg)) {
        findings.push({ severity: "high", rule: `taint-${sink}`, message: `Untrusted input reaches a ${sink} sink without sanitization.`, evidence: at(node), recommendation: "Validate/allowlist or sanitize the value before the sink." });
      }
    }
  });
}

// True if the expression subtree references a tainted name or a known source member.
function referencesTaint(node, tainted) {
  let hit = false;
  walkAst({ type: "Program", body: [{ type: "ExpressionStatement", expression: node }] }, {
    Identifier(id) { if (tainted.has(id.name) || SOURCE_NAME.test(id.name)) hit = true; }
  });
  return hit;
}

function wrappedInSanitizer(node) {
  // arg is itself a sanitizer call, e.g. path.join(...) / parseInt(...) / sanitize(...)
  if (node?.type !== "CallExpression") return false;
  const callee = node.callee;
  const name = callee?.type === "Identifier" ? callee.name : callee?.type === "MemberExpression" ? callee.property?.name : null;
  return Boolean(name && SANITIZERS.test(name));
}

function sinkKind(callee, args) {
  if (!callee) return null;
  if (callee.type === "Identifier") {
    if (callee.name === "eval" || callee.name === "Function") return "eval";
    if (callee.name === "exec" || callee.name === "execSync") return "shell";
    if ((callee.name === "spawn" || callee.name === "spawnSync") && hasShellTrue(args)) return "shell";
  }
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
    const prop = callee.property.name;
    if (SQL_SINKS.has(prop)) return "sql";
    if (FS_PATH_SINKS.has(prop)) return "path";
    if (VM_EXEC_SINKS.has(prop)) return "eval";
  }
  return null;
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
