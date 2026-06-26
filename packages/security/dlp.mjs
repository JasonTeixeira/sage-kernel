// Data-loss prevention — redacts secrets before they are persisted to logs,
// evidence, or memory, and audits evidence for leaked secrets. Reuses the single
// secret-pattern source of truth (secret-scan.mjs) so detection stays consistent.

import fs from "node:fs";
import path from "node:path";
import { SECRET_PATTERNS } from "./secret-scan.mjs";

export function redact(text, options = {}) {
  const patterns = options.patterns || SECRET_PATTERNS;
  let redacted = String(text ?? "");
  const findings = [];
  for (const pattern of patterns) {
    const flags = pattern.regex.flags.includes("g") ? pattern.regex.flags : `${pattern.regex.flags}g`;
    const re = new RegExp(pattern.regex.source, flags);
    let count = 0;
    redacted = redacted.replace(re, () => {
      count += 1;
      return `[REDACTED:${pattern.id}]`;
    });
    if (count > 0) findings.push({ rule: pattern.id, count });
  }
  return { redacted, findings, redactions: findings.reduce((sum, finding) => sum + finding.count, 0) };
}

export function containsSecret(text) {
  return redact(text).redactions > 0;
}

// Deep-redact string values in an object (for evidence/report payloads).
export function redactObject(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value).redacted;
  if (Array.isArray(value)) return value.map(redactObject);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactObject(child)]));
  }
  return value;
}

const SKIP_DIRS = new Set([".git", "node_modules"]);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

// Audit persisted evidence for leaked (unredacted) secrets. With redact-on-write
// in the proof ledger, this should stay clean — it proves DLP is working.
export function auditEvidence(root = process.cwd(), options = {}) {
  const dirs = options.dirs || [".sage-kernel/evidence", ".sage-kernel/proof"];
  const findings = [];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    const files = [];
    walk(abs, files);
    for (const file of files) {
      let body;
      try {
        body = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const result = redact(body);
      if (result.redactions > 0) {
        findings.push({ file: path.relative(root, file), rules: result.findings.map((f) => f.rule) });
      }
    }
  }
  return { status: findings.length === 0 ? "passed" : "failed", findings, scannedDirs: dirs };
}
