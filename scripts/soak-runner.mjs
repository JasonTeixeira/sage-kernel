import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDashboardStressReport } from "./stress-dashboard.mjs";
import { createQueueStressReport } from "./stress-queue.mjs";

const profiles = {
  quick: { cycles: 2, queueCount: 100, dashboardCount: 20, concurrency: 5, includeMcp: true, includeDashboard: false },
  local: { cycles: 3, queueCount: 1000, dashboardCount: 200, concurrency: 20, includeMcp: true, includeDashboard: true },
  extended: { cycles: 10, queueCount: 10000, dashboardCount: 1000, concurrency: 50, includeMcp: true, includeDashboard: true }
};

export function parseSoakArgs(argv = process.argv.slice(2)) {
  const profileName = valueFor(argv, "--profile") || "quick";
  const profile = profiles[profileName];
  if (!profile) throw new Error(`Unknown soak profile: ${profileName}`);
  return {
    profile: profileName,
    cycles: numberValue(argv, "--cycles", profile.cycles),
    queueCount: numberValue(argv, "--queue-count", profile.queueCount),
    dashboardCount: numberValue(argv, "--dashboard-count", profile.dashboardCount),
    concurrency: numberValue(argv, "--concurrency", profile.concurrency),
    baseUrl: valueFor(argv, "--url") || "http://127.0.0.1:8787",
    endpoint: valueFor(argv, "--endpoint") || "/health",
    includeDashboard: argv.includes("--dashboard") ? true : argv.includes("--skip-dashboard") ? false : profile.includeDashboard,
    includeMcp: argv.includes("--mcp") ? true : argv.includes("--skip-mcp") ? false : profile.includeMcp
  };
}

export async function createSoakReport(options = {}) {
  const root = options.root || process.cwd();
  const config = {
    ...profiles.quick,
    profile: "custom",
    baseUrl: "http://127.0.0.1:8787",
    endpoint: "/health",
    ...options
  };
  const memory = [];
  const cycles = [];
  const started = Date.now();
  memory.push(memorySample("start"));

  for (let index = 0; index < Number(config.cycles); index += 1) {
    const cycle = { index: index + 1, checks: [] };
    const queue = createQueueStressReport({ root: config.queueRoot, schemaRoot: root, count: config.queueCount });
    cycle.checks.push({ name: "queue", status: queue.status, report: queue });

    if (config.includeDashboard) {
      const dashboard = await createDashboardStressReport({
        baseUrl: config.baseUrl,
        endpoint: config.endpoint,
        count: config.dashboardCount,
        concurrency: config.concurrency,
        fetchImpl: options.fetchImpl
      });
      cycle.checks.push({ name: "dashboard", status: dashboard.status, report: dashboard });
    }

    if (config.includeMcp) {
      const mcp = options.mcpSmoke || runMcpSmoke(root);
      cycle.checks.push({ name: "mcp", status: mcp.status, report: mcp });
    }

    memory.push(memorySample(`cycle_${index + 1}`));
    cycle.status = cycle.checks.every((check) => check.status === "passed") ? "passed" : "failed";
    cycles.push(cycle);
  }

  const durationMs = Date.now() - started;
  const report = {
    type: "soak",
    profile: config.profile,
    cycles,
    memory,
    memoryDelta: memoryDelta(memory),
    durationMs,
    status: cycles.every((cycle) => cycle.status === "passed") ? "passed" : "failed"
  };
  return report;
}

export function runMcpSmoke(root) {
  const result = spawnSync("npm", ["run", "mcp:smoke", "--silent"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 8
  });
  return {
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    stdout: result.stdout?.trim() || "",
    stderr: result.stderr?.trim() || ""
  };
}

export async function runSoakCli(args = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || console.log;
  const stderr = options.stderr || console.error;
  try {
    const report = await createSoakReport({ ...parseSoakArgs(args), ...options });
    stdout(JSON.stringify(report, null, 2));
    return report.status === "passed" ? 0 : 1;
  } catch (error) {
    stderr(error.message);
    return 1;
  }
}

function memorySample(label) {
  const usage = process.memoryUsage();
  return {
    label,
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external
  };
}

function memoryDelta(memory) {
  const first = memory[0] || memorySample("empty_start");
  const last = memory.at(-1) || first;
  return {
    rssBytes: last.rssBytes - first.rssBytes,
    heapUsedBytes: last.heapUsedBytes - first.heapUsedBytes,
    externalBytes: last.externalBytes - first.externalBytes
  };
}

function numberValue(argv, name, fallback) {
  const value = valueFor(argv, name);
  return value ? Number(value) : fallback;
}

function valueFor(argv, name) {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1] || null;
}

/* node:coverage ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await runSoakCli());
}
