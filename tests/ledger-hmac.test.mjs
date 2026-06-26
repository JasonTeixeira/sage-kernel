import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { recordProof, verifyLedger, canonicalize } from "../packages/proof/ledger.mjs";

const LEDGER = ".sage-kernel/proof/ledger.jsonl";
const KEY = "test-secret-key-not-beside-ledger";

// IMPORTANT: the key is passed via options.ledgerKey, NEVER process.env — so this
// test can never leak a key into an unrelated recordProof and poison a real ledger.
function seedLedger(root, ledgerKey) {
  const opt = { root, ...(ledgerKey ? { ledgerKey } : {}) };
  recordProof({ tool: "t1", command: "t1", status: "passed", exitCode: 0, verifier: "test", output: "ok-1" }, opt);
  recordProof({ tool: "t2", command: "t2", status: "passed", exitCode: 0, verifier: "test", output: "ok-2" }, opt);
  recordProof({ tool: "t3", command: "t3", status: "passed", exitCode: 0, verifier: "test", output: "ok-3" }, opt);
}

function forgeRehashChain(root) {
  const file = path.join(root, LEDGER);
  const records = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  records[1].output = "FORGED";
  records[1].status = "passed";
  const recompute = (rec) => { const { recordHash, sig, ...rest } = rec; return crypto.createHash("sha256").update(canonicalize(rest)).digest("hex"); };
  records[1].recordHash = recompute(records[1]);
  records[2].prevHash = records[1].recordHash;
  records[2].recordHash = recompute(records[2]);
  fs.writeFileSync(file, records.map((r) => `${JSON.stringify(r)}\n`).join(""));
}

test("WITH a ledger key: a rehash-forged record is detected as tampered", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-hmac-"));
  try {
    seedLedger(root, KEY);
    assert.equal(verifyLedger({ root, ledgerKey: KEY }).status, "verified");
    forgeRehashChain(root);
    const after = verifyLedger({ root, ledgerKey: KEY });
    assert.equal(after.status, "tampered");
    assert.ok(after.records.some((r) => r.issues.some((i) => /signature/.test(i))));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("DOWNGRADE attack is fail-closed: a sealed record verified WITHOUT the key is tampered, not verified", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-hmac-dg-"));
  try {
    seedLedger(root, KEY);
    forgeRehashChain(root);
    const after = verifyLedger({ root }); // no key supplied -> must refuse, not bless
    assert.equal(after.status, "tampered", "a sealed-but-keyless verification must NEVER return verified");
    assert.ok(after.records.some((r) => r.issues.some((i) => /without SAGE_LEDGER_KEY/.test(i))));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a different key cannot validate another key's seal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-hmac2-"));
  try {
    seedLedger(root, "key-A");
    assert.equal(verifyLedger({ root, ledgerKey: "key-B" }).status, "tampered");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("WITHOUT a ledger key: honest accident-detection still works (naive edit caught), no false integrity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-hmac3-"));
  try {
    seedLedger(root); // unsealed
    assert.equal(verifyLedger({ root }).status, "verified");
    const file = path.join(root, LEDGER);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    const rec = JSON.parse(lines[1]); rec.status = "failed"; lines[1] = JSON.stringify(rec);
    fs.writeFileSync(file, lines.map((l) => `${l}\n`).join(""));
    assert.equal(verifyLedger({ root }).status, "tampered");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
