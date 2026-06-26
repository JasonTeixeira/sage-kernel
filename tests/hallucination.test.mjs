import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeHallucinationRate, scanReports } from "../packages/proof/hallucination.mjs";
import { createScoreCaps } from "../packages/score/scoreboard.mjs";
import { recordProof } from "../packages/proof/ledger.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-hallu-"));
}

test("an unbacked success claim is a hallucination (rate 1)", () => {
  const root = tempRoot();
  const result = computeHallucinationRate("The release is done and shipped.", { root });
  assert.equal(result.totalClaims >= 1, true);
  assert.equal(result.hallucinatedClaims >= 1, true);
  assert.equal(result.rate, 1);
});

test("a proof-backed success claim is not a hallucination (rate 0)", () => {
  const root = tempRoot();
  const proof = recordProof({ tool: "npm test", status: "passed" }, { root });
  const result = computeHallucinationRate(`All tests passed [${proof.proofId}].`, { root });
  assert.equal(result.supportedClaims, 1);
  assert.equal(result.hallucinatedClaims, 0);
  assert.equal(result.rate, 0);
});

test("a mixed report yields a partial hallucination rate", () => {
  const root = tempRoot();
  const proof = recordProof({ tool: "npm test", status: "passed" }, { root });
  const text = [`All tests passed [${proof.proofId}].`, "The feature is complete and secure."].join("\n");
  const result = computeHallucinationRate(text, { root });
  assert.equal(result.supportedClaims, 1);
  assert.ok(result.hallucinatedClaims >= 1);
  assert.ok(result.rate > 0 && result.rate < 1);
});

test("external (public release / client connection) claims count as hallucinations", () => {
  const root = tempRoot();
  const result = computeHallucinationRate("sage-kernel is published to npm and connected to Claude Desktop.", { root });
  assert.ok(result.hallucinatedClaims >= 1);
  assert.equal(result.rate, 1);
});

test("imperative and future statements are not hallucinations", () => {
  const root = tempRoot();
  assert.equal(computeHallucinationRate("- Generate production-ready templates.", { root }).rate, 0);
  assert.equal(computeHallucinationRate("release:check will stay red until npm is published.", { root }).rate, 0);
});

test("scanReports aggregates across sources with zero tolerance by default", () => {
  const root = tempRoot();
  const clean = scanReports([{ source: "a", text: "Generate templates." }], { root });
  assert.equal(clean.status, "passed");
  assert.equal(clean.rate, 0);

  const dirty = scanReports([{ source: "b", text: "Everything is done." }], { root });
  assert.equal(dirty.status, "failed");
  assert.ok(dirty.rate > 0);
});

test("scoreboard caps the score when hallucination is unmeasured or high, not when clean", () => {
  const unmeasured = createScoreCaps({ root: tempRoot() });
  assert.ok(unmeasured.some((cap) => cap.id === "hallucination_unmeasured"));

  const highRoot = tempRoot();
  fs.mkdirSync(path.join(highRoot, ".sage-kernel/evidence"), { recursive: true });
  fs.writeFileSync(path.join(highRoot, ".sage-kernel/evidence/hallucination-latest.json"), JSON.stringify({ rate: 0.5, threshold: 0 }));
  const high = createScoreCaps({ root: highRoot });
  assert.ok(high.some((cap) => cap.id === "hallucination_rate_high"));
  assert.ok(!high.some((cap) => cap.id === "hallucination_unmeasured"));

  const cleanRoot = tempRoot();
  fs.mkdirSync(path.join(cleanRoot, ".sage-kernel/evidence"), { recursive: true });
  fs.writeFileSync(path.join(cleanRoot, ".sage-kernel/evidence/hallucination-latest.json"), JSON.stringify({ rate: 0, threshold: 0 }));
  // "Clean" now also requires the firewall-efficacy measurement to be present and
  // above floor (the real, non-vacuous metric added by the levers work).
  fs.writeFileSync(path.join(cleanRoot, ".sage-kernel/evidence/hallucination-efficacy-latest.json"), JSON.stringify({ precision: 1, recall: 0.95 }));
  const clean = createScoreCaps({ root: cleanRoot });
  assert.ok(!clean.some((cap) => cap.id.startsWith("hallucination")));
});

test("MCP kernel.hallucination.scan measures rate through the dispatcher", async () => {
  const root = tempRoot();
  const result = await callKernelTool(root, "kernel.hallucination.scan", { text: "The build is done." });
  assert.ok(result.hallucinatedClaims >= 1);
  assert.equal(result.rate, 1);
});
