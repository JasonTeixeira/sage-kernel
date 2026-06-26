import test from "node:test";
import assert from "node:assert/strict";
import { scanSastFile, scanSast } from "../packages/security/sast.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

const rules = (f) => f.map((x) => x.rule);

test("flags eval and new Function as high", () => {
  const f = scanSastFile("x.mjs", "eval(userInput); const g = new Function('return 1');");
  assert.ok(f.some((x) => x.rule === "dynamic-eval" && x.severity === "high"));
  assert.ok(f.some((x) => x.rule === "dynamic-function" && x.severity === "high"));
});

test("flags string-built shell command injection as high", () => {
  const f = scanSastFile("x.mjs", "import {execSync} from 'node:child_process'; execSync('rm ' + name);");
  assert.ok(f.some((x) => x.rule === "command-injection" && x.severity === "high"));
});

test("flags dynamic shell command as medium, not high", () => {
  const f = scanSastFile("x.mjs", "import {spawnSync} from 'node:child_process'; spawnSync(cmd, args, { shell: true });");
  assert.ok(f.some((x) => x.rule === "shell-dynamic-command" && x.severity === "medium"));
  assert.equal(f.some((x) => x.severity === "high"), false);
});

test("does NOT flag spawnSync with array args (no shell)", () => {
  const f = scanSastFile("x.mjs", "import {spawnSync} from 'node:child_process'; spawnSync('git', ['log']);");
  assert.equal(f.length, 0);
});

test("flags concatenated fs path but not path.join-wrapped paths", () => {
  const bad = scanSastFile("x.mjs", "import fs from 'node:fs'; fs.readFileSync(dir + '/' + name);");
  assert.ok(bad.some((x) => x.rule === "path-traversal" && x.severity === "medium"));
  const good = scanSastFile("x.mjs", "import fs from 'node:fs'; import path from 'node:path'; fs.readFileSync(path.join(dir, name));");
  assert.equal(good.some((x) => x.rule === "path-traversal"), false);
});

test("flags prototype pollution writes", () => {
  const f = scanSastFile("x.mjs", "target['__proto__'] = payload;");
  assert.ok(f.some((x) => x.rule === "prototype-pollution" && x.severity === "high"));
});

test("flags weak hash algorithms (md5/sha1) but not sha256", () => {
  const weak = scanSastFile("x.mjs", "import crypto from 'node:crypto'; crypto.createHash('md5'); crypto.createHash('sha1');");
  assert.equal(weak.filter((x) => x.rule === "weak-hash").length, 2);
  const strong = scanSastFile("x.mjs", "import crypto from 'node:crypto'; crypto.createHash('sha256');");
  assert.equal(strong.some((x) => x.rule === "weak-hash"), false);
});

test("scanSast passes when only mediums exist and reports counts", () => {
  // The kernel itself: only medium shell-dynamic-command findings, no highs.
  const report = scanSast({ root: process.cwd() });
  assert.equal(report.status, "passed");
  assert.equal(report.high, 0);
  assert.ok(report.filesScanned > 50);
});

test("flags timer string-eval, weak ciphers, SSRF, and insecure randomness", () => {
  assert.ok(scanSastFile("x.mjs", "setTimeout('doEvil()', 10)").some((f) => f.rule === "timer-string-eval" && f.severity === "high"));
  assert.ok(scanSastFile("x.mjs", "import c from 'node:crypto'; c.createCipher('aes', k)").some((f) => f.rule === "weak-cipher" && f.severity === "high"));
  assert.ok(scanSastFile("x.mjs", "fetch('http://api/' + userInput)").some((f) => f.rule === "ssrf" && f.severity === "medium"));
  assert.ok(scanSastFile("x.mjs", "const token = Math.random().toString(36)").some((f) => f.rule === "insecure-randomness" && f.severity === "medium"));
});

test("does NOT flag safe timer functions, literal URLs, or non-security randomness", () => {
  assert.equal(scanSastFile("x.mjs", "setTimeout(() => run(), 10)").length, 0);
  assert.equal(scanSastFile("x.mjs", "fetch('http://api/health')").length, 0);
  assert.equal(scanSastFile("x.mjs", "const jitter = Math.random() * 10").length, 0);
});

test("kernel.security.sast dispatches through the MCP tool layer", async () => {
  const report = await callKernelTool(process.cwd(), "kernel.security.sast", { projectPath: "." });
  assert.equal(report.status, "passed");
  assert.ok(Array.isArray(report.findings));
  assert.equal(typeof report.high, "number");
});
