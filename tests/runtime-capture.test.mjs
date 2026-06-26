import test from "node:test";
import assert from "node:assert/strict";
import { startApp, spawnFixtureServerCommand } from "../packages/runtime/server-boot.mjs";
import { captureRuntime } from "../packages/runtime/capture.mjs";
import { runtimeVerdict } from "../packages/runtime/gate.mjs";

test("startApp boots a REAL local server, reaches health, and stops it", async () => {
  const fixture = spawnFixtureServerCommand();
  const app = await startApp({ command: fixture.command, args: fixture.args, portFile: fixture.portFile, timeoutMs: 8000 });
  assert.match(app.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  const res = await fetch(new URL("/health", app.baseUrl));
  assert.equal(res.ok, true);
  app.stop();
  // After stop, the port should stop responding (best-effort, with a short grace).
  await new Promise((r) => setTimeout(r, 300));
  let reachable = true;
  try { await fetch(new URL("/health", app.baseUrl), { signal: AbortSignal.timeout(500) }); } catch { reachable = false; }
  assert.equal(reachable, false);
});

test("startApp throws when the app never becomes healthy", async () => {
  await assert.rejects(
    startApp({ command: process.execPath, args: ["-e", "setTimeout(()=>{},1e9)"], baseUrl: "http://127.0.0.1:1", timeoutMs: 600 }),
    /did not become healthy/
  );
});

test("captureRuntime is blocked (not faked) when no runner is provided", async () => {
  const r = await captureRuntime({ bootOptions: { command: process.execPath, args: ["-e", ""] } });
  assert.equal(r.status, "blocked_not_available");
});

test("captureRuntime orchestrates boot -> run -> stop with an injected runner", async () => {
  let stopped = false;
  const boot = async () => ({ baseUrl: "http://127.0.0.1:9999", stop: () => { stopped = true; } });
  const runner = async ({ baseUrl }) => ({
    lighthouse: { categories: { performance: { score: 0.95 }, accessibility: { score: 0.95 }, "best-practices": { score: 0.95 }, seo: { score: 0.95 } } },
    console: [{ type: "log" }],
    smoke: [{ name: "home", status: "passed", url: baseUrl }]
  });
  const captured = await captureRuntime({ boot, runner, routes: ["/"] });
  assert.equal(captured.status, "captured");
  assert.equal(stopped, true, "app must be stopped after capture");
  // The captured evidence feeds the existing evaluator to a real verdict.
  assert.equal(runtimeVerdict(captured).status, "passed");
});

test("captured evidence with a console error yields a failed verdict", async () => {
  const boot = async () => ({ baseUrl: "http://x", stop: () => {} });
  const runner = async () => ({
    lighthouse: { categories: { performance: { score: 0.95 }, accessibility: { score: 0.95 }, "best-practices": { score: 0.95 }, seo: { score: 0.95 } } },
    console: [{ type: "error", text: "Uncaught" }],
    smoke: [{ name: "home", status: "passed" }]
  });
  const captured = await captureRuntime({ boot, runner });
  assert.equal(runtimeVerdict(captured).status, "failed");
});

test("E2E: captureRuntime uses the default real boot against a fixture server", async () => {
  const fixture = spawnFixtureServerCommand();
  let sawBaseUrl = null;
  const captured = await captureRuntime({
    bootOptions: { command: fixture.command, args: fixture.args, portFile: fixture.portFile, timeoutMs: 8000 },
    runner: async ({ baseUrl }) => {
      sawBaseUrl = baseUrl;
      const res = await fetch(new URL("/health", baseUrl));
      return {
        lighthouse: { categories: { performance: { score: 0.95 }, accessibility: { score: 0.95 }, "best-practices": { score: 0.95 }, seo: { score: 0.95 } } },
        console: [],
        smoke: [{ name: "health", status: res.ok ? "passed" : "failed" }]
      };
    }
  });
  assert.equal(captured.status, "captured");
  assert.match(sawBaseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(runtimeVerdict(captured).status, "passed");
});

test("the app is stopped even if the runner throws (no orphaned process)", async () => {
  let stopped = false;
  const boot = async () => ({ baseUrl: "http://x", stop: () => { stopped = true; } });
  const runner = async () => { throw new Error("browser crashed"); };
  await assert.rejects(captureRuntime({ boot, runner }), /browser crashed/);
  assert.equal(stopped, true);
});
