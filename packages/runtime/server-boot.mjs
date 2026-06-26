// App server boot/stop with health-wait (P30). Boots a target app's dev/start
// command, waits until its health endpoint responds, returns a baseUrl, and
// guarantees teardown. Used by the live runtime capture; modeled on the proven
// kill-restart fixture so it is robust to slow starts and never orphans a process.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export async function startApp(options = {}) {
  const cwd = options.cwd || process.cwd();
  const timeoutMs = Number(options.timeoutMs || 15000);
  const healthPath = options.healthPath || "/health";
  const fetchImpl = options.fetchImpl || fetch;
  const child = spawn(options.command, options.args || [], { cwd, stdio: "ignore", env: { ...process.env, ...(options.env || {}) } });

  // baseUrl is either given directly or read from a port file the app writes.
  const deadline = Date.now() + timeoutMs;
  let baseUrl = options.baseUrl || null;
  while (Date.now() < deadline) {
    if (!baseUrl && options.portFile && fs.existsSync(options.portFile)) {
      try {
        const details = JSON.parse(fs.readFileSync(options.portFile, "utf8"));
        baseUrl = `http://127.0.0.1:${details.port}`;
      } catch { /* not written fully yet */ }
    }
    if (baseUrl && (await isHealthy(baseUrl, healthPath, fetchImpl))) {
      return { pid: child.pid, baseUrl, stop: () => stopChild(child) };
    }
    if (child.exitCode !== null) break;
    await delay(50);
  }
  stopChild(child);
  throw new Error(`app did not become healthy within ${timeoutMs}ms`);
}

async function isHealthy(baseUrl, healthPath, fetchImpl) {
  try {
    const res = await fetchImpl(new URL(healthPath, baseUrl), { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

function stopChild(child) {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2000).unref?.();
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Test/CI helper: spawn a real local HTTP server that writes its port file, so
// boot/health/stop is exercised end-to-end without a real framework dev server.
export function spawnFixtureServerCommand() {
  const portFile = path.join(os.tmpdir(), `sage-bootfix-${process.pid}-${Math.floor(performance.now())}.json`);
  const code = `const http=require('node:http');const fs=require('node:fs');const s=http.createServer((q,r)=>{r.writeHead(q.url==='/health'?200:404);r.end('ok')});s.listen(0,'127.0.0.1',()=>fs.writeFileSync(process.argv[1],JSON.stringify({port:s.address().port})));`;
  return { command: process.execPath, args: ["-e", code, portFile], portFile };
}
