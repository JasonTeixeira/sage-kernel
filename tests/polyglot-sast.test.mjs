import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanPolyglotFile, scanPolyglot } from "../packages/security/polyglot-sast.mjs";

test("python: flags command injection, eval/exec, and insecure deserialization", () => {
  const rules = (src) => scanPolyglotFile("a.py", src).map((f) => f.rule);
  assert.ok(rules("import os\nos.system(cmd)\n").includes("py-command-injection"));
  assert.ok(rules("subprocess.run(cmd, shell=True)\n").includes("py-command-injection"));
  assert.ok(rules("eval(user_input)\n").includes("py-dynamic-eval"));
  assert.ok(rules("import pickle\npickle.loads(data)\n").includes("py-insecure-deserialization"));
  assert.ok(rules("yaml.load(stream)\n").includes("py-insecure-deserialization"));
  assert.ok(rules("requests.get(url, verify=False)\n").includes("py-tls-verification-disabled"));
  assert.ok(rules("hashlib.md5(x)\n").includes("py-weak-hash"));
});

test("python: does not flag safe idioms", () => {
  assert.equal(scanPolyglotFile("a.py", "subprocess.run([\"ls\", \"-l\"])\n").length, 0);
  assert.equal(scanPolyglotFile("a.py", "yaml.load(stream, Loader=yaml.SafeLoader)\n").length, 0);
  assert.equal(scanPolyglotFile("a.py", "hashlib.sha256(x)\n").length, 0);
  assert.equal(scanPolyglotFile("a.py", "# eval(x) in a comment\n").length, 0);
});

test("swift: flags shell interpolation, insecure webview, and weak hash", () => {
  const rules = (src) => scanPolyglotFile("a.swift", src).map((f) => f.rule);
  assert.ok(rules("task.arguments = [\"/bin/sh\", \"-c\", \"\\(userCmd)\"]\n").includes("swift-command-injection"));
  assert.ok(rules("let w = UIWebView()\n").includes("swift-insecure-webview"));
  assert.ok(rules("let h = Insecure.MD5.hash(data: d)\n").includes("swift-weak-hash"));
  assert.ok(rules("query[kSecAttrAccessibleAlways] = true\n").includes("swift-insecure-keychain"));
});

test("swift: does not flag safe idioms", () => {
  assert.equal(scanPolyglotFile("a.swift", "let w = WKWebView()\n").length, 0);
  assert.equal(scanPolyglotFile("a.swift", "let h = SHA256.hash(data: d)\n").length, 0);
});

test("scanPolyglot walks a tree, reports languages, and fails on a high finding", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-poly-"));
  fs.writeFileSync(path.join(root, "app.py"), "os.system(cmd)\n");
  fs.writeFileSync(path.join(root, "View.swift"), "let w = WKWebView()\n");
  const report = scanPolyglot({ root });
  assert.equal(report.status, "failed");
  assert.equal(report.high, 1);
  assert.deepEqual(report.languages.sort(), ["python", "swift"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("scanPolyglot folds in an external deep scanner when provided", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-poly-ext-"));
  fs.writeFileSync(path.join(root, "ok.py"), "x = 1\n");
  const deepRunner = () => [{ rule: "bandit-B602", severity: "medium", language: "python", file: "ok.py", line: 1, message: "from bandit" }];
  const report = scanPolyglot({ root, deepRunner });
  assert.ok(report.findings.some((f) => f.source === "external" && f.rule === "bandit-B602"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("the kernel repo has no high-severity polyglot findings", () => {
  const report = scanPolyglot({ root: process.cwd() });
  assert.equal(report.status, "passed");
  assert.equal(report.high, 0);
});
