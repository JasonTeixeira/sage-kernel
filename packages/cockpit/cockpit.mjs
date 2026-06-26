// Terminal observability cockpit. A dependency-free, terminal-native status
// surface (no web UI): live gate/proof/evidence status rendered as ANSI panels.
// `gatherCockpitSnapshot` reads real state; `renderCockpit` is a pure function of
// the snapshot (deterministic, fully testable — timestamps are passed in).

import fs from "node:fs";
import path from "node:path";
import { readLedger } from "../proof/ledger.mjs";

const EVIDENCE_KEYS = [
  ["stress-matrix-latest.json", "stress"],
  ["orchestration-trace-latest.json", "orchestration"],
  ["mcp-client-proof-latest.json", "mcp-clients"],
  ["hallucination-latest.json", "hallucination"],
  ["real-repo-matrix-latest.json", "benchmark"]
];

export function gatherCockpitSnapshot(options = {}) {
  const root = options.root || process.cwd();
  const now = options.now || new Date().toISOString();
  const ledger = safe(() => readLedger({ root }), []);
  const recent = ledger.slice(-8).map((record) => ({ tool: record.tool || record.command || "?", status: record.status || "?" }));
  const passed = ledger.filter((record) => record.status === "passed").length;
  const failed = ledger.filter((record) => record.status === "failed").length;
  const evidence = EVIDENCE_KEYS.map(([file, label]) => {
    const report = safe(() => JSON.parse(fs.readFileSync(path.join(root, ".sage-kernel/evidence", file), "utf8")), null);
    return { label, status: report?.status || (report ? "present" : "missing") };
  });
  return {
    generatedAt: now,
    proofs: { total: ledger.length, passed, failed, recent },
    evidence
  };
}

const STATUS_GLYPH = { passed: "✓", failed: "✗", needs_work: "!", needs_hardening: "!", missing: "·", present: "•" };
const COLOR = { reset: "[0m", green: "[32m", red: "[31m", yellow: "[33m", dim: "[2m", bold: "[1m" };

export function renderCockpit(snapshot, options = {}) {
  const width = options.width || 60;
  const color = options.color === true;
  const paint = (text, c) => (color ? `${COLOR[c] || ""}${text}${COLOR.reset}` : text);
  const line = (text) => `│ ${text}${" ".repeat(Math.max(0, width - 3 - stripAnsi(text).length))}│`;
  const rule = (left, right) => `${left}${"─".repeat(width - 2)}${right}`;
  const glyph = (status) => paint(STATUS_GLYPH[status] || "?", status === "passed" || status === "present" ? "green" : status === "failed" ? "red" : "yellow");

  const out = [];
  out.push(rule("┌", "┐"));
  out.push(line(paint("SAGE KERNEL · COCKPIT", "bold")));
  out.push(line(paint(snapshot.generatedAt, "dim")));
  out.push(rule("├", "┤"));
  out.push(line(`Proofs: ${snapshot.proofs.total}  ${glyph("passed")} ${snapshot.proofs.passed}  ${glyph("failed")} ${snapshot.proofs.failed}`));
  out.push(rule("├", "┤"));
  out.push(line(paint("Evidence", "bold")));
  for (const item of snapshot.evidence) out.push(line(`  ${glyph(item.status)} ${item.label}${" ".repeat(Math.max(1, 16 - item.label.length))}${item.status}`));
  out.push(rule("├", "┤"));
  out.push(line(paint("Recent proofs", "bold")));
  for (const record of snapshot.proofs.recent.slice(-5)) out.push(line(`  ${glyph(record.status)} ${truncate(record.tool, width - 8)}`));
  out.push(rule("└", "┘"));
  return out.join("\n");
}

function truncate(text, max) {
  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function stripAnsi(text) {
  return String(text).replace(/\[[0-9;]*m/g, "");
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
