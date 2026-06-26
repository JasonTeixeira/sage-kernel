import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { __kernelToolsTestInternals } from "../apps/mcp-server/src/kernel-tools.mjs";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));
const tools = manifest.tools || [];
const { knownKernelToolNames } = __kernelToolsTestInternals;

test("every manifest tool is dispatchable and every dispatchable tool is in the manifest (bijection)", () => {
  const manifestNames = new Set(tools.map((tool) => tool.name));
  const undispatchable = [...manifestNames].filter((name) => !knownKernelToolNames.has(name));
  const unmanifested = [...knownKernelToolNames].filter((name) => !manifestNames.has(name));
  assert.deepEqual(undispatchable, [], `manifest tools with no dispatcher case: ${undispatchable.join(", ")}`);
  assert.deepEqual(unmanifested, [], `dispatcher cases with no manifest entry: ${unmanifested.join(", ")}`);
});

test("manifest matches the dispatcher's ACTUAL switch cases (source-extracted, not tautological)", () => {
  // The prior bijection diffed tools.json against knownKernelToolNames — which is
  // itself built from tools.json, so it could never catch a manifest/dispatcher
  // mismatch. This extracts the real `case "kernel.X":` labels from the dispatcher
  // SOURCE and diffs those against the manifest, so a tool listed-but-not-wired
  // (or wired-but-not-listed) actually fails the gate.
  const src = fs.readFileSync(path.join(root, "apps/mcp-server/src/kernel-tools.mjs"), "utf8");
  const caseNames = new Set([...src.matchAll(/case\s+"(kernel\.[a-z0-9_.]+)":/g)].map((m) => m[1]));
  const manifestNames = new Set(tools.map((tool) => tool.name));
  const inManifestNoCase = [...manifestNames].filter((name) => !caseNames.has(name));
  const caseNoManifest = [...caseNames].filter((name) => !manifestNames.has(name));
  assert.deepEqual(inManifestNoCase, [], `manifest tools with NO dispatcher switch case: ${inManifestNoCase.join(", ")}`);
  assert.deepEqual(caseNoManifest, [], `dispatcher switch cases with NO manifest entry: ${caseNoManifest.join(", ")}`);
});

test("every tool declares a conformant schema, risk, permission, and docs", () => {
  const failures = [];
  for (const tool of tools) {
    const label = tool.name || "<unnamed>";
    if (!/^kernel\.[a-z0-9_.]+$/.test(tool.name || "")) failures.push(`${label}: invalid name`);
    if (tool.inputSchema?.type !== "object") failures.push(`${label}: inputSchema.type must be "object"`);
    if (typeof tool.description !== "string" || tool.description.length < 10) failures.push(`${label}: missing description`);
    if (typeof tool.risk !== "string") failures.push(`${label}: missing risk`);
    if (typeof tool.permission !== "string") failures.push(`${label}: missing permission`);
    if (!Array.isArray(tool.examples) || tool.examples.length === 0) failures.push(`${label}: needs >=1 example`);
    if (!Array.isArray(tool.failureModes) || tool.failureModes.length === 0) failures.push(`${label}: needs >=1 failureMode`);
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("kernel.cockpit.status dispatches and returns a snapshot", async () => {
  const { callKernelTool } = await import("../apps/mcp-server/src/kernel-tools.mjs");
  const snapshot = await callKernelTool(root, "kernel.cockpit.status", {});
  assert.equal(typeof snapshot.proofs.total, "number");
  assert.ok(Array.isArray(snapshot.evidence));
});

test("tool names are unique", () => {
  const seen = new Set();
  const dupes = [];
  for (const tool of tools) {
    if (seen.has(tool.name)) dupes.push(tool.name);
    seen.add(tool.name);
  }
  assert.deepEqual(dupes, []);
});
