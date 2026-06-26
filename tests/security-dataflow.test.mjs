import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeInterprocedural, scanInterprocedural } from "../packages/security/dataflow.mjs";

test("cross-file taint: untrusted input in A flows to a sink in imported B", () => {
  const files = [
    { path: "handler.mjs", content: "import { runCmd } from './exec.mjs';\nexport function handle(req){ runCmd(req.body.cmd); }\n" },
    { path: "exec.mjs", content: "export function runCmd(cmd){ execSync(cmd); }\n" }
  ];
  const { findings } = analyzeInterprocedural(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "interprocedural-taint");
  assert.equal(findings[0].sinkFile, "exec.mjs");
  assert.equal(findings[0].depth, 2);
});

test("sanitized cross-file flow is NOT flagged", () => {
  const files = [
    { path: "handler.mjs", content: "import { runCmd } from './exec.mjs';\nexport function handle(req){ const safe = sanitize(req.body.cmd); runCmd(safe); }\n" },
    { path: "exec.mjs", content: "export function runCmd(cmd){ execSync(cmd); }\n" }
  ];
  assert.equal(analyzeInterprocedural(files).findings.length, 0);
});

test("a trusted (non-source) param forwarded to a sink is NOT flagged", () => {
  const files = [
    { path: "a.mjs", content: "import { runCmd } from './exec.mjs';\nexport function build(name){ runCmd(name); }\n" },
    { path: "exec.mjs", content: "export function runCmd(cmd){ execSync(cmd); }\n" }
  ];
  assert.equal(analyzeInterprocedural(files).findings.length, 0);
});

test("untrusted forwarded to a NON-sink imported function is NOT flagged", () => {
  const files = [
    { path: "handler.mjs", content: "import { log } from './util.mjs';\nexport function handle(req){ log(req.body.cmd); }\n" },
    { path: "util.mjs", content: "export function log(msg){ console.log(msg); }\n" }
  ];
  assert.equal(analyzeInterprocedural(files).findings.length, 0);
});

test("cross-file SQL sink (db.query) is detected", () => {
  const files = [
    { path: "route.mjs", content: "import { lookup } from './db.mjs';\nexport function route(req){ lookup(req.params.id); }\n" },
    { path: "db.mjs", content: "export function lookup(id){ db.query('select ' + id); }\n" }
  ];
  assert.equal(analyzeInterprocedural(files).findings.length, 1);
});

test("the depth limit is reported honestly", () => {
  assert.equal(analyzeInterprocedural([]).depthLimit, 2);
  assert.match(analyzeInterprocedural([]).note, /depth/);
});

test("E2E on a real tree: scanInterprocedural finds the cross-file chain on disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-df-"));
  fs.writeFileSync(path.join(root, "exec.mjs"), "export function runCmd(cmd){ execSync(cmd); }\n");
  fs.writeFileSync(path.join(root, "handler.mjs"), "import { runCmd } from './exec.mjs';\nexport function handle(req){ runCmd(req.body.cmd); }\n");
  const result = scanInterprocedural({ root });
  assert.equal(result.status, "failed");
  assert.equal(result.high, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the kernel has no interprocedural-taint findings (stays 0-high)", () => {
  const result = scanInterprocedural({ root: process.cwd() });
  assert.equal(result.high, 0, JSON.stringify(result.findings.slice(0, 5)));
});
