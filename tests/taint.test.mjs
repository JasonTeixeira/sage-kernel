import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTaintFile } from "../packages/security/taint.mjs";
import { scanSast, scanSastFile } from "../packages/security/sast.mjs";

test("flags untrusted request input flowing to shell/eval/sql sinks", () => {
  assert.ok(analyzeTaintFile("x.mjs", "function h(req){ const c = req.body.cmd; execSync(c); }").some((f) => f.rule === "taint-shell" && f.severity === "high"));
  assert.ok(analyzeTaintFile("x.mjs", "function h(payload){ eval(payload); }").some((f) => f.rule === "taint-eval"));
  assert.ok(analyzeTaintFile("x.mjs", "function h(req){ db.query('select ' + req.params.id); }").some((f) => f.rule === "taint-sql"));
});

test("does NOT flag sanitized or trusted flows", () => {
  assert.equal(analyzeTaintFile("x.mjs", "function h(req){ fs.readFileSync(path.join(base, req.params.id)); }").length, 0);
  assert.equal(analyzeTaintFile("x.mjs", "const cmd = config.command; execSync(cmd);").length, 0);
  assert.equal(analyzeTaintFile("x.mjs", "function run(params){ db.query(params); }").length, 0); // bare param != untrusted
});

test("propagates taint through assignment chains", () => {
  const findings = analyzeTaintFile("x.mjs", "function h(request){ const a = request.query.q; const b = a; execSync(b); }");
  assert.ok(findings.some((f) => f.rule === "taint-shell"));
});

test("taint findings are folded into the SAST result, and the kernel has none", () => {
  const tainted = scanSastFile("x.mjs", "function h(req){ execSync(req.body.cmd); }");
  assert.ok(tainted.some((f) => f.rule === "taint-shell"));
  const kernel = scanSast({ root: process.cwd() });
  assert.equal(kernel.findings.some((f) => f.rule?.startsWith("taint-")), false);
  assert.equal(kernel.status, "passed");
});
