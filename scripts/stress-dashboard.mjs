import { fileURLToPath } from "node:url";

export function parseDashboardStressArgs(argv = process.argv.slice(2)) {
  return {
    baseUrl: valueFor(argv, "--url") || "http://127.0.0.1:8787",
    count: Number(valueFor(argv, "--count") || 100),
    concurrency: Number(valueFor(argv, "--concurrency") || 10),
    endpoint: valueFor(argv, "--endpoint") || "/api/snapshot"
  };
}

export async function createDashboardStressReport(options = {}) {
  const baseUrl = options.baseUrl || "http://127.0.0.1:8787";
  const count = Number(options.count ?? 100);
  const concurrency = Number(options.concurrency ?? 10);
  const endpoint = options.endpoint || "/api/snapshot";
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => Date.now());
  const latencies = [];
  let failures = 0;
  let next = 0;
  const started = now();

  async function worker() {
    while (next < count) {
      next += 1;
      const requestStarted = now();
      try {
        const response = await fetchImpl(new URL(endpoint, baseUrl));
        await response.text();
        if (!response.ok) failures += 1;
      } catch {
        failures += 1;
      }
      latencies.push(now() - requestStarted);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  latencies.sort((a, b) => a - b);
  const durationMs = now() - started;
  const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] || 0;
  return {
    type: "dashboard-stress",
    baseUrl,
    endpoint,
    count,
    concurrency,
    failures,
    durationMs,
    requestsPerSecond: Number((count / (durationMs / 1000 || 1)).toFixed(2)),
    latencyMs: {
      min: latencies[0] || 0,
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: latencies.at(-1) || 0
    },
    status: failures === 0 ? "passed" : "failed"
  };
}

function valueFor(argv, name) {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1] || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await createDashboardStressReport(parseDashboardStressArgs());
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
