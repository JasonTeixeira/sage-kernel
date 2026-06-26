// Profile-selection learning — remembers operator corrections per repository so
// the loop always picks the best profile without being told again, and tracks
// detection accuracy over time. An operator override is ground truth: when the
// heuristic detector disagrees with a confirmed override, the override wins.
//
// State lives in .sage-kernel/learning/profile-overrides.json (gitignored).

import fs from "node:fs";
import path from "node:path";
import { detectProjectProfile, SDLC_PROFILES } from "./project-detector.mjs";

function storeFile(options = {}) {
  const root = options.root || process.cwd();
  return options.storeFile || path.join(root, ".sage-kernel/learning/profile-overrides.json");
}

function readStore(options = {}) {
  const file = storeFile(options);
  if (!fs.existsSync(file)) return { overrides: {}, feedback: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { overrides: parsed.overrides || {}, feedback: parsed.feedback || [] };
  } catch {
    return { overrides: {}, feedback: [] };
  }
}

function writeStore(store, options = {}) {
  const file = storeFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
}

// Stable per-repo key: package name when present, else the directory name.
export function repoFingerprint(options = {}) {
  const root = options.root || process.cwd();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (pkg.name) return `pkg:${pkg.name}`;
  } catch {
    /* no package.json */
  }
  try {
    return `dir:${path.basename(fs.realpathSync(root))}`;
  } catch {
    return `dir:${path.basename(root)}`;
  }
}

const KNOWN_PROFILE_IDS = new Set(SDLC_PROFILES.map((profile) => profile.id));

// Record an operator correction. Logs feedback comparing it to what detection
// would have said, so accuracy can be tracked.
export function recordProfileOverride(options = {}) {
  const { root, profile, reason } = options;
  if (!profile || !KNOWN_PROFILE_IDS.has(profile)) {
    throw new Error(`Unknown profile id: ${profile}. Known: ${[...KNOWN_PROFILE_IDS].join(", ")}`);
  }
  const fingerprint = options.fingerprint || repoFingerprint({ root });
  const at = options.now || new Date().toISOString();
  let detected = "unknown";
  try {
    detected = detectProjectProfile({ root, projectPath: "." }).profile.id;
  } catch {
    /* detection unavailable */
  }

  const store = readStore(options);
  const previous = store.overrides[fingerprint];
  store.overrides[fingerprint] = {
    profile,
    reason: reason || "operator correction",
    confirmedAt: at,
    history: [...(previous?.history || []), { profile, reason: reason || "operator correction", at }]
  };
  store.feedback.push({ fingerprint, detected, corrected: profile, matched: detected === profile, at });
  writeStore(store, options);
  return store.overrides[fingerprint];
}

export function getProfileOverride(options = {}) {
  const fingerprint = options.fingerprint || repoFingerprint(options);
  return readStore(options).overrides[fingerprint] || null;
}

export function clearProfileOverride(options = {}) {
  const fingerprint = options.fingerprint || repoFingerprint(options);
  const store = readStore(options);
  if (store.overrides[fingerprint]) {
    delete store.overrides[fingerprint];
    writeStore(store, options);
    return true;
  }
  return false;
}

function resolveProfile(id) {
  return SDLC_PROFILES.find((profile) => profile.id === id) || { id, title: id, requiredChecks: [], commands: [], evidence: [] };
}

// Detect with learning applied. When a confirmed override exists for this repo,
// it wins (source "learned"); otherwise heuristic detection is returned
// unchanged (source "detected") — so behavior is identical when nothing is learned.
export function detectProfileWithLearning(options = {}) {
  const detected = detectProjectProfile({ root: options.root, projectPath: options.projectPath || "." });
  const override = getProfileOverride(options);
  if (!override) {
    return { ...detected, source: "detected", learned: false };
  }
  const learnedProfile = resolveProfile(override.profile);
  return {
    ...detected,
    profile: { ...learnedProfile, learned: true },
    detectedProfile: detected.profile.id,
    profileDecision: {
      ...detected.profileDecision,
      winner: override.profile,
      confidenceScore: 99,
      ambiguous: false,
      reason: `learned from operator correction: ${override.reason}`,
      source: "learned"
    },
    confidence: 99,
    source: "learned",
    learned: true
  };
}

export function profileLearningStats(options = {}) {
  const store = readStore(options);
  const feedback = store.feedback;
  const matched = feedback.filter((entry) => entry.matched).length;
  return {
    overrides: Object.keys(store.overrides).length,
    totalFeedback: feedback.length,
    matched,
    detectionAccuracy: feedback.length > 0 ? Number((matched / feedback.length).toFixed(4)) : null
  };
}
