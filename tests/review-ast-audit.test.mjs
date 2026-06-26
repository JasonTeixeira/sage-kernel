import test from "node:test";
import assert from "node:assert/strict";
import { auditSourceFile, astFindingsByCategory } from "../packages/review/ast-audit.mjs";

const rules = (findings) => findings.map((f) => f.message);

test("flags eval and new Function as security findings", () => {
  const f = auditSourceFile("x.mjs", "eval('1+1'); const g = new Function('return 1');");
  const sec = astFindingsByCategory(f).security;
  assert.ok(sec.some((x) => /eval\(\)/.test(x.message)));
  assert.ok(sec.some((x) => /new Function/.test(x.message)));
  assert.ok(sec.every((x) => x.severity === "high"));
});

test("flags string-built shell commands as high (injection)", () => {
  const f = auditSourceFile("x.mjs", "import {execSync} from 'node:child_process'; execSync('git log ' + userInput);");
  assert.ok(f.some((x) => /injection risk/.test(x.message) && x.severity === "high" && x.category === "security"));
});

test("flags a trusted variable through a shell as a medium smell", () => {
  const f = auditSourceFile("x.mjs", "import {execSync} from 'node:child_process'; const cmd = trusted; execSync(cmd);");
  assert.ok(f.some((x) => /shell/.test(x.message) && x.severity === "medium" && x.category === "security"));
});

test("does NOT flag execSync with a literal command", () => {
  const f = auditSourceFile("x.mjs", "import {execSync} from 'node:child_process'; execSync('ls -la');");
  assert.equal(f.some((x) => x.category === "security"), false);
});

test("does NOT flag spawnSync with array args and no shell", () => {
  const f = auditSourceFile("x.mjs", "import {spawnSync} from 'node:child_process'; spawnSync(bin, ['--version']);");
  assert.equal(f.some((x) => x.category === "security"), false);
});

test("flags undocumented empty catch blocks but not documented ones", () => {
  const f = auditSourceFile("x.mjs", "try { risky(); } catch (e) {}");
  assert.ok(f.some((x) => /Empty, undocumented catch/.test(x.message) && x.severity === "medium"));
  const documented = auditSourceFile("x.mjs", "try { risky(); } catch (e) { /* best-effort */ }");
  assert.equal(documented.some((x) => /catch/.test(x.message)), false);
});

test("flags non-strict equality but not == null", () => {
  const flagged = auditSourceFile("x.mjs", "if (a == b) {}");
  assert.ok(flagged.some((x) => /Non-strict equality/.test(x.message)));
  const allowed = auditSourceFile("x.mjs", "if (a == null) {}");
  assert.equal(allowed.some((x) => /Non-strict equality/.test(x.message)), false);
});

test("flags unused locals but not used or exported ones", () => {
  const unused = auditSourceFile("x.mjs", "const dead = 1; doThing();");
  assert.ok(unused.some((x) => /Unused local "dead"/.test(x.message)));
  const used = auditSourceFile("x.mjs", "const live = 1; use(live);");
  assert.equal(used.some((x) => /Unused local/.test(x.message)), false);
  const exported = auditSourceFile("x.mjs", "export const api = 1;");
  assert.equal(exported.some((x) => /Unused local/.test(x.message)), false);
});

test("returns no findings on unparseable source (heuristic fallback)", () => {
  assert.deepEqual(auditSourceFile("x.mjs", "const = ;; (("), []);
});
