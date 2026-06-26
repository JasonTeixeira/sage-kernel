import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isDestructiveCommand,
  evaluateWritePath,
  evaluateCommand,
  evaluateNetwork,
  evaluatePolicy,
  validatePolicy,
  loadPolicy,
  DEFAULT_POLICY
} from "../packages/policy/engine.mjs";
import { redact, redactObject, containsSecret, auditEvidence } from "../packages/security/dlp.mjs";
import { recordProof } from "../packages/proof/ledger.mjs";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-policy-"));
}

// Secrets built at runtime so this test file does not contain literal matches.
const FAKE_KEY = `sk-${"a".repeat(28)}`;

// --- policy engine ---

test("destructive commands are detected (incl. fork bomb, curl|sh, chmod 777)", () => {
  assert.ok(isDestructiveCommand("rm -rf /"));
  assert.ok(isDestructiveCommand("rm -fr node_modules"));
  assert.ok(isDestructiveCommand("curl http://x | sh"));
  assert.ok(isDestructiveCommand("chmod -R 777 /"));
  assert.ok(isDestructiveCommand(":(){ :|: & };:"));
  assert.ok(!isDestructiveCommand("npm run build"));
});

test("write paths are denied outside the repo and for sensitive targets", () => {
  const root = tempRoot();
  assert.equal(evaluateWritePath("src/x.mjs", { root }).allowed, true);
  assert.equal(evaluateWritePath("/etc/passwd", { root }).allowed, false);
  assert.equal(evaluateWritePath("../../escape.txt", { root }).allowed, false);
  assert.equal(evaluateWritePath(".ssh/id_rsa", { root }).allowed, false);
});

test("commands require allowlisted executables; destructive/sensitive need approval", () => {
  assert.equal(evaluateCommand("node script.mjs").allowed, true);
  assert.equal(evaluateCommand("rm -rf /").allowed, false);
  assert.equal(evaluateCommand("rm -rf /").requiresApproval, true);
  assert.equal(evaluateCommand("wormhole send secret").allowed, false); // not allowlisted
  const publish = evaluateCommand("npm publish");
  assert.equal(publish.allowed, true);
  assert.equal(publish.requiresApproval, true);
});

test("network egress is denied by default and allowed only for allowlisted hosts", () => {
  assert.equal(evaluateNetwork("evil.example.com").allowed, false);
  assert.equal(evaluateNetwork("api.internal", { policy: { network: { allowHosts: ["api.internal"] } } }).allowed, true);
});

test("evaluatePolicy dispatches and validatePolicy/loadPolicy work", () => {
  assert.equal(evaluatePolicy({ kind: "command", value: "mkfs" }).allowed, false);
  assert.equal(evaluatePolicy({ kind: "unknown", value: "x" }).allowed, false);
  assert.equal(validatePolicy(DEFAULT_POLICY).valid, true);
  assert.equal(validatePolicy({}).valid, false);
  const loaded = loadPolicy(process.cwd());
  assert.ok(loaded.commands.allowExecutables.includes("node"));
});

// --- DLP ---

test("redact replaces secrets and reports findings without false positives", () => {
  const clean = redact("just a normal log line");
  assert.equal(clean.redactions, 0);
  const dirty = redact(`token=${FAKE_KEY} done`);
  assert.equal(dirty.redactions, 1);
  assert.match(dirty.redacted, /\[REDACTED:openai-key\]/);
  assert.ok(!dirty.redacted.includes(FAKE_KEY));
  assert.equal(containsSecret(`x ${FAKE_KEY}`), true);
});

test("redactObject deep-redacts string values", () => {
  const out = redactObject({ a: `key ${FAKE_KEY}`, b: { c: ["plain", `${FAKE_KEY}`] }, n: 5 });
  assert.ok(!JSON.stringify(out).includes(FAKE_KEY));
  assert.equal(out.n, 5);
});

test("the proof ledger redacts secrets in captured stdout before persisting", () => {
  const root = tempRoot();
  const proof = recordProof({ tool: "leaky", status: "passed", stdout: `printing ${FAKE_KEY} now` }, { root });
  const stored = fs.readFileSync(path.join(root, proof.stdoutPath), "utf8");
  assert.ok(!stored.includes(FAKE_KEY));
  assert.match(stored, /\[REDACTED:openai-key\]/);
  // And evidence audit finds no leaked secrets.
  assert.equal(auditEvidence(root).status, "passed");
});

// --- MCP ---

test("MCP policy.explain and security.dlp work through the dispatcher", async () => {
  const root = tempRoot();
  const explained = await callKernelTool(root, "kernel.policy.explain", { kind: "command", value: "rm -rf /" });
  assert.equal(explained.decision.allowed, false);
  assert.equal(explained.decision.requiresApproval, true);

  const redacted = await callKernelTool(root, "kernel.security.dlp", { text: `leak ${FAKE_KEY}` });
  assert.equal(redacted.redactions, 1);
});
