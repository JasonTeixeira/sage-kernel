// Polyglot SAST (cat 12 language coverage + cat 13 security). Pattern-level
// static analysis for languages the kernel does not bundle a full AST parser for
// (Python, Swift). This is deliberately line/pattern based — the same honest
// starting point the JS engine had before its AST upgrade — and is calibrated for
// low false positives: only genuinely dangerous constructs are flagged.
//
// An optional external deep scanner (bandit/semgrep) can be folded in via the
// `deepRunner` option; the built-in layer is the always-available floor so the
// gate is deterministic and self-contained.

import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated", ".venv", "venv", "__pycache__", ".next"]);

const PYTHON_RULES = [
  { rule: "py-command-injection", severity: "high", test: (l) => /\bos\.(system|popen)\s*\(/.test(l) || /subprocess\.(run|call|Popen|check_output)\s*\([^)]*shell\s*=\s*True/.test(l), message: "Shell command execution (os.system / os.popen / shell=True) — command injection risk." },
  { rule: "py-dynamic-eval", severity: "high", test: (l) => /(^|[^.\w])(eval|exec)\s*\(/.test(l) && !/#.*\b(eval|exec)\b/.test(l) && !/\bdef\s+(eval|exec)\s*\(/.test(l), message: "Dynamic code execution (eval/exec)." },
  { rule: "py-dynamic-import", severity: "high", test: (l) => /\b__import__\s*\(\s*[^'")\s]/.test(l), message: "Dynamic __import__() with a non-literal name — arbitrary module load." },
  { rule: "py-ssti", severity: "high", test: (l) => /\brender_template_string\s*\(\s*[^'")\s]/.test(l), message: "render_template_string with a non-literal template — server-side template injection (SSTI)." },
  { rule: "py-insecure-deserialization", severity: "high", test: (l) => /\bpickle\.(loads?|Unpickler)\s*\(/.test(l) || /\byaml\.load\s*\((?![^)]*SafeLoader)/.test(l), message: "Insecure deserialization (pickle / yaml.load without SafeLoader)." },
  { rule: "py-tls-verification-disabled", severity: "high", test: (l) => /verify\s*=\s*False/.test(l), message: "TLS certificate verification disabled (verify=False)." },
  { rule: "py-weak-hash", severity: "medium", test: (l) => /hashlib\.(md5|sha1)\s*\(/.test(l), message: "Weak hash (md5/sha1) — use sha256+ for security contexts." },
  { rule: "py-debug-enabled", severity: "medium", test: (l) => /\.run\s*\([^)]*debug\s*=\s*True/.test(l), message: "Web server debug mode enabled in code." }
];

const SWIFT_RULES = [
  { rule: "swift-command-injection", severity: "high", test: (l) => /\/bin\/(sh|bash)/.test(l) && /\\\(/.test(l), message: "Shell invocation with string interpolation — command injection risk." },
  { rule: "swift-insecure-webview", severity: "medium", test: (l) => /\bUIWebView\b/.test(l), message: "Deprecated, insecure UIWebView — use WKWebView." },
  { rule: "swift-weak-hash", severity: "medium", test: (l) => /Insecure\.(MD5|SHA1)/.test(l) || /\bCC_MD5\s*\(/.test(l), message: "Weak hash (MD5/SHA1)." },
  { rule: "swift-insecure-keychain", severity: "medium", test: (l) => /kSecAttrAccessibleAlways\b/.test(l), message: "Keychain item accessible when locked (kSecAttrAccessibleAlways)." },
  { rule: "swift-webview-html-injection", severity: "medium", test: (l) => /loadHTMLString\s*\([^)]*\\\(/.test(l), message: "WebView HTML built with interpolation — injection risk." }
];

const RULES_BY_EXT = { ".py": PYTHON_RULES, ".swift": SWIFT_RULES };
const LANG_BY_EXT = { ".py": "python", ".swift": "swift" };

export function scanPolyglotFile(relPath, source) {
  const ext = path.extname(relPath);
  const rules = RULES_BY_EXT[ext];
  if (!rules) return [];
  const language = LANG_BY_EXT[ext];
  const findings = [];
  const lines = String(source).split("\n");
  lines.forEach((line, index) => {
    const code = line.replace(/#.*$|\/\/.*$/, ""); // drop trailing comments
    if (!code.trim()) return;
    for (const rule of rules) {
      if (rule.test(code)) findings.push({ rule: rule.rule, severity: rule.severity, language, file: relPath, line: index + 1, message: rule.message });
    }
  });
  return findings;
}

function listPolyglotFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPolyglotFiles(full, base));
    else if (RULES_BY_EXT[path.extname(entry.name)]) out.push(path.relative(base, full));
  }
  return out.sort();
}

const isTestOrFixture = (file) => /(^|\/)(tests?|__tests__|test-fixtures|fixtures)\//.test(file) || /_test\.(py|swift)$|test_.*\.py$/.test(file);

export function scanPolyglot(options = {}) {
  const root = options.root || process.cwd();
  const includeFixtures = options.includeFixtures === true;
  const files = options.files || listPolyglotFiles(root);
  const findings = [];
  for (const rel of files) {
    if (!includeFixtures && isTestOrFixture(rel)) continue;
    let source;
    try {
      source = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    for (const finding of scanPolyglotFile(rel, source)) findings.push({ ...finding, source: "builtin" });
  }
  // Optional: fold in an external deep scanner (bandit/semgrep) when provided.
  if (typeof options.deepRunner === "function") {
    for (const finding of options.deepRunner({ root, files }) || []) findings.push({ ...finding, source: "external" });
  }
  const high = findings.filter((f) => f.severity === "high" || f.severity === "critical").length;
  return {
    status: high > 0 ? "failed" : "passed",
    languages: [...new Set(files.map((f) => LANG_BY_EXT[path.extname(f)]).filter(Boolean))],
    filesScanned: files.length,
    high,
    findings,
    summary: { high, medium: findings.filter((f) => f.severity === "medium").length, total: findings.length }
  };
}
