// Profile required-check detection. Each SDLC profile declares requiredChecks
// (e.g. a payments-system needs webhook-signature, idempotency, replay, auth,
// audit, live-mode-boundary). This turns that list into REAL present/missing
// detection with evidence (file:line), so profile.gaps reports earned facts
// instead of a generic "verify X" reminder. Heuristic + evidence-backed.

import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "build", "coverage", "generated", ".next", ".expo"]);
const CODE_FILE = /\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$/;
const MAX_FILES = 1500;
const MAX_BYTES = 300000;

// Detector registry: check id -> regex patterns whose presence is evidence the
// check is implemented. Conservative (a match means "implemented somewhere").
export const CHECK_DETECTORS = {
  "webhook-signature": [/webhooks?\.constructEvent/i, /constructEvent\s*\(/, /verif(y|ies)[^\n]{0,40}(signature|webhook|hmac)/i, /x-[a-z0-9-]*signature/i, /createHmac\(/],
  idempotency: [/idempotenc/i, /idempotency[-_]?key/i],
  replay: [/replay[-_ ]?(attack|protect|guard|window)/i, /\bnonce\b/i, /timestamp[^\n]{0,30}(tolerance|window|skew)/i],
  auth: [/(requireAuth|isAuthenticated|verifyToken|verifyJwt|getSession|withAuth)/i, /(^|\/)(auth|middleware)\b/i, /authorization\s*header/i],
  audit: [/audit[-_]?log/i, /\baudit(Event|Trail|Record)/i, /recordProof|appendAudit/i],
  "live-mode-boundary": [/livemode/i, /live[-_ ]?mode/i, /test[-_ ]?mode/i, /process\.env\.[A-Z_]*(LIVE|MODE|ENV)/],
  "webhook-idempotency": [/idempotenc/i],
  "rate-limit": [/rate[-_ ]?limit/i, /\bratelimit/i, /tooManyRequests|429/],
  "input-validation": [/\bzod\b/i, /\bjoi\b/i, /\byup\b/i, /safeParse\(|\.parse\(/, /validate[A-Z]/],
  "error-boundary": [/ErrorBoundary/, /componentDidCatch/, /error\.tsx/i],
  migrations: [/(^|\/)migrations?\//i, /createMigration|runMigration/i],
  rollback: [/\brollback\b/i],
  "secret-scan": [/secret[-_ ]?scan/i, /detect-secrets|gitleaks|trufflehog/i],
  "tool-permissions": [/assertToolAllowed|tool.{0,10}permission|guard/i],
  "schema-contract": [/schema|contract/i, /\.schema\.json$/],
  // mcp-server profile checks
  manifest: [/tools\.json/, /knownKernelToolNames/],
  contracts: [/generate-contracts|tools\.snapshot|mcp:contracts/i],
  smoke: [/mcp[:-]?smoke|smoke\.mjs/i],
  permissions: [/assertToolAllowed|SAFE_ACTIONS|MUTATING_ACTIONS/],
  "approval-boundary": [/requestApproval|approvals|requiresApproval/i],
  "client-config": [/mcp-client-config|claude_desktop_config|buildMcpClientConfig/i],
  release: [/release[:-]?check|release-check|release:provenance/i]
};

export function detectRequiredChecks(root, profile, options = {}) {
  const requiredChecks = profile?.requiredChecks || [];
  if (requiredChecks.length === 0) return { profile: profile?.id || "unknown", checks: [], missing: [], status: "passed" };
  const files = options.files || listCodeFiles(root);
  const checks = requiredChecks.map((id) => {
    const patterns = CHECK_DETECTORS[id];
    if (!patterns) return { check: id, present: false, evidence: null, reason: "no detector — verify manually" };
    const evidence = findEvidence(root, files, patterns);
    return { check: id, present: Boolean(evidence), evidence };
  });
  const missing = checks.filter((entry) => !entry.present).map((entry) => entry.check);
  return {
    profile: profile.id,
    checks,
    missing,
    status: missing.length === 0 ? "passed" : "needs_work"
  };
}

function findEvidence(root, files, patterns) {
  for (const rel of files) {
    let source;
    try {
      if (fs.statSync(path.join(root, rel)).size > MAX_BYTES) continue;
      source = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (patterns.some((pattern) => pattern.test(lines[i]))) return `${rel}:${i + 1}`;
    }
  }
  return null;
}

function listCodeFiles(dir, base = dir, out = []) {
  if (out.length >= MAX_FILES) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) break;
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listCodeFiles(full, base, out);
    else if (CODE_FILE.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(path.relative(base, full));
  }
  return out;
}
