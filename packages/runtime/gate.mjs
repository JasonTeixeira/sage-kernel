// Runtime / production-grade gate (cat: runtime). A statically-green app is not a
// production-grade app: this gate evaluates real runtime evidence — Lighthouse
// category scores, browser console output, and critical-flow smoke results — and
// decides pass/fail against explicit thresholds.
//
// The EVALUATION logic here is pure and fully tested. Capturing the evidence
// requires a running app + a browser (Playwright/Lighthouse); when that toolchain
// or a target app is absent, the gate reports `blocked_not_available` (an honest
// not-applicable, never a fake pass). On a real app (e.g. giggl) it runs live.

import fs from "node:fs";
import path from "node:path";

export const DEFAULT_THRESHOLDS = {
  performance: 0.9,
  accessibility: 0.9,
  "best-practices": 0.9,
  seo: 0.9
};

// Evaluate a Lighthouse result object: { categories: { performance: { score } ... } }.
export function evaluateLighthouse(report = {}, thresholds = DEFAULT_THRESHOLDS) {
  const categories = report.categories || {};
  const checks = Object.entries(thresholds).map(([key, min]) => {
    const score = categories[key]?.score;
    return {
      category: key,
      score: typeof score === "number" ? score : null,
      min,
      status: typeof score !== "number" ? "missing" : score >= min ? "passed" : "failed"
    };
  });
  const failed = checks.filter((c) => c.status !== "passed");
  return { status: failed.length === 0 ? "passed" : "failed", checks };
}

// Fail on any error-level console message captured during the smoke run.
export function evaluateConsole(messages = []) {
  const errors = messages.filter((m) => (m.type || m.level) === "error");
  return { status: errors.length === 0 ? "passed" : "failed", errorCount: errors.length, errors: errors.slice(0, 20) };
}

// Critical-flow smoke results: [{ name, status: "passed"|"failed" }].
export function evaluateSmoke(results = []) {
  const failed = results.filter((r) => r.status !== "passed");
  return { status: results.length > 0 && failed.length === 0 ? "passed" : results.length === 0 ? "empty" : "failed", total: results.length, failed: failed.map((r) => r.name) };
}

export function runtimeVerdict({ lighthouse, console: consoleMessages, smoke, thresholds = DEFAULT_THRESHOLDS } = {}) {
  const lh = evaluateLighthouse(lighthouse || {}, thresholds);
  const cons = evaluateConsole(consoleMessages || []);
  const sm = evaluateSmoke(smoke || []);
  const parts = [lh.status, cons.status, sm.status];
  const status = parts.includes("failed") || sm.status === "empty" ? "failed" : "passed";
  return { status, lighthouse: lh, console: cons, smoke: sm };
}

// Can we capture runtime evidence here? Requires Playwright + a runnable app.
export function detectRuntimeCapability(root = process.cwd()) {
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return { available: false, reasons: ["no package.json"] };
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const reasons = [];
  const hasPlaywright = Boolean(deps["@playwright/test"] || deps.playwright);
  const scripts = pkg.scripts || {};
  const hasServer = Boolean(scripts.dev || scripts.start || scripts.serve || scripts.preview);
  if (!hasPlaywright) reasons.push("no Playwright dependency");
  if (!hasServer) reasons.push("no dev/start/serve script");
  return { available: hasPlaywright && hasServer, hasPlaywright, hasServer, reasons };
}

// Orchestrate the gate for a target. `capture` is an injectable async function
// returning { lighthouse, console, smoke } from a live run; in production it
// shells to Playwright + Lighthouse against the booted app.
export async function runtimeGateForTarget(options = {}) {
  const root = options.root || process.cwd();
  const capability = options.capability || detectRuntimeCapability(root);
  if (!capability.available && !options.capture) {
    return { status: "blocked_not_available", reason: capability.reasons.join("; "), capability };
  }
  const evidence = await options.capture({ root, thresholds: options.thresholds });
  return { status: runtimeVerdict({ ...evidence, thresholds: options.thresholds }).status, capability, ...runtimeVerdict({ ...evidence, thresholds: options.thresholds }) };
}
