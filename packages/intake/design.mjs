// Architecture derivation (P28). Turns a PRD + profile into a minimal but real
// architecture: components, data flows, and ADR-style decisions. Deterministic
// floor; the gate proves structure (>=1 component, >=1 decision), not prose.

import crypto from "node:crypto";
import { resolveProfile } from "./spec.mjs";

function did(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

// Map a profile to its core architectural components (the surfaces work happens on).
const COMPONENTS_BY_PROFILE = {
  "saas-app": ["ui", "api", "auth", "billing", "data"],
  "payments-system": ["webhook-handler", "idempotency-store", "ledger", "api"],
  "mobile-app": ["ui", "navigation", "api-client", "offline-store"],
  "backend-api": ["routes", "service-layer", "data-access", "auth"],
  "mcp-server": ["tool-registry", "dispatcher", "guard", "proof-spine"],
  "worker-service": ["queue-consumer", "job-handler", "retry-policy", "dead-letter"],
  "static-site": ["pages", "content", "build-pipeline"],
  "ml-training": ["data-loader", "trainer", "evaluator", "model-registry"]
};

export function deriveArchitecture(prd, profile) {
  const resolved = resolveProfile(profile || prd.profileId);
  const names = COMPONENTS_BY_PROFILE[resolved.id] || ["core", "interface", "data"];
  const components = names.map((name) => ({
    name,
    responsibility: `Owns the ${name} concern for ${prd.idea || resolved.title}.`
  }));
  const dataFlows = components.length > 1
    ? [{ from: components[0].name, to: components[components.length - 1].name, kind: "request/response" }]
    : [];
  const decisions = [
    {
      id: did("adr"),
      title: `Adopt the ${resolved.title} gate-set as the definition of done`,
      decision: `Required checks ${resolved.requiredChecks.join(", ")} are enforced gates, not guidance.`,
      rationale: "The profile encodes the production-grade bar for this app type; enforcing it prevents fake-green."
    }
  ];
  return { profileId: resolved.id, components, dataFlows, decisions };
}
