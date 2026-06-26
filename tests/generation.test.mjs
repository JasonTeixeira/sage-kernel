import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generate } from "../packages/generation/engine.mjs";
import { proveGenerated, commitGeneratedIfProven } from "../packages/generation/gate.mjs";
import { scanSast } from "../packages/security/sast.mjs";
import { buildGenerationSpec } from "../packages/intake/contract.mjs";
import { synthesizePrd } from "../packages/intake/prd.mjs";
import { deriveArchitecture } from "../packages/intake/design.mjs";

function specFor(idea, profile) {
  const prd = synthesizePrd(idea, profile);
  return buildGenerationSpec(prd, deriveArchitecture(prd, profile), profile);
}

test("deterministic spec -> expected files (modules + index + readme)", () => {
  const spec = specFor("payments service", "payments-system");
  const files = generate(spec).files;
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes("src/index.mjs"));
  assert.ok(paths.includes("README.md"));
  assert.ok(paths.some((p) => p.startsWith("src/") && p.endsWith(".mjs") && p !== "src/index.mjs"));
});

test("generated code is clean and the gate ACCEPTS it", () => {
  const out = generate(specFor("payments service", "payments-system"));
  const verdict = proveGenerated(out.files);
  assert.equal(verdict.accepted, true, JSON.stringify(verdict.findings));
  assert.equal(verdict.high, 0);
  assert.deepEqual(verdict.unparseable, []);
});

test("the gate REJECTS generated code with an injected high-severity vulnerability", () => {
  const out = generate(specFor("payments service", "payments-system"));
  const poisoned = out.files.map((f) =>
    f.path === "src/index.mjs" ? { ...f, content: `${f.content}\nexport function pwn(req){ execSync(req.body.cmd); }\n` } : f
  );
  const verdict = proveGenerated(poisoned);
  assert.equal(verdict.accepted, false);
  assert.ok(verdict.high >= 1);
  assert.match(verdict.reason, /high-severity/);
});

test("the gate REJECTS generated code that does not parse", () => {
  const verdict = proveGenerated([{ path: "src/broken.mjs", content: "export function x( {" }]);
  assert.equal(verdict.accepted, false);
  assert.deepEqual(verdict.unparseable, ["src/broken.mjs"]);
});

test("reject leaves the target untouched (no debt written)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-gen-"));
  const poisoned = [{ path: "src/bad.mjs", content: "export function h(req){ eval(req.body.x); }\n" }];
  const result = commitGeneratedIfProven(poisoned, root);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.written, []);
  assert.equal(fs.existsSync(path.join(root, "src/bad.mjs")), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("E2E: generate -> prove ACCEPT -> commit -> independent scan finds 0 high", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-gen-e2e-"));
  const out = generate(specFor("expo fitness tracker", "mobile-app"));
  const result = commitGeneratedIfProven(out.files, root);
  assert.equal(result.accepted, true, JSON.stringify(result.findings));
  assert.ok(result.written.length >= 2);
  // Independent verification on the actually-written files.
  const scan = scanSast({ root });
  assert.equal(scan.high, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("generate throws on an invalid spec (never produces files from garbage)", () => {
  assert.throws(() => generate({ name: "x" }), /invalid generation spec/);
});
