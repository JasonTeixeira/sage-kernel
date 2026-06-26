import test from "node:test";
import assert from "node:assert/strict";
import { gatherCockpitSnapshot, renderCockpit } from "../packages/cockpit/cockpit.mjs";

const fixture = {
  generatedAt: "2026-06-20T00:00:00.000Z",
  proofs: {
    total: 42,
    passed: 40,
    failed: 2,
    recent: [
      { tool: "npm run release:check", status: "passed" },
      { tool: "npm run test:coverage", status: "failed" }
    ]
  },
  evidence: [
    { label: "stress", status: "passed" },
    { label: "mcp-clients", status: "passed" },
    { label: "benchmark", status: "missing" }
  ]
};

test("renderCockpit produces a width-aligned ANSI-free panel by default", () => {
  const output = renderCockpit(fixture, { width: 60 });
  const lines = output.split("\n");
  assert.ok(lines[0].startsWith("┌") && lines[lines.length - 1].startsWith("└"));
  // No raw escape codes when color is off.
  assert.equal(/\[/.test(output), false);
  // Every rendered line is the same visible width.
  const widths = new Set(lines.map((l) => l.length));
  assert.equal(widths.size, 1, `inconsistent widths: ${[...widths].join(",")}`);
  assert.match(output, /SAGE KERNEL · COCKPIT/);
  assert.match(output, /Proofs: 42/);
  assert.match(output, /release:check/);
});

test("renderCockpit emits ANSI color codes when enabled and stays width-aligned", () => {
  const output = renderCockpit(fixture, { width: 60, color: true });
  assert.equal(/\[32m/.test(output), true); // green present
  const lines = output.split("\n");
  // Visible width (after stripping ANSI) stays uniform.
  const visible = new Set(lines.map((l) => l.replace(/\[[0-9;]*m/g, "").length));
  assert.equal(visible.size, 1);
});

test("gatherCockpitSnapshot reads real ledger and evidence state", () => {
  const snapshot = gatherCockpitSnapshot({ root: process.cwd(), now: "fixed" });
  assert.equal(snapshot.generatedAt, "fixed");
  assert.equal(typeof snapshot.proofs.total, "number");
  assert.ok(Array.isArray(snapshot.evidence) && snapshot.evidence.length >= 3);
  assert.ok(snapshot.evidence.every((e) => typeof e.status === "string"));
});
