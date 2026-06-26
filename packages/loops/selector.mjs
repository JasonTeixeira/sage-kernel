// Loop selector — classifies a goal to the best engineering loop, with a
// per-repo learnable override (operator correction = ground truth). Precedence:
// explicit > learned > classified > default(feature).

import fs from "node:fs";
import path from "node:path";
import { getLoop, ENGINEERING_LOOPS } from "./registry.mjs";
import { repoFingerprint } from "../profiles/profile-learning.mjs";
import { recommendLoop } from "../learning/outcomes.mjs";

const CLASSIFIERS = [
  // Specific intents first (first match wins); generic feature is the default.
  { loop: "incident-response", pattern: /\b(incident|outage|p0|p1|sev[- ]?[012]|emergency|production (is )?(down|broken|failing))\b/i },
  { loop: "migration", pattern: /\b(migrat|port .* (to|from|off)|convert .* to|move .* (to|off)|rewrite .* in)/i },
  { loop: "dependency-upgrade", pattern: /\b(dependenc|bump|outdated|renovate|upgrade .* (package|deps?|version)|npm update)/i },
  { loop: "performance-tuning", pattern: /\b(perf|performance|slow|latency|optimi|speed ?up|bottleneck|throughput)/i },
  { loop: "security-hardening", pattern: /\b(harden|vulnerab|injection|xss|csrf|owasp|cve|sanitiz|secure the)/i },
  { loop: "greenfield", pattern: /\b(greenfield|from scratch|bootstrap|scaffold|kick ?off|brand[- ]?new|new (app|project|service|repo))\b/i },
  { loop: "refactor-clean", pattern: /\b(refactor|clean ?up|dead[- ]?code|tech ?debt|debt|tidy|simplif|deduplicat|restructur)\b/i },
  { loop: "bugfix", pattern: /\b(fix|bug|broken|regression|failing|error|defect|crash|hotfix)\b/i },
  { loop: "hardening-audit", pattern: /\b(audit|assess|posture|scorecard|review the|evaluate)\b/i },
  { loop: "feature", pattern: /\b(add|build|implement|feature|create|introduce|new |support for)\b/i }
];

export function classifyGoalToLoop(goal) {
  const text = String(goal || "");
  for (const entry of CLASSIFIERS) {
    if (entry.pattern.test(text)) return entry.loop;
  }
  return "feature";
}

function storeFile(options = {}) {
  const root = options.root || process.cwd();
  return options.storeFile || path.join(root, ".sage-kernel/learning/loop-overrides.json");
}

function readStore(options) {
  const file = storeFile(options);
  if (!fs.existsSync(file)) return { overrides: {}, feedback: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { overrides: parsed.overrides || {}, feedback: parsed.feedback || [] };
  } catch {
    return { overrides: {}, feedback: [] };
  }
}

function writeStore(store, options) {
  const file = storeFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
}

export function recordLoopOverride(options = {}) {
  const { root, loop, reason } = options;
  if (!getLoop(loop)) {
    throw new Error(`Unknown loop id: ${loop}. Known: ${ENGINEERING_LOOPS.map((item) => item.id).join(", ")}`);
  }
  const fingerprint = options.fingerprint || repoFingerprint({ root });
  const at = options.now || new Date().toISOString();
  const store = readStore(options);
  store.overrides[fingerprint] = { loop, reason: reason || "operator correction", confirmedAt: at };
  store.feedback.push({ fingerprint, loop, at });
  writeStore(store, options);
  return store.overrides[fingerprint];
}

export function getLoopOverride(options = {}) {
  const fingerprint = options.fingerprint || repoFingerprint(options);
  return readStore(options).overrides[fingerprint] || null;
}

export function clearLoopOverride(options = {}) {
  const fingerprint = options.fingerprint || repoFingerprint(options);
  const store = readStore(options);
  if (store.overrides[fingerprint]) {
    delete store.overrides[fingerprint];
    writeStore(store, options);
    return true;
  }
  return false;
}

// Choose the loop. Explicit wins; then a learned per-repo override; then the
// goal classifier; default feature.
export function selectLoop(options = {}) {
  const { root, goal, loop } = options;
  if (loop && getLoop(loop)) {
    return { loop, source: "explicit", reason: `operator selected ${loop}` };
  }
  const override = root !== undefined ? getLoopOverride({ root }) : null;
  if (override) {
    return { loop: override.loop, source: "learned", reason: `learned default for this repo: ${override.reason}` };
  }
  // Outcome-learned: prefer the loop with the best evidenced pass-rate for this repo.
  const recommended = root !== undefined && options.useOutcomes !== false ? recommendLoop({ root }) : null;
  if (recommended && getLoop(recommended.loop)) {
    return { loop: recommended.loop, source: "outcome-learned", reason: `best evidenced pass-rate for this repo (${recommended.stats.passRate})` };
  }
  const classified = classifyGoalToLoop(goal);
  return { loop: classified, source: "classified", reason: `goal classified to ${classified}` };
}
