// Claim firewall: scans text (reports, release summaries, final answers) for
// unsupported success claims and for dishonest "blocked" statuses.
//
// This is the Phase A skeleton of the claim firewall described in the blueprint.
// It is pure and deterministic (no IO) so it can be unit tested and later reused
// by report/MCP-output gates. Phase D extends it with proof-graph awareness.
//
// Rules:
// - A success-claim term (done/passed/verified/...) is a VIOLATION when it is an
//   assertion of completed state with no evidence on the line. Imperative feature
//   descriptions ("Generate production-ready templates") and future/conditional
//   statements ("will pass", "should be verified") are exempt.
// - An honest blocked status (blocked_not_verified, ...) is only acceptable when
//   it carries a concrete next proof step; otherwise it is a VIOLATION.
// - Lines inside fenced code blocks (```) are treated as commands/examples and
//   are not scanned for claims.
//
// Phase D adds proof-backed verification (verifyReport): a claim that cites a
// proofId is validated against the ledger (proof exists, passing, fresh); stale
// evidence is downgraded; and public-release / client-connection claims require
// external proof that does not yet exist, so they are rejected.

import { getProof } from "./ledger.mjs";

export const SUCCESS_CLAIM_TERMS = [
  "done",
  "complete",
  "completed",
  "passed",
  "verified",
  "production ready",
  "production-ready",
  "shipped",
  "released",
  "installed",
  "connected",
  "secure",
  "no scaffold",
  "no placeholder",
  "no dead code",
  "100/100",
  "fully working"
];

export const HONEST_BLOCKED_TERMS = [
  "blocked_not_verified",
  "blocked_not_implemented",
  "blocked_ui_proof",
  "blocked_external_proof"
];

const IMPERATIVE_VERBS = new Set([
  "generate", "add", "build", "create", "run", "use", "install", "connect",
  "ship", "release", "make", "write", "enable", "configure", "support",
  "provide", "detect", "score", "prove", "replace", "remove", "delete",
  "document", "validate", "scan", "wire", "keep", "ensure", "list", "emit",
  "return", "block", "allow", "downgrade", "reject", "verify", "test"
]);

const FUTURE_OR_CONDITIONAL = /\b(will|would|should|to be|if|when|once|until|unless)\b/i;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termRegExp(term) {
  const escaped = escapeRegExp(term).replace(/\\?\s+/g, "\\s+");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i");
}

const TERM_PATTERNS = SUCCESS_CLAIM_TERMS.map((term) => ({ term, pattern: termRegExp(term) }));

function matchSuccessTerm(line) {
  for (const { term, pattern } of TERM_PATTERNS) {
    if (pattern.test(line)) return term;
  }
  return null;
}

function hasEvidence(line) {
  if (/\.sage-kernel\/evidence/.test(line)) return true;
  if (/proof_[a-z0-9]/i.test(line) || /\bproofId\b/.test(line)) return true;
  if (/tests?\//.test(line) || /\.test\.(mjs|ts|js)\b/.test(line)) return true;
  if (/https?:\/\//.test(line)) return true;
  const spans = line.match(/`([^`]+)`/g) || [];
  for (const span of spans) {
    if (/(npm |node |yarn |pnpm |\.mjs|\.json|\.ts\b|\/)/.test(span)) return true;
  }
  return false;
}

function hasNextStep(line) {
  if (/`[^`]+`/.test(line)) return true;
  if (/https?:\/\//.test(line)) return true;
  return /\b(next|to verify|once|after|requires?|until|publish|install -g|then)\b/i.test(line);
}

function isExempt(line) {
  const stripped = line.replace(/^[\s>#*\-]+/, "").replace(/^\d+\.\s+/, "").trimStart();
  const firstWord = (stripped.match(/^([A-Za-z][A-Za-z-]*)/) || [, ""])[1].toLowerCase();
  if (IMPERATIVE_VERBS.has(firstWord)) return true;
  if (FUTURE_OR_CONDITIONAL.test(line)) return true;
  return false;
}

// META usage of a success term is NOT a completion assertion: the term appears in
// quotes (a definition), in the fixed phrase "definition of done", or as a
// code/identifier token (`done`, done.generate). These narrow patterns never
// occur in a genuine lie ("All tests passed" is never quoted/dotted), so exempting
// them removes documentation/identifier false-positives without losing recall.
function isMetaTermUsage(line, term) {
  const esc = escapeRegExp(term).replace(/\\?\s+/g, "\\s+");
  if (new RegExp(`["'“‘]${esc}["'”’]`, "i").test(line)) return true; // "done"
  if (/\bdefinition of done\b/i.test(line)) return true;
  if (new RegExp(`\`[^\`]*${esc}[^\`]*\``, "i").test(line)) return true; // `done` / `done.generate`
  if (new RegExp(`(?<![\\w-])${esc}\\.[A-Za-z_]`, "i").test(line)) return true; // done.generate (bare)
  return false;
}

function summarize(line) {
  return line.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function scanClaims(text, options = {}) {
  const source = options.source || "input";
  const lines = String(text ?? "").split(/\r?\n/);
  const findings = [];
  let inFence = false;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const lower = raw.toLowerCase();
    const blocked = HONEST_BLOCKED_TERMS.find((term) => lower.includes(term));
    if (blocked) {
      findings.push({
        source,
        lineNumber,
        line: summarize(raw),
        term: blocked,
        status: hasNextStep(raw) ? "honest_blocked" : "blocked_without_next_step"
      });
      return;
    }

    const term = matchSuccessTerm(raw);
    if (!term) return;
    if (isExempt(raw) || isMetaTermUsage(raw, term)) return;
    findings.push({
      source,
      lineNumber,
      line: summarize(raw),
      term,
      status: hasEvidence(raw) ? "supported" : "unsupported"
    });
  });

  const violations = findings.filter(
    (finding) => finding.status === "unsupported" || finding.status === "blocked_without_next_step"
  );

  return {
    source,
    status: violations.length === 0 ? "passed" : "failed",
    findings,
    violations
  };
}

// ---------------------------------------------------------------------------
// Phase D: proof-backed verification
// ---------------------------------------------------------------------------

const DEFAULT_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const PASSING_PROOF = new Set(["passed", "verified"]);
const PROOF_ID_RE = /proof_[0-9a-fA-F][0-9a-fA-F-]{6,}/g;
const PUBLIC_RELEASE_RE = /\b(published to npm|on the npm registry|available on npm|installed globally|install -g|live on npm|public npm install)\b/i;
const CLIENT_NAMES_RE = /\b(claude desktop|cursor)\b/i;
const CONNECTION_VERB_RE = /\b(connected|verified|working|proven|wired up|integrated)\b/i;

export function extractProofIds(text) {
  return [...String(text ?? "").matchAll(PROOF_ID_RE)].map((match) => match[0]);
}

export function isPublicReleaseClaim(line) {
  return PUBLIC_RELEASE_RE.test(line);
}

export function isClientConnectionClaim(line) {
  return CLIENT_NAMES_RE.test(line) && CONNECTION_VERB_RE.test(line);
}

function isProofFresh(proof, now, freshnessMs) {
  if (proof.freshnessExpiresAt) return now <= Date.parse(proof.freshnessExpiresAt);
  const finished = Date.parse(proof.finishedAt || proof.startedAt || "");
  if (Number.isNaN(finished)) return true;
  return now - finished <= freshnessMs;
}

function evaluateCitedProofs(proofIds, root, now, freshnessMs) {
  return proofIds.map((id) => {
    const proof = getProof(id, { root });
    if (!proof) return { id, state: "missing" };
    if (!PASSING_PROOF.has(proof.status)) return { id, state: "not_passing", status: proof.status };
    if (!isProofFresh(proof, now, freshnessMs)) return { id, state: "stale" };
    return { id, state: "valid" };
  });
}

// Verify a report/answer against real evidence. Unlike scanClaims (lexical only),
// this resolves cited proofIds against the ledger and rejects external claims
// that lack external proof.
export function verifyReport(text, options = {}) {
  const source = options.source || "input";
  const root = options.root;
  const now = options.now || Date.now();
  const freshnessMs = options.freshnessMs || DEFAULT_FRESHNESS_MS;
  const lines = String(text ?? "").split(/\r?\n/);
  const findings = [];
  let inFence = false;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const lower = raw.toLowerCase();
    const blocked = HONEST_BLOCKED_TERMS.find((term) => lower.includes(term));
    if (blocked) {
      findings.push({
        source,
        lineNumber,
        line: summarize(raw),
        term: blocked,
        status: hasNextStep(raw) ? "honest_blocked" : "blocked_without_next_step"
      });
      return;
    }

    const externalKind = isPublicReleaseClaim(raw)
      ? "public_release"
      : isClientConnectionClaim(raw)
        ? "client_connection"
        : null;
    if (externalKind && !isExempt(raw)) {
      const evaluated = evaluateCitedProofs(extractProofIds(raw), root, now, freshnessMs);
      const backed = evaluated.some((entry) => {
        if (entry.state !== "valid") return false;
        const proof = getProof(entry.id, { root });
        return proof && /external|public-install|client-ui/i.test(`${proof.tool || ""} ${proof.verifier || ""}`);
      });
      findings.push({
        source,
        lineNumber,
        line: summarize(raw),
        term: externalKind,
        status: backed ? "supported" : "external_unproven",
        evidence: evaluated
      });
      return;
    }

    const term = matchSuccessTerm(raw);
    if (!term) return;
    if (isExempt(raw) || isMetaTermUsage(raw, term)) return;

    const proofIds = extractProofIds(raw);
    if (proofIds.length > 0) {
      const evaluated = evaluateCitedProofs(proofIds, root, now, freshnessMs);
      let status;
      if (evaluated.some((entry) => entry.state === "valid")) status = "supported";
      else if (evaluated.some((entry) => entry.state === "stale")) status = "stale";
      else status = "unsupported";
      findings.push({ source, lineNumber, line: summarize(raw), term, status, evidence: evaluated });
      return;
    }

    // STRICT (enforcement) mode: a success claim is "supported" ONLY by a
    // resolvable valid proofId — the lexical escape (URL / backtick / tests path)
    // does NOT count. This makes "done" unfakeable; the lenient default is kept
    // for advisory callers.
    findings.push({
      source,
      lineNumber,
      line: summarize(raw),
      term,
      status: (options.strict ? false : hasEvidence(raw)) ? "supported" : "unsupported"
    });
  });

  const VIOLATION_STATUSES = new Set(["unsupported", "blocked_without_next_step", "external_unproven", "stale"]);
  const violations = findings.filter((finding) => VIOLATION_STATUSES.has(finding.status));
  return {
    source,
    status: violations.length === 0 ? "passed" : "failed",
    findings,
    violations
  };
}
