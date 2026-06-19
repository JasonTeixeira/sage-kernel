import { fileURLToPath } from "node:url";

export function parseDashboardStressArgs(argv = process.argv.slice(2)) {
  return {
    baseUrl: valueFor(argv, "--url") || "http://127.0.0.1:8787",
    count: Number(valueFor(argv, "--count") || 100),
    concurrency: Number(valueFor(argv, "--concurrency") || 10),
    endpoint: valueFor(argv, "--endpoint") || "/api/snapshot",
    timeoutMs: Number(valueFor(argv, "--timeout-ms") || 10000),
    maxFailureRate: Number(valueFor(argv, "--max-failure-rate") || 0)
  };
}

export async function createDashboardStressReport(options = {}) {
  const baseUrl = options.baseUrl || "http://127.0.0.1:8787";
  const count = Number(options.count ?? 100);
  const concurrency = Number(options.concurrency ?? 10);
  const endpoint = options.endpoint || "/api/snapshot";
  const timeoutMs = Number(options.timeoutMs ?? 10000);
  const maxFailureRate = Number(options.maxFailureRate ?? 0);
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => Date.now());
  const memoryStart = memorySample();
  const latencies = [];
  let failures = 0;
  let next = 0;
  const statusCodes = {};
  const errorCodes = {};
  const samples = [];
  const started = now();

  async function worker() {
    while (next < count) {
      next += 1;
      const requestStarted = now();
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await fetchImpl(new URL(endpoint, baseUrl), controller ? { signal: controller.signal } : undefined);
        await response.text();
        const code = String(response.status || (response.ok ? 200 : 0));
        statusCodes[code] = (statusCodes[code] || 0) + 1;
        if (!response.ok) {
          failures += 1;
          addSample(samples, { kind: "status", code, latencyMs: now() - requestStarted });
        }
      } catch (error) {
        failures += 1;
        const code = errorCode(error);
        errorCodes[code] = (errorCodes[code] || 0) + 1;
        addSample(samples, { kind: "error", code, message: error?.message || "", latencyMs: now() - requestStarted });
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      latencies.push(now() - requestStarted);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  latencies.sort((a, b) => a - b);
  const durationMs = now() - started;
  const memoryEnd = memorySample();
  const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] || 0;
  const failureRate = count > 0 ? failures / count : 0;
  return {
    type: "dashboard-stress",
    baseUrl,
    endpoint,
    count,
    concurrency,
    timeoutMs,
    maxFailureRate,
    failures,
    failureRate: Number(failureRate.toFixed(6)),
    statusCodes,
    errorCodes,
    samples,
    durationMs,
    requestsPerSecond: Number((count / (durationMs / 1000 || 1)).toFixed(2)),
    latencyMs: {
      min: latencies[0] || 0,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      p999: percentile(0.999),
      max: latencies.at(-1) || 0
    },
    memory: {
      start: memoryStart,
      end: memoryEnd,
      delta: {
        rssBytes: memoryEnd.rssBytes - memoryStart.rssBytes,
        heapUsedBytes: memoryEnd.heapUsedBytes - memoryStart.heapUsedBytes,
        externalBytes: memoryEnd.externalBytes - memoryStart.externalBytes
      }
    },
    status: failureRate <= maxFailureRate ? "passed" : "failed"
  };
}

function addSample(samples, sample) {
  if (samples.length < 10) samples.push(sample);
}

function errorCode(error) {
  if (error?.name === "AbortError") return "timeout";
  if (error?.code) return error.code;
  if (error?.cause?.code) return error.cause.code;
  const message = String(error?.message || "");
  if (/network|fetch|connection|econn/i.test(message)) return "connection_error";
  return error?.name && error.name !== "Error" ? error.name : "error";
}

function memorySample() {
  const usage = process.memoryUsage();
  return {
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external
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
