import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteAdapter } from "../packages/db/adapter.mjs";

export function parseQueueStressArgs(argv = process.argv.slice(2)) {
  return {
    count: Number(argv.find((arg) => arg.startsWith("--count="))?.split("=")[1] || 1000)
  };
}

export function createQueueStressReport(options = {}) {
  const ownsRoot = !options.root;
  const root = options.root || fs.mkdtempSync(path.join(os.tmpdir(), "sage-kernel-stress-queue-"));
  const schemaRoot = options.schemaRoot || process.cwd();
  const count = Number(options.count ?? 1000);
  const chunkSize = Number(options.chunkSize ?? 10000);
  const nowMs = options.nowMs || (() => Date.now());
  const nowIso = options.nowIso || (() => new Date().toISOString());
  const db = options.db || createSqliteAdapter({ root, schemaRoot });
  db.init();

  const started = nowMs();
  const now = nowIso();
  try {
    for (let start = 0; start < count; start += chunkSize) {
      const size = Math.min(chunkSize, count - start);
      const inserts = Array.from({ length: size }, (_, offset) => {
        const index = start + offset;
        return {
          sql: `INSERT INTO job_queue (id, job_id, status, priority, payload_json, attempts, max_attempts, created_at)
        VALUES (?, ?, 'queued', ?, ?, 0, 1, ?)`,
          params: [`stress-${index}`, `stress-${index}`, index % 10, JSON.stringify({ index }), now]
        };
      });
      db.executeBatch(inserts);
    }
    db.execute(
      `UPDATE job_queue
   SET status='finished', attempts=attempts+1, started_at=?, finished_at=?, locked_at=NULL, locked_by=NULL
   WHERE status='queued'`,
      [now, nowIso()]
    );

    const durationMs = nowMs() - started;
    const finished = Number(db.scalar("SELECT COUNT(*) FROM job_queue WHERE status='finished';"));
    const unfinished = Number(db.scalar("SELECT COUNT(*) FROM job_queue WHERE status!='finished';"));
    return {
      type: "queue-stress",
      count,
      claimed: finished,
      finished,
      unfinished,
      durationMs,
      jobsPerSecond: Number((count / (durationMs / 1000 || 1)).toFixed(2)),
      status: finished === count && unfinished === 0 ? "passed" : "failed"
    };
  } finally {
    if (typeof db.close === "function") db.close();
    if (ownsRoot) fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createQueueStressReport(parseQueueStressArgs());
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
