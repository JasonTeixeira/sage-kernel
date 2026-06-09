import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");

test("template scaffold emits a runnable worker-service blueprint", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "sage-scaffold-"));
  const result = spawnSync(
    "node",
    ["packages/templates/scripts/template-scaffold-v2.mjs", "--template", "worker-service", "--name", "Queue Ops", "--out", out],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const projectDir = path.join(out, "queue-ops");
  assert.equal(fs.existsSync(path.join(projectDir, "package.json")), true);
  assert.equal(fs.existsSync(path.join(projectDir, ".sage/project-plan.json")), true);
  assert.equal(fs.existsSync(path.join(projectDir, "src/worker.mjs")), true);

  const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(pkg.scripts.qa, "npm run lint && npm test");
});
