import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SDLC_PROFILES, detectProjectProfile, proveProfiles } from "../packages/profiles/project-detector.mjs";
import { createProfileProofFixtures } from "../packages/profiles/profile-fixtures.mjs";

const root = process.cwd();

function detectFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-breadth-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    return detectProjectProfile({ root: path.dirname(dir), projectPath: path.basename(dir) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("profile taxonomy is internally consistent (unique ids, complete schema)", () => {
  const ids = SDLC_PROFILES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "profile ids must be unique");
  for (const profile of SDLC_PROFILES) {
    assert.ok(profile.title && profile.requiredChecks.length > 0 && profile.commands.length > 0, `incomplete profile: ${profile.id}`);
  }
});

test("the new high-value profiles win primary over the language they share", () => {
  // Electron+React must read as desktop-app, not web-app.
  assert.equal(detectFixture({
    "package.json": JSON.stringify({ name: "d", dependencies: { electron: "latest", react: "latest" } }),
    "src/main.ts": "import { app } from 'electron';\n"
  }).profile.id, "desktop-app");

  // Astro must read as static-site, not web-app.
  assert.equal(detectFixture({
    "package.json": JSON.stringify({ name: "s", dependencies: { astro: "latest" } }),
    "astro.config.mjs": "export default {}\n"
  }).profile.id, "static-site");

  // torch in requirements must read as ml-training, not data-pipeline/library.
  assert.equal(detectFixture({ "requirements.txt": "torch\n", "train.py": "import torch\n" }).profile.id, "ml-training");

  // A .sol contract with hardhat must read as smart-contract.
  assert.equal(detectFixture({
    "package.json": JSON.stringify({ name: "c", devDependencies: { hardhat: "latest" } }),
    "contracts/T.sol": "contract T {}\n"
  }).profile.id, "smart-contract");

  // Phaser must read as game.
  assert.equal(detectFixture({
    "package.json": JSON.stringify({ name: "g", dependencies: { phaser: "latest" } })
  }).profile.id, "game");
});

test("every fixture detects to its expected profile (recall = 1.0 across the corpus)", () => {
  const report = proveProfiles({ root });
  assert.equal(report.status, "passed");
  const expectedProfiles = new Set(createProfileProofFixtures().map((f) => f.expected));
  // Breadth: the corpus covers at least the 5 newly added profiles.
  for (const id of ["desktop-app", "static-site", "game", "ml-training", "smart-contract"]) {
    assert.ok(expectedProfiles.has(id), `no fixture covers ${id}`);
  }
});
