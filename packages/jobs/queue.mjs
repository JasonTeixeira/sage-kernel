import crypto from "node:crypto";

export function createJobQueue({ db, workerId = `worker-${process.pid}` }) {
  if (!db) throw new Error("createJobQueue requires db");

  function normalize(row) {
    if (!row) return null;
    return {
      id: row.id,
      jobId: row.job_id,
      status: row.status,
      priority: Number(row.priority),
      payload: JSON.parse(row.payload_json || "{}"),
      attempts: Number(row.attempts || 0),
      maxAttempts: Number(row.max_attempts || 1),
      createdAt: row.created_at,
      nextRunAt: row.next_run_at,
      lockedAt: row.locked_at,
      lockedBy: row.locked_by,
      startedAt: row.started_at,
      finishedAt: row.finished_at
    };
  }

  return {
    enqueue({ jobId, payload = {}, priority = 100, maxAttempts = 1, delayMs = 0 }) {
      if (!jobId) throw new Error("enqueue requires jobId");
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const nextRunAt = delayMs > 0 ? new Date(Date.now() + delayMs).toISOString() : null;
      db.execute(
        `INSERT INTO job_queue (id, job_id, status, priority, payload_json, attempts, max_attempts, created_at, next_run_at)
         VALUES (?, ?, 'queued', ?, ?, 0, ?, ?, ?)`,
        [id, jobId, priority, JSON.stringify(payload), maxAttempts, now, nextRunAt]
      );
      return this.get(id);
    },
    claimNext({ now = new Date().toISOString() } = {}) {
      const rows = db.query(
        `SELECT * FROM job_queue
         WHERE status='queued' AND (next_run_at IS NULL OR next_run_at <= ?)
         ORDER BY priority ASC, created_at ASC LIMIT 1`,
        [now]
      );
      const row = rows[0];
      if (!row) return null;
      db.execute(
        `UPDATE job_queue
         SET status='running', started_at=?, locked_at=?, locked_by=?, attempts=attempts+1
         WHERE id=? AND status='queued'`,
        [now, now, workerId, row.id]
      );
      return this.get(row.id);
    },
    complete(id, { finishedAt = new Date().toISOString() } = {}) {
      db.execute(
        "UPDATE job_queue SET status='finished', finished_at=?, locked_at=NULL, locked_by=NULL WHERE id=?",
        [finishedAt, id]
      );
      return this.get(id);
    },
    fail(id, { error = "failed", backoffMs = 0, finishedAt = new Date().toISOString() } = {}) {
      const row = this.get(id);
      if (!row) throw new Error(`Unknown queued job: ${id}`);
      const final = row.attempts >= row.maxAttempts;
      if (final) {
        db.execute(
          "UPDATE job_queue SET status='dead-lettered', finished_at=?, locked_at=NULL, locked_by=NULL WHERE id=?",
          [finishedAt, id]
        );
      } else {
        const nextRunAt = new Date(Date.now() + backoffMs).toISOString();
        db.execute(
          "UPDATE job_queue SET status='queued', next_run_at=?, locked_at=NULL, locked_by=NULL WHERE id=?",
          [nextRunAt, id]
        );
      }
      return { ...this.get(id), error };
    },
    get(id) {
      return normalize(db.query("SELECT * FROM job_queue WHERE id=?", [id])[0] || null);
    }
  };
}
