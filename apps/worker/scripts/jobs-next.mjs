import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createSqliteAdapter } from "../../../packages/db/adapter.mjs";
import { createJobQueue } from "../../../packages/jobs/queue.mjs";

export function nextJobCli(args = process.argv.slice(2), options = {}) {
  const root = options.root || process.cwd();
  const env = options.env || process.env;
  const workerArg = args.includes("--worker") ? args[args.indexOf("--worker") + 1] : null;
  const workerId = workerArg || env.SAGE_WORKER_ID || `worker-${process.pid}`;
  const db = options.db || createSqliteAdapter({ root });
  db.init();
  const queue = options.queue || createJobQueue({ db, workerId });
  const claimed = queue.claimNext();

  if (!claimed) {
    return { status: 0, stdout: "No queued jobs.\n" };
  }

  const spawn = options.spawn || spawnSync;
  const result = spawn("node", ["apps/worker/scripts/jobs-run.mjs", claimed.jobId], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });

  if (result.status === 0) {
    queue.complete(claimed.id);
  } else {
    queue.fail(claimed.id, { error: result.stderr || result.stdout || "job failed", backoffMs: 1000 });
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    workerId
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = nextJobCli();
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status);
}
