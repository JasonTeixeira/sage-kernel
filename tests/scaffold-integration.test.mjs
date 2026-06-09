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

test("golden blueprints emit production readiness artifacts across app types", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "sage-blueprints-"));
  const templates = ["next-saas-app", "next-ai-app", "fastapi-service", "worker-service", "expo-mobile-app"];

  for (const template of templates) {
    const name = `Golden ${template}`;
    const result = spawnSync(
      "node",
      ["packages/templates/scripts/template-scaffold-v2.mjs", "--template", template, "--name", name, "--out", out],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(result.status, 0, `${template}: ${result.stderr || result.stdout}`);
    const projectDir = path.join(out, name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
    for (const file of [
      ".github/workflows/ci.yml",
      ".sage/project-plan.json",
      "Dockerfile",
      "docs/architecture.md",
      "docs/runbook.md",
      "src/env.example.mjs",
      "tests/health.test.mjs"
    ]) {
      assert.equal(fs.existsSync(path.join(projectDir, file)), true, `${template} missing ${file}`);
    }
    const plan = JSON.parse(fs.readFileSync(path.join(projectDir, ".sage/project-plan.json"), "utf8"));
    assert.equal(plan.productionReadiness.docker, true, `${template} missing docker readiness`);
    assert.equal(plan.productionReadiness.ci, true, `${template} missing ci readiness`);
    assert.equal(plan.productionReadiness.envValidation, true, `${template} missing env validation readiness`);
  }
});
