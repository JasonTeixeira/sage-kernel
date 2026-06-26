// Proof Ledger — append-only, tamper-evident evidence store.
//
// Every command/tool run can write a proof record capturing what was run, the
// hashed input/output, captured stdout/stderr artifacts, git state, timing, and
// status. Records are chained by hash (each record carries the previous record's
// recordHash) so tampering, reordering, deletion, or truncation is detectable.
//
// This module is pure-ish: all filesystem effects are confined to a ledger
// directory derived from `root` (default `<root>/.sage-kernel/proof`). Tests
// pass a temp root so they never touch real evidence.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { redact } from "../security/dlp.mjs";

export const PROOF_STATUSES = new Set([
  "passed",
  "failed",
  "error",
  "blocked_not_verified",
  "blocked_not_implemented",
  "blocked_ui_proof",
  "blocked_external_proof"
]);

export const PROOF_REQUIRED_FIELDS = [
  "proofId",
  "runId",
  "parentProofIds",
  "tool",
  "inputHash",
  "outputHash",
  "status",
  "verifier",
  "git",
  "startedAt",
  "finishedAt",
  "durationMs",
  "recordHash"
];

// Deterministic JSON: object keys sorted recursively so hashing is stable.
export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

export function hashValue(value) {
  return crypto.createHash("sha256").update(canonicalize(value)).digest("hex");
}

function hashString(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function ledgerDir(options = {}) {
  const root = options.root || process.cwd();
  return options.ledgerDir || path.join(root, ".sage-kernel/proof");
}

function ledgerFile(options = {}) {
  return path.join(ledgerDir(options), "ledger.jsonl");
}

function captureGitState(root) {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    return result.status === 0 ? String(result.stdout || "").trim() : null;
  };
  const commit = git(["rev-parse", "HEAD"]);
  if (commit === null) {
    return { commit: null, dirty: null, diffHash: null, tracked: false };
  }
  const status = git(["status", "--porcelain"]);
  const diff = git(["diff", "HEAD"]);
  return {
    commit,
    dirty: status ? status.length > 0 : false,
    diffHash: hashString(diff || ""),
    tracked: true
  };
}

// recordHash is computed over the record with recordHash + sig removed, so any
// later edit to any field invalidates it.
function computeRecordHash(record) {
  const { recordHash, sig, ...rest } = record;
  return hashValue(rest);
}

// Optional keyed integrity seal. recordHash alone is attacker-recomputable (a
// motivated insider can edit content + rehash the chain). An HMAC over the record
// (including its recordHash) with a secret NOT stored beside the ledger means an
// attacker cannot forge a valid seal without the key. The key lives in
// SAGE_LEDGER_KEY (env/secret manager); absent it, the ledger is tamper-EVIDENT
// vs accidents but not tamper-PROOF vs an adversary — reported honestly.
// Resolve the ledger key from explicit options first, then env. Threading it via
// options lets tests exercise sealing WITHOUT mutating process.env (global env
// mutation could leak a key into an unrelated recordProof and poison the ledger).
function ledgerKey(options = {}) {
  const key = options.ledgerKey ?? process.env.SAGE_LEDGER_KEY;
  return key && String(key).trim() ? String(key) : null;
}

function signRecord(record, key) {
  const { sig, ...rest } = record;
  return crypto.createHmac("sha256", key).update(canonicalize(rest)).digest("hex");
}

// HEAD anchor — a sidecar that records the ledger's head hash + count. A valid
// hash-chain CANNOT detect deletion of trailing records or full-file replacement
// with a fresh-but-internally-consistent chain; the anchor can. When a key is
// configured the anchor is signed, so rewriting it to match a forgery also needs
// the key. Without a key it still catches accidental truncation/replacement.
function anchorPath(options = {}) {
  return path.join(ledgerDir(options), "ledger.anchor.json");
}

function writeAnchor(file, options) {
  const records = readLines(file);
  const head = records.length ? (JSON.parse(records[records.length - 1]).recordHash || null) : null;
  const anchor = { head, count: records.length, updatedAt: new Date().toISOString() };
  const key = ledgerKey(options);
  if (key) anchor.sig = crypto.createHmac("sha256", key).update(canonicalize({ head: anchor.head, count: anchor.count })).digest("hex");
  fs.writeFileSync(anchorPath(options), `${JSON.stringify(anchor)}\n`);
}

function checkAnchor(records, options) {
  let anchor;
  try {
    anchor = JSON.parse(fs.readFileSync(anchorPath(options), "utf8"));
  } catch {
    return null; // no anchor — nothing to check (honest: anchoring is opt-in)
  }
  const issues = [];
  const valid = records.filter((r) => !r.__malformed);
  const head = valid.length ? valid[valid.length - 1].recordHash : null;
  if (anchor.count !== records.length) issues.push(`anchor count mismatch: ledger has ${records.length}, anchor expects ${anchor.count} (records truncated or replaced)`);
  if (anchor.head !== head) issues.push(`anchor head mismatch: ledger head ${head} != anchored head ${anchor.head} (trailing records altered/removed)`);
  const key = ledgerKey(options);
  if (key) {
    const expected = crypto.createHmac("sha256", key).update(canonicalize({ head: anchor.head, count: anchor.count })).digest("hex");
    if (anchor.sig !== expected) issues.push("anchor signature mismatch (anchor was forged)");
  } else if (anchor.sig) {
    issues.push("anchor is signed but no key is available to verify it (refusing to trust)");
  }
  return issues;
}

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function readLedger(options = {}) {
  const file = ledgerFile(options);
  const records = [];
  readLines(file).forEach((line, index) => {
    try {
      records.push(JSON.parse(line));
    } catch {
      records.push({ __malformed: true, line: index + 1, raw: line.slice(0, 200) });
    }
  });
  return records;
}

export function validateProofRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, errors: ["record must be an object"] };
  }
  if (record.__malformed) return { valid: false, errors: [`malformed JSON at line ${record.line}`] };
  for (const field of PROOF_REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null) errors.push(`missing field: ${field}`);
  }
  if (typeof record.proofId === "string" && !record.proofId.startsWith("proof_")) {
    errors.push("proofId must start with 'proof_'");
  }
  if (!Array.isArray(record.parentProofIds)) errors.push("parentProofIds must be an array");
  if (record.status !== undefined && !PROOF_STATUSES.has(record.status)) {
    errors.push(`invalid status: ${record.status}`);
  }
  if (record.git && typeof record.git !== "object") errors.push("git must be an object");
  if (record.artifacts !== undefined && !Array.isArray(record.artifacts)) {
    errors.push("artifacts must be an array");
  }
  if (typeof record.durationMs !== "number" || record.durationMs < 0) {
    errors.push("durationMs must be a non-negative number");
  }
  return { valid: errors.length === 0, errors };
}

function writeArtifact(dir, name, content) {
  if (content === undefined || content === null) return null;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, String(content));
  return file;
}

// Record a proof. Throws if the assembled record is malformed (so a bad proof is
// never persisted). Returns the full record (with recordHash and relative paths).
export function recordProof(entry = {}, options = {}) {
  const root = options.root || process.cwd();
  const dir = ledgerDir(options);
  const file = ledgerFile(options);
  fs.mkdirSync(dir, { recursive: true });

  const startedAt = entry.startedAt || new Date().toISOString();
  const finishedAt = entry.finishedAt || new Date().toISOString();
  const proofId = entry.proofId || `proof_${crypto.randomUUID()}`;
  const artifactsDir = path.join(dir, "artifacts", proofId);

  const { stdoutFile, stderrFile, artifacts } = collectProofArtifacts(artifactsDir, entry, root);
  const record = composeProofRecord({ entry, root, proofId, startedAt, finishedAt, stdoutFile, stderrFile, artifacts, prevHash: readPrevRecordHash(file) });
  record.recordHash = computeRecordHash(record);
  const key = ledgerKey(options);
  if (key) record.sig = signRecord(record, key);

  const validation = validateProofRecord(record);
  if (!validation.valid) {
    throw new Error(`Refusing to record malformed proof: ${validation.errors.join("; ")}`);
  }

  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  writeAnchor(file, options); // update the head anchor so truncation is detectable
  return record;
}

// DLP: redact secrets before persisting captured output, then hash each artifact.
function collectProofArtifacts(artifactsDir, entry, root) {
  const redactOutput = (value) => (value === undefined || value === null ? value : redact(String(value)).redacted);
  const stdoutFile = writeArtifact(artifactsDir, "stdout.txt", redactOutput(entry.stdout));
  const stderrFile = writeArtifact(artifactsDir, "stderr.txt", redactOutput(entry.stderr));
  const artifacts = [];
  for (const artifactFile of [stdoutFile, stderrFile, ...(entry.artifactFiles || [])]) {
    if (!artifactFile || !fs.existsSync(artifactFile)) continue;
    const body = fs.readFileSync(artifactFile);
    artifacts.push({
      path: path.relative(root, artifactFile),
      hash: crypto.createHash("sha256").update(body).digest("hex"),
      bytes: body.length
    });
  }
  return { stdoutFile, stderrFile, artifacts };
}

function readPrevRecordHash(file) {
  const previous = readLines(file).pop();
  if (!previous) return null;
  try {
    return JSON.parse(previous).recordHash || null;
  } catch {
    return null;
  }
}

function composeProofRecord({ entry, root, proofId, startedAt, finishedAt, stdoutFile, stderrFile, artifacts, prevHash }) {
  return {
    proofId,
    runId: entry.runId || process.env.SAGE_RUN_ID || `run_${startedAt}`,
    parentProofIds: Array.isArray(entry.parentProofIds) ? entry.parentProofIds : [],
    tool: entry.tool || entry.command || null,
    command: entry.command || null,
    input: entry.input ?? {},
    inputHash: hashValue(entry.input ?? {}),
    output: entry.output ?? null,
    outputHash: hashValue(entry.output ?? null),
    stdoutPath: stdoutFile ? path.relative(root, stdoutFile) : null,
    stderrPath: stderrFile ? path.relative(root, stderrFile) : null,
    artifacts,
    exitCode: entry.exitCode ?? null,
    status: entry.status || "passed",
    verifier: entry.verifier || "command",
    git: entry.git || captureGitState(root),
    startedAt,
    finishedAt,
    durationMs: typeof entry.durationMs === "number" ? entry.durationMs : Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    freshnessExpiresAt: entry.freshnessExpiresAt || null,
    riskLevel: entry.riskLevel || null,
    approvalId: entry.approvalId || null,
    prevHash,
    recordHash: null
  };
}

// Run a command, capture stdout/stderr as artifacts, and record a proof for it.
export function recordCommandProof(spec = {}, options = {}) {
  const root = options.root || process.cwd();
  const args = spec.args || [];
  const startedAt = new Date().toISOString();
  const result = spawnSync(spec.command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    timeout: spec.timeoutMs || 600000
  });
  const finishedAt = new Date().toISOString();
  const exitCode = result.status ?? 1;
  return recordProof(
    {
      tool: spec.tool || `${spec.command} ${args.join(" ")}`.trim(),
      command: `${spec.command} ${args.join(" ")}`.trim(),
      input: spec.input ?? { command: spec.command, args },
      output: spec.output ?? null,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode,
      status: exitCode === 0 ? "passed" : "failed",
      verifier: "command",
      riskLevel: spec.riskLevel || null,
      runId: spec.runId,
      parentProofIds: spec.parentProofIds,
      startedAt,
      finishedAt
    },
    options
  );
}

export function getProof(proofId, options = {}) {
  return readLedger(options).find((record) => record.proofId === proofId) || null;
}

export function listProofs(options = {}) {
  let records = readLedger(options).filter((record) => !record.__malformed);
  if (options.runId) records = records.filter((record) => record.runId === options.runId);
  if (options.status) records = records.filter((record) => record.status === options.status);
  if (options.tool) records = records.filter((record) => record.tool === options.tool);
  if (typeof options.limit === "number") records = records.slice(-options.limit);
  return records;
}

// Verify one record: recompute its content hash and re-hash its artifacts on disk.
export function verifyProof(proofIdOrRecord, options = {}) {
  const root = options.root || process.cwd();
  const record = typeof proofIdOrRecord === "string" ? getProof(proofIdOrRecord, options) : proofIdOrRecord;
  if (!record) return { proofId: proofIdOrRecord, status: "missing", issues: ["proof not found"] };

  const issues = [];
  const schema = validateProofRecord(record);
  if (!schema.valid) issues.push(...schema.errors.map((error) => `schema: ${error}`));

  if (computeRecordHash(record) !== record.recordHash) {
    issues.push("recordHash mismatch (record content was altered)");
  }

  // Keyed integrity, FAIL-CLOSED against a downgrade. A sealed record (one that
  // carries a sig) MUST be verified with the key — refusing to bless it when the
  // key is absent, so an attacker cannot strip the env var and have forged-but-
  // sealed evidence verify clean. A configured key with an unsealed record is a
  // strip/forge. Unkeyed + unsealed (the default, no SAGE_LEDGER_KEY) verifies
  // normally — honest accident-detection, no false integrity claim.
  const key = ledgerKey(options);
  if (record.sig) {
    if (!key) issues.push("sealed record cannot be verified without SAGE_LEDGER_KEY (refusing to trust a downgraded verification)");
    else if (signRecord(record, key) !== record.sig) issues.push("signature mismatch (record forged)");
  } else if (key) {
    issues.push("missing signature (keyed ledger requires a sealed record)");
  }

  for (const artifact of record.artifacts || []) {
    const full = path.isAbsolute(artifact.path) ? artifact.path : path.join(root, artifact.path);
    if (!fs.existsSync(full)) {
      issues.push(`artifact missing: ${artifact.path}`);
      continue;
    }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    if (actual !== artifact.hash) issues.push(`artifact hash mismatch: ${artifact.path}`);
  }

  return {
    proofId: record.proofId,
    status: issues.length === 0 ? "verified" : "tampered",
    issues
  };
}

// Verify the whole ledger: every record plus the prevHash chain.
export function verifyLedger(options = {}) {
  const records = readLedger(options);
  const results = [];
  let chainOk = true;
  let previousHash = null;

  for (const record of records) {
    if (record.__malformed) {
      results.push({ proofId: null, status: "tampered", issues: [`malformed line ${record.line}`] });
      chainOk = false;
      previousHash = null;
      continue;
    }
    const verified = verifyProof(record, options);
    if (record.prevHash !== previousHash) {
      verified.issues.push(`chain break: prevHash ${record.prevHash} != expected ${previousHash}`);
      verified.status = "tampered";
    }
    if (verified.status !== "verified") chainOk = false;
    results.push(verified);
    previousHash = record.recordHash;
  }

  // HEAD-anchor check: catches truncation / trailing-deletion / full replacement
  // that an internally-consistent chain cannot.
  const anchorIssues = checkAnchor(records, options) || [];
  if (anchorIssues.length) chainOk = false;

  const tampered = results.filter((result) => result.status !== "verified").length;
  return {
    status: records.length === 0 ? "empty" : chainOk && tampered === 0 && anchorIssues.length === 0 ? "verified" : "tampered",
    count: records.length,
    chainOk,
    tampered,
    anchorIssues,
    records: results
  };
}
