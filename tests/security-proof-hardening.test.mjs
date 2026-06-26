import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanForSecrets } from "../packages/security/secret-scan.mjs";
import { createSecurityProof, dependencyAudit } from "../packages/security/supply-chain.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-secproof-"));
}

// Secret values are constructed at runtime so the literal does not appear in
// this test's source (otherwise the repo-wide secret scan would flag this file).
const FAKE_OPENAI = `sk-${"a".repeat(30)}`;
const FAKE_AWS = `AKIA${"IOSFODNN7EXAMPLE"}`;
const FAKE_PEM = `-----BEGIN RSA PRIVATE${" KEY-----"}\nx\n-----END RSA PRIVATE${" KEY-----"}\n`;

test("scanForSecrets passes on clean files and flags a planted secret", () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, "clean.js"), "export const value = 1;\n");
  assert.equal(scanForSecrets({ root }).status, "passed");

  fs.writeFileSync(path.join(root, "leak.js"), `const key = '${FAKE_OPENAI}';\n`);
  const result = scanForSecrets({ root });
  assert.equal(result.status, "failed");
  assert.ok(result.findings.some((finding) => finding.pattern === "openai-key"));
});

test("scanForSecrets detects an AWS access key and a private key block", () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, "aws.txt"), `${FAKE_AWS}\n`);
  fs.writeFileSync(path.join(root, "key.pem"), FAKE_PEM);
  const result = scanForSecrets({ root });
  assert.equal(result.status, "failed");
  assert.ok(result.findings.some((f) => f.pattern === "aws-access-key"));
  assert.ok(result.findings.some((f) => f.pattern === "private-key-block"));
});

test("dependencyAudit reports passed/failed from an injected auditor and skips gracefully", () => {
  assert.equal(dependencyAudit({ auditor: () => ({ status: "passed", high: 0 }) }).status, "passed");
  assert.equal(dependencyAudit({ auditor: () => ({ status: "failed", high: 2 }) }).status, "failed");
});

test("security proof fails when a real secret is detected", () => {
  const proof = createSecurityProof({
    root: repoRoot,
    projectPath: ".",
    secretScan: { status: "failed", findings: [{ file: "leak.js", pattern: "openai-key" }] },
    dependencyAudit: { status: "passed", high: 0 }
  });
  assert.equal(proof.status, "needs_work");
  assert.ok(proof.findings.some((finding) => /Secret detected/.test(finding.message)));
  assert.ok(proof.gates.some((gate) => gate.name === "secret-scan" && gate.status === "failed"));
});

test("security proof fails on high/critical dependency vulnerabilities", () => {
  const proof = createSecurityProof({
    root: repoRoot,
    projectPath: ".",
    secretScan: { status: "passed", findings: [] },
    dependencyAudit: { status: "failed", high: 3, vulnerabilities: { high: 3 } }
  });
  assert.equal(proof.status, "needs_work");
  assert.ok(proof.findings.some((finding) => /dependency vulnerabilit/.test(finding.message)));
});

test("security proof passes clean with both real detectors green", () => {
  const proof = createSecurityProof({
    root: repoRoot,
    projectPath: ".",
    secretScan: { status: "passed", findings: [] },
    dependencyAudit: { status: "passed", high: 0 }
  });
  assert.equal(proof.status, "passed");
  assert.ok(proof.gates.some((gate) => gate.name === "secret-scan"));
  assert.ok(proof.gates.some((gate) => gate.name === "dependency-audit"));
});
