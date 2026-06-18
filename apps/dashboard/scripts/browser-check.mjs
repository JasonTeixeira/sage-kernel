import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);
const url = valueFor("--url") || process.env.SAGE_DASHBOARD_URL || "http://127.0.0.1:8787";
const outDir = path.join(root, ".sage-kernel", "dashboard-browser-check");
const chrome = findChrome();

if (!chrome) {
  console.error("Chrome is required for dashboard browser check.");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const health = await fetchJson(new URL("/health", url));
const ready = await fetchJson(new URL("/ready", url));
if (health.status !== "ok") throw new Error(`Dashboard health failed: ${JSON.stringify(health)}`);
if (ready.status !== "ready") throw new Error(`Dashboard readiness failed: ${JSON.stringify(ready)}`);

const desktop = screenshot("desktop", "1440,1000");
const mobile = screenshot("mobile", "390,844");
const dom = dumpDom();
const clickChecks = await runClickChecks();

for (const text of ["Workflow Launcher", "Approval Inbox", "Job Timeline", "MCP Tool Explorer", "DB Ledger"]) {
  if (!dom.includes(text)) throw new Error(`Rendered DOM missing ${text}`);
}

console.log(JSON.stringify({
  status: "passed",
  url,
  chrome,
  screenshots: { desktop, mobile },
  checks: ["health", "ready", "desktop-screenshot", "mobile-screenshot", "dom-sections", ...clickChecks]
}, null, 2));

function valueFor(name) {
  const arg = args.find((item) => item.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : null;
}

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser"
  ];
  for (const candidate of candidates) {
    const result = candidate.startsWith("/") ? fs.existsSync(candidate) : spawnSync("which", [candidate], { encoding: "utf8" }).status === 0;
    if (result) return candidate;
  }
  return null;
}

async function fetchJson(target) {
  const response = await fetch(target);
  if (!response.ok) throw new Error(`${target} returned HTTP ${response.status}`);
  return response.json();
}

function screenshot(name, size) {
  const file = path.join(outDir, `${name}.png`);
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--window-size=${size}`,
    `--screenshot=${file}`,
    url
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 * 4 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Chrome screenshot failed: ${name}`);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`Screenshot missing or empty: ${file}`);
  return file;
}

function dumpDom() {
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--dump-dom",
    url
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
  if (result.status !== 0) throw new Error(result.stderr || "Chrome DOM dump failed");
  return result.stdout;
}

async function runClickChecks() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-dashboard-chrome-"));
  const browser = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ], { stdio: "ignore" });
  try {
    const port = await waitForDevtoolsPort(userDataDir);
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).catch(() => null);
    const pages = await fetchJson(new URL("/json/list", `http://127.0.0.1:${port}`));
    const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (!page) throw new Error("Chrome DevTools page target not found");
    const client = await createCdpClient(page.webSocketDebuggerUrl);
    try {
      await client.call("Runtime.enable");
      await client.call("Page.enable");
      await client.call("Page.navigate", { url });
      await delay(500);
      const result = await client.call("Runtime.evaluate", {
        awaitPromise: true,
        returnByValue: true,
        expression: `(${browserAssertions.toString()})()`
      });
      const value = result.result?.value;
      if (!value?.ok) throw new Error(value?.error || "Browser click assertions failed");
      return value.checks;
    } finally {
      client.close();
    }
  } finally {
    browser.kill("SIGTERM");
    await waitForProcessExit(browser);
    rmRetry(userDataDir);
  }
}

async function waitForDevtoolsPort(userDataDir) {
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (fs.existsSync(portFile)) {
      const [rawPort] = fs.readFileSync(portFile, "utf8").trim().split("\n");
      return Number(rawPort);
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools port did not become available");
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener("open", () => {
      resolve({
        call(method, params = {}) {
          const requestId = ++id;
          ws.send(JSON.stringify({ id: requestId, method, params }));
          return new Promise((callResolve, callReject) => {
            pending.set(requestId, { resolve: callResolve, reject: callReject });
          });
        },
        close() {
          ws.close();
        }
      });
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result || {});
    });
  });
}

function browserAssertions() {
  const checks = [];
  const wait = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeout) {
        reject(new Error("Timed out waiting for browser assertion"));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
  return (async () => {
    try {
      for (const tab of document.querySelectorAll("[data-view-target]")) {
        tab.click();
        const active = document.querySelector(".view.active");
        if (active?.dataset.view !== tab.dataset.viewTarget) {
          throw new Error("View tab did not activate: " + tab.dataset.viewTarget);
        }
      }
      checks.push("view-clicks");

      document.querySelector('[data-workflow-id="daily-summary"] [data-workflow-action]').click();
      await wait(() => {
        const text = document.querySelector("#workflow-status")?.textContent || "";
        return text.includes("executed") && text.includes("Raw audit payload");
      });
      checks.push("safe-workflow-click");

      document.querySelector('[data-workflow-id="full-qa"] [data-workflow-action]').click();
      await wait(() => {
        const text = document.querySelector("#workflow-status")?.textContent || "";
        return text.includes("approval_required") && text.includes("Approval requested");
      });
      checks.push("approval-workflow-click");

      const response = await fetch("/api/workflows");
      const payload = await response.json();
      if (!payload.workflows?.some((workflow) => workflow.id === "daily-summary")) {
        throw new Error("Workflow manifest missing daily-summary");
      }
      checks.push("workflow-api");
      return { ok: true, checks };
    } catch (error) {
      return { ok: false, error: error.message, checks };
    }
  })();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForProcessExit(child) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function rmRetry(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  fs.rmSync(target, { recursive: true, force: true });
}
