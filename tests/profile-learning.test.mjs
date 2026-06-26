import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  recordProfileOverride,
  getProfileOverride,
  clearProfileOverride,
  detectProfileWithLearning,
  profileLearningStats,
  repoFingerprint
} from "../packages/profiles/profile-learning.mjs";
import { routeTask } from "../packages/agents/router.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

function tempProject(name = "learn-fixture") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-learn-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name, scripts: { test: "node --test" } }));
  return root;
}

test("with no override, detection is returned unchanged (source detected)", () => {
  const root = tempProject();
  const result = detectProfileWithLearning({ root });
  assert.equal(result.source, "detected");
  assert.equal(result.learned, false);
});

test("an operator override is remembered and wins over detection (source learned)", () => {
  const root = tempProject();
  const override = recordProfileOverride({ root, profile: "mcp-server", reason: "operator confirmed" });
  assert.equal(override.profile, "mcp-server");
  assert.deepEqual(getProfileOverride({ root }).profile, "mcp-server");

  const result = detectProfileWithLearning({ root });
  assert.equal(result.source, "learned");
  assert.equal(result.profile.id, "mcp-server");
  assert.equal(result.confidence, 99);
  assert.equal(result.profile.learned, true);
});

test("the override persists across calls and uses a stable per-repo fingerprint", () => {
  const root = tempProject("stable-app");
  assert.match(repoFingerprint({ root }), /^pkg:stable-app$/);
  recordProfileOverride({ root, profile: "backend-api" });
  assert.equal(detectProfileWithLearning({ root }).profile.id, "backend-api");
  assert.equal(detectProfileWithLearning({ root }).profile.id, "backend-api");
});

test("clearProfileOverride reverts to detection", () => {
  const root = tempProject();
  recordProfileOverride({ root, profile: "mcp-server" });
  assert.equal(detectProfileWithLearning({ root }).source, "learned");
  assert.equal(clearProfileOverride({ root }), true);
  assert.equal(detectProfileWithLearning({ root }).source, "detected");
});

test("learning stats track overrides and detection accuracy", () => {
  const root = tempProject();
  recordProfileOverride({ root, profile: "trading-system" }); // unlikely to match detection
  recordProfileOverride({ root, profile: "library" }); // may match
  const stats = profileLearningStats({ root });
  assert.equal(stats.overrides, 1); // same repo => one current override
  assert.equal(stats.totalFeedback, 2);
  assert.ok(stats.detectionAccuracy >= 0 && stats.detectionAccuracy <= 1);
});

test("rejects an unknown profile id", () => {
  const root = tempProject();
  assert.throws(() => recordProfileOverride({ root, profile: "not-a-real-profile" }), /Unknown profile id/);
});

test("the agent router respects the learned profile", () => {
  const root = tempProject("routed-app");
  recordProfileOverride({ root, profile: "mcp-server", reason: "operator" });
  const routed = routeTask({ root, goal: "Improve docs" });
  assert.equal(routed.profile, "mcp-server");
  assert.equal(routed.profileSource, "learned");
});

test("MCP kernel.profile.learn records an override through the dispatcher", async () => {
  const root = tempProject();
  const result = await callKernelTool(root, "kernel.profile.learn", { profile: "fintech-app", reason: "operator" });
  assert.equal(result.override.profile, "fintech-app");
  assert.equal(detectProfileWithLearning({ root }).profile.id, "fintech-app");
});
