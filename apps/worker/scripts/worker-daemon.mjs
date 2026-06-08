import { spawnSync } from "node:child_process";

const root = process.cwd();
const intervalMs = Number(process.env.SAGE_WORKER_INTERVAL_MS || 5000);
const once = process.argv.includes("--once");
const workerId = process.env.SAGE_WORKER_ID || `worker-${process.pid}`;

function tick() {
  const result = spawnSync("node", ["apps/worker/scripts/jobs-next.mjs", "--worker", workerId], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  const output = (result.stdout || result.stderr || "").trim();
  if (output) console.log(output);
  return result.status ?? 1;
}

if (once) {
  process.exit(tick());
}

console.log(`Sage worker daemon running as ${workerId}; interval=${intervalMs}ms`);
tick();
setInterval(tick, intervalMs);
