// Live runtime capture (P30). Boots the app, collects the three runtime signals
// the evaluator consumes — Lighthouse category scores, browser console messages,
// and critical-flow smoke results — and stops the app.
//
// The browser/Lighthouse work is done by a `runner` (injectable). In tests the
// runner is a deterministic fake; in production it shells to the project's local
// Playwright + Lighthouse. captureRuntime owns orchestration (boot -> run -> stop)
// and is fully testable independent of any real browser.

import { startApp } from "./server-boot.mjs";

export async function captureRuntime(options = {}) {
  if (typeof options.runner !== "function") {
    return { status: "blocked_not_available", reason: "no runtime runner (Playwright/Lighthouse) provided" };
  }
  const boot = options.boot || startApp;
  let app = null;
  try {
    app = await boot(options.bootOptions || { command: process.execPath, args: ["-e", "setTimeout(()=>{}, 1e9)"] });
    const evidence = await options.runner({ baseUrl: app.baseUrl, routes: options.routes || ["/"], root: options.root });
    return { status: "captured", baseUrl: app.baseUrl, ...evidence };
  } finally {
    if (app && typeof app.stop === "function") app.stop();
  }
}
