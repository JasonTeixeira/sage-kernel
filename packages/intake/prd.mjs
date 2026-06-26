// PRD synthesis (P28). Turns a one-line idea + profile into a structured product
// requirements doc. DETERMINISTIC FLOOR: every profile required-check becomes a
// requirement with an acceptance criterion, so the PRD provably covers the
// profile's definition of done. Model enrichment (richer stories/edge cases) is
// optional and gated on SAGE_AGENT_COMMAND — it never weakens the floor.

import crypto from "node:crypto";
import { resolveProfile } from "./spec.mjs";

// Required-checks that imply a security/abuse risk worth calling out explicitly.
const RISKY_CHECKS = new Set([
  "auth", "authorization", "webhook-signature", "idempotency", "replay",
  "tenant-isolation", "live-mode-boundary", "phi-boundary", "access-control",
  "money-movement-boundary", "audit-log", "secrets", "permissions", "encryption"
]);

function rid(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function synthesizePrd(idea, profile) {
  const resolved = resolveProfile(profile);
  const cleanIdea = String(idea || "").trim();
  const requirements = resolved.requiredChecks.map((check) => ({
    id: rid("req"),
    requiredCheck: check,
    label: `Satisfy the "${check}" check for a ${resolved.title}`,
    acceptance: `The "${check}" gate passes with proof for: ${cleanIdea || resolved.title}`
  }));
  const risks = resolved.requiredChecks
    .filter((check) => RISKY_CHECKS.has(check))
    .map((check) => ({ id: rid("risk"), area: check, description: `Failure mode in "${check}" must be tested and proven.` }));

  return {
    idea: cleanIdea,
    profileId: resolved.id,
    profileTitle: resolved.title,
    goals: [cleanIdea ? `Deliver: ${cleanIdea}` : `Deliver a production-grade ${resolved.title}`],
    userStories: [
      { id: rid("story"), as: "user", want: cleanIdea || `a working ${resolved.title}`, so: "I get the intended value safely" }
    ],
    requirements,
    nonGoals: ["Anything outside the stated idea and the profile's required checks (avoid scope creep)."],
    risks,
    coversAllRequiredChecks: requirements.length === resolved.requiredChecks.length
  };
}
