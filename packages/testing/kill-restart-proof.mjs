import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export async function createKillRestartProof(options = {}) {
  const startedAt = new Date().toISOString();
  const root = options.root || process.cwd();
  const timeoutMs = Number(options.timeoutMs || 5000);
  const starter = options.starter || startFixtureHttpProcess;
  const save = options.save !== false;
  const events = [];
  let first = null;
  let second = null;
  try {
    first = await starter({ root, timeoutMs, label: "first" });
    events.push(event("started", { phase: "first", pid: first.pid, baseUrl: first.baseUrl }));
    const beforeHealth = await checkHealth(first.baseUrl, { timeoutMs, fetchImpl: options.fetchImpl });
    events.push(event("health", { phase: "before_kill", ...beforeHealth }));

    const killed = await stopProcess(first, { signal: "SIGTERM", timeoutMs });
    events.push(event("killed", { phase: "first", ...killed }));
    const stopped = await waitForStopped(first.baseUrl, { timeoutMs, fetchImpl: options.fetchImpl });
    events.push(event("stopped", stopped));

    second = await starter({ root, timeoutMs, label: "second" });
    events.push(event("restarted", { phase: "second", pid: second.pid, baseUrl: second.baseUrl }));
    const afterHealth = await checkHealth(second.baseUrl, { timeoutMs, fetchImpl: options.fetchImpl });
    events.push(event("health", { phase: "after_restart", ...afterHealth }));

    const cleanup = await stopProcess(second, { signal: "SIGTERM", timeoutMs });
    events.push(event("cleanup", cleanup));

    const report = {
      type: "kill-restart-proof",
      status: beforeHealth.status === "passed" && killed.status === "passed" && stopped.status === "passed" && afterHealth.status === "passed"
        ? "passed"
        : "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      events
    };
    if (save) writeEvidence(root, report);
    return report;
  } catch (error) {
    if (first) await stopProcess(first, { signal: "SIGTERM", timeoutMs }).catch(() => {});
    if (second) await stopProcess(second, { signal: "SIGTERM", timeoutMs }).catch(() => {});
    const report = {
      type: "kill-restart-proof",
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      events,
      error: error.message
    };
    if (save) writeEvidence(root, report);
    return report;
  }
}

async function startFixtureHttpProcess(options = {}) {
  const portFile = path.join(os.tmpdir(), `sage-kill-restart-${process.pid}-${Date.now()}-${options.label || "process"}.json`);
  const child = spawn(process.execPath, [
    "-e",
    `const http = require('node:http');
const fs = require('node:fs');
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', pid: process.pid }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: 'missing' }));
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(process.argv[1], JSON.stringify({ port: server.address().port, pid: process.pid }));
});`,
    portFile
  ], { cwd: options.root || process.cwd(), stdio: "ignore" });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (fs.existsSync(portFile)) {
      const details = JSON.parse(fs.readFileSync(portFile, "utf8"));
      fs.rmSync(portFile, { force: true });
      return {
        pid: child.pid,
        baseUrl: `http://127.0.0.1:${details.port}`,
        child
      };
    }
    if (child.exitCode !== null) break;
    await delay(25);
  }
  child.kill("SIGTERM");
  throw new Error("Kill/restart fixture process did not start.");
}

async function checkHealth(baseUrl, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(new URL("/health", baseUrl), { signal: AbortSignal.timeout(options.timeoutMs || 5000) });
    const body = await response.text();
    return {
      status: response.ok ? "passed" : "failed",
      statusCode: response.status,
      body: body.slice(0, 500)
    };
  } catch (error) {
    return { status: "failed", error: error.message };
  }
}

async function waitForStopped(baseUrl, options = {}) {
  const deadline = Date.now() + Number(options.timeoutMs || 5000);
  while (Date.now() < deadline) {
    const health = await checkHealth(baseUrl, { ...options, timeoutMs: 300 });
    if (health.status === "failed") {
      return { status: "passed", baseUrl, observed: health.error || health.statusCode || "unreachable" };
    }
    await delay(50);
  }
  return { status: "failed", baseUrl, observed: "health endpoint still reachable after kill" };
}

async function stopProcess(processHandle, options = {}) {
  if (!processHandle?.child || processHandle.child.exitCode !== null) {
    return { status: "passed", pid: processHandle?.pid || null, exitCode: processHandle?.child?.exitCode ?? null, alreadyExited: true };
  }
  const signal = options.signal || "SIGTERM";
  const child = processHandle.child;
  const exited = new Promise((resolve) => {
    child.once("exit", (code, receivedSignal) => resolve({ code, signal: receivedSignal }));
  });
  child.kill(signal);
  const result = await withTimeout(exited, Number(options.timeoutMs || 5000), async () => {
    child.kill("SIGKILL");
    return { code: child.exitCode, signal: "SIGKILL", timeout: true };
  });
  return {
    status: result.timeout ? "failed" : "passed",
    pid: processHandle.pid,
    signal,
    exitCode: result.code,
    exitSignal: result.signal
  };
}

function writeEvidence(root, report) {
  const file = path.join(root, ".sage-kernel/evidence/kill-restart-latest.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

function event(type, fields = {}) {
  return { type, at: new Date().toISOString(), ...fields };
}

async function withTimeout(promise, timeoutMs, onTimeout) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(async () => resolve(await onTimeout()), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const __killRestartTestInternals = {
  checkHealth,
  stopProcess,
  waitForStopped
};
