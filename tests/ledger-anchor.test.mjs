import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordProof, verifyLedger } from "../packages/proof/ledger.mjs";

const LEDGER = ".sage-kernel/proof/ledger.jsonl";

function seed(root, key) {
  const opt = { root, ...(key ? { ledgerKey: key } : {}) };
  for (const i of [1, 2, 3]) recordProof({ tool: `t${i}`, command: `t${i}`, status: "passed", exitCode: 0, verifier: "test", output: `ok-${i}` }, opt);
}

test("a clean ledger with its anchor verifies", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-anchor-"));
  try {
    seed(root);
    assert.equal(verifyLedger({ root }).status, "verified");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("TRUNCATION is detected: deleting the trailing record (a still-valid chain) is tampered", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-anchor-trunc-"));
  try {
    seed(root);
    const file = path.join(root, LEDGER);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    fs.writeFileSync(file, lines.slice(0, -1).map((l) => `${l}\n`).join("")); // drop the last record
    const v = verifyLedger({ root });
    assert.equal(v.status, "tampered");
    assert.ok(v.anchorIssues.some((i) => /count mismatch|head mismatch/.test(i)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("FULL REPLACEMENT is detected: swapping in a fresh internally-valid 1-record chain is tampered", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-anchor-replace-"));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "sage-anchor-other-"));
  try {
    seed(root);
    // Build a fresh, internally-consistent single-record ledger elsewhere...
    recordProof({ tool: "evil", command: "evil", status: "passed", exitCode: 0, verifier: "x", output: "forged" }, { root: other });
    const forged = fs.readFileSync(path.join(other, LEDGER), "utf8");
    fs.writeFileSync(path.join(root, LEDGER), forged); // ...and swap it into the real ledger (keep the real anchor)
    const v = verifyLedger({ root });
    assert.equal(v.status, "tampered");
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(other, { recursive: true, force: true }); }
});

test("with a key the anchor is signed: forging the anchor to match a truncation still fails", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-anchor-sig-"));
  const KEY = "anchor-key";
  try {
    seed(root, KEY);
    const file = path.join(root, LEDGER);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    fs.writeFileSync(file, lines.slice(0, -1).map((l) => `${l}\n`).join(""));
    // Attacker rewrites the anchor to match the truncated ledger, but lacks the key.
    const a = path.join(root, ".sage-kernel/proof/ledger.anchor.json");
    const tampered = JSON.parse(fs.readFileSync(a, "utf8"));
    tampered.count = 2; tampered.head = JSON.parse(lines[1]).recordHash; // sig left stale
    fs.writeFileSync(a, JSON.stringify(tampered));
    const v = verifyLedger({ root, ledgerKey: KEY });
    assert.equal(v.status, "tampered");
    assert.ok(v.anchorIssues.some((i) => /signature/.test(i)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
