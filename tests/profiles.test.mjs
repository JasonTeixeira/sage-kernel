import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  detectProjectProfile,
  generateDefinitionOfDone,
  proveProfilePaths,
  proveProfiles,
  validateSdlcProfiles
} from "../packages/profiles/project-detector.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-profile-fixture-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return dir;
}

test("project detector identifies web, backend, mcp, mobile, infra, and monorepo profiles", () => {
  const web = fixture({
    "package.json": JSON.stringify({ name: "web", dependencies: { next: "1", react: "1" }, scripts: { test: "node --test", build: "next build" } }),
    "next.config.mjs": "export default {}\n",
    "tests/app.test.js": "test('ok', () => {})\n"
  });
  assert.equal(detectProjectProfile({ root: web }).profile.id, "web-app");

  const api = fixture({
    "pyproject.toml": "[project]\ndependencies = ['fastapi']\n",
    "app/main.py": "from fastapi import FastAPI\n",
    "tests/test_main.py": "def test_ok(): assert True\n"
  });
  const apiProfile = detectProjectProfile({ root: api });
  assert.equal(apiProfile.profile.id, "backend-api");
  assert.deepEqual(apiProfile.languages, ["python"]);
  assert.equal(apiProfile.frameworks.includes("fastapi"), true);

  const mcp = fixture({
    "package.json": JSON.stringify({ name: "mcp", dependencies: { "@modelcontextprotocol/sdk": "1" }, scripts: { "mcp:smoke": "node smoke.mjs" } }),
    "apps/mcp-server/tools.json": JSON.stringify({ tools: [] })
  });
  assert.equal(detectProjectProfile({ root: mcp }).profile.id, "mcp-server");

  const mobile = fixture({
    "package.json": JSON.stringify({ name: "mobile", dependencies: { expo: "1", "react-native": "1" } }),
    "app.json": "{}\n"
  });
  assert.equal(detectProjectProfile({ root: mobile }).profile.id, "mobile-app");

  const infra = fixture({
    "package.json": JSON.stringify({ name: "infra" }),
    "Dockerfile": "FROM node:22\n",
    "infra/main.tf": "terraform {}\n"
  });
  assert.equal(detectProjectProfile({ root: infra }).profile.id, "infrastructure");

  const mono = fixture({
    "package.json": JSON.stringify({ name: "mono", workspaces: ["packages/*"] }),
    "packages/a/package.json": JSON.stringify({ name: "a" })
  });
  const monoProfile = detectProjectProfile({ root: mono });
  assert.equal(monoProfile.projectTypes.includes("monorepo"), true);
  assert.equal(monoProfile.secondaryProfiles.some((profile) => profile.id === "monorepo") || monoProfile.profile.id === "monorepo", true);
});

test("definition of done combines detected profiles, risk, commands, and stop conditions", () => {
  const web = fixture({
    "package.json": JSON.stringify({ name: "web", dependencies: { vite: "1", react: "1" }, scripts: { test: "node --test" } }),
    "vite.config.js": "export default {}\n"
  });
  const done = generateDefinitionOfDone({
    objective: "Add authenticated settings page.",
    projectPath: ".",
    risk: "high"
  }, { root: web });
  assert.equal(done.profile, "web-app");
  assert.equal(done.rollback.required, true);
  assert.equal(done.requiredChecks.includes("security review"), true);
  assert.equal(done.evidenceRequired.includes("browser proof"), true);

  const fallback = generateDefinitionOfDone({ profile: "cli-tool", risk: "invalid" }, { root });
  assert.equal(fallback.profile, "cli-tool");
  assert.equal(fallback.risk, "medium");
});

test("profile validation and proof scripts expose deterministic gates", () => {
  assert.equal(validateSdlcProfiles().status, "passed");
  const fixtureProof = proveProfiles({ root });
  assert.equal(fixtureProof.status, "passed");
  assert.equal(fixtureProof.results.length, 21);
  const pathProof = proveProfilePaths({ paths: ["."] }, { root });
  assert.equal(pathProof.status, "passed");
  assert.equal(pathProof.mode, "explicit-paths");
  assert.equal(pathProof.results[0].profile, "mcp-server");

  const validate = spawnSync("node", ["packages/profiles/scripts/profiles-validate.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(validate.status, 0, validate.stderr || validate.stdout);
  assert.equal(JSON.parse(validate.stdout).status, "passed");

  const prove = spawnSync("node", ["packages/profiles/scripts/profiles-prove.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(prove.status, 0, prove.stderr || prove.stdout);
  assert.equal(JSON.parse(prove.stdout).status, "passed");

  const provePaths = spawnSync("node", ["packages/profiles/scripts/profiles-prove-paths.mjs", "."], { cwd: root, encoding: "utf8" });
  assert.equal(provePaths.status, 0, provePaths.stderr || provePaths.stdout);
  assert.equal(JSON.parse(provePaths.stdout).status, "passed");
});

test("CLI and MCP expose profile detection and definition of done", async () => {
  const cli = spawnSync("node", ["bin/sage.mjs", "profile", "detect", ".", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const detected = JSON.parse(cli.stdout);
  assert.equal(detected.project.name, "sage-kernel");
  assert.equal(detected.projectTypes.includes("mcp-server"), true);

  const doneCli = spawnSync("node", ["bin/sage.mjs", "done", "generate", ".", "--objective=Ship Program 2", "--risk=high", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(doneCli.status, 0, doneCli.stderr || doneCli.stdout);
  const done = JSON.parse(doneCli.stdout);
  assert.equal(done.risk, "high");
  assert.equal(done.project.name, "sage-kernel");

  const mcpDetected = await callKernelTool(root, "kernel.profile.detect", { projectPath: "." });
  assert.equal(mcpDetected.project.name, "sage-kernel");
  const mcpDone = await callKernelTool(root, "kernel.done.generate", { projectPath: ".", objective: "Prove Program 2", risk: "high" });
  assert.equal(mcpDone.risk, "high");
  await assert.rejects(() => callKernelTool(root, "kernel.done.generate", { profile: "missing" }), /Unknown SDLC profile/);
});
