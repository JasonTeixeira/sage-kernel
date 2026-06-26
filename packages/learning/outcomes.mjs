// Outcome learning — records the result of every loop/agent run and learns, per
// repository, which choice passes most reliably. Selection improves from real
// outcomes (a simple, explainable bandit), not just keywords. Append-only store
// under .sage-kernel/learning/outcomes.jsonl (gitignored).

import fs from "node:fs";
import path from "node:path";
import { repoFingerprint } from "../profiles/profile-learning.mjs";

function storeFile(options = {}) {
  const root = options.root || process.cwd();
  return options.storeFile || path.join(root, ".sage-kernel/learning/outcomes.jsonl");
}

export function recordOutcome(entry = {}, options = {}) {
  const root = options.root || process.cwd();
  const file = storeFile({ ...options, root });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record = {
    fingerprint: options.fingerprint || repoFingerprint({ root }),
    loop: entry.loop || null,
    agent: entry.agent || null,
    status: entry.status || "unknown",
    passed: entry.status === "passed" || entry.status === "completed",
    repairs: entry.repairs ?? 0,
    durationMs: entry.durationMs ?? 0,
    at: options.now || new Date().toISOString()
  };
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  return record;
}

export function readOutcomes(options = {}) {
  const file = storeFile(options);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Aggregate stats per loop for the current repo.
export function outcomeStats(options = {}) {
  const fingerprint = options.fingerprint || repoFingerprint(options);
  const byLoop = {};
  for (const record of readOutcomes(options)) {
    if (record.fingerprint !== fingerprint) continue;
    const key = record.loop || "unknown";
    const stat = (byLoop[key] = byLoop[key] || { loop: key, runs: 0, passes: 0, totalDuration: 0 });
    stat.runs += 1;
    if (record.passed) stat.passes += 1;
    stat.totalDuration += record.durationMs || 0;
  }
  return Object.values(byLoop).map((stat) => ({
    loop: stat.loop,
    runs: stat.runs,
    passes: stat.passes,
    passRate: stat.runs ? Number((stat.passes / stat.runs).toFixed(4)) : 0,
    avgDurationMs: stat.runs ? Math.round(stat.totalDuration / stat.runs) : 0
  }));
}

// Recommend the loop with the best evidenced pass rate for this repo, once there
// is enough data. Tie-break by lower average duration. Returns null when data is
// insufficient (caller falls back to the classifier).
export function recommendLoop(options = {}) {
  const minRuns = options.minRuns ?? 3;
  const minPassRate = options.minPassRate ?? 0.6;
  const stats = outcomeStats(options).filter((stat) => stat.runs >= minRuns && stat.passRate >= minPassRate);
  if (!stats.length) return null;
  stats.sort((a, b) => b.passRate - a.passRate || a.avgDurationMs - b.avgDurationMs);
  return { loop: stats[0].loop, source: "outcome-learned", stats: stats[0] };
}
