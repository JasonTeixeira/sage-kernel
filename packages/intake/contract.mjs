// Contract bridge (P28). Converts a PRD + architecture into the executable task
// contract the loop already consumes (createTaskContract), and into the
// GenerationSpec the generation engine (P29) consumes. This is the seam that lets
// a one-line idea flow into the proven engineering loop.

import { createTaskContract, validateTaskContract } from "../contracts/task-contract.mjs";
import { resolveProfile } from "./spec.mjs";
import { synthesizePrd } from "./prd.mjs";
import { deriveArchitecture } from "./design.mjs";

export function prdToContract(prd, design, profile, options = {}) {
  const resolved = resolveProfile(profile || prd.profileId);
  const contract = createTaskContract({
    root: options.root || process.cwd(),
    goal: prd.goals[0] || prd.idea || `Build a ${resolved.title}`,
    profile: { winner: resolved.id, confidence: 1, ambiguous: false, source: "intake" },
    acceptanceCriteria: prd.requirements.map((r) => ({ id: r.id, label: r.acceptance || r.label })),
    scope: (design?.components || []).map((c) => c.name),
    nonGoals: prd.nonGoals || [],
    riskLevel: options.riskLevel
  });
  return contract;
}

// Build the GenerationSpec (consumed by P29) from the same PRD + design.
export function buildGenerationSpec(prd, design, profile) {
  const resolved = resolveProfile(profile || prd.profileId);
  return {
    name: options_name(prd),
    profileId: resolved.id,
    idea: prd.idea,
    requirements: prd.requirements.map((r) => ({ id: r.id, label: r.label, requiredCheck: r.requiredCheck })),
    components: design?.components || [],
    risk: { level: riskFromRisks(prd.risks), classes: (prd.risks || []).map((x) => x.area) }
  };
}

function options_name(prd) {
  const base = (prd.idea || prd.profileId || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base.slice(0, 40) || "app";
}

function riskFromRisks(risks = []) {
  if (risks.length >= 3) return "high";
  if (risks.length >= 1) return "medium";
  return "low";
}

// Full intake in one call: idea + profile -> { prd, design, contract, spec }.
export function runIntake(idea, profile, options = {}) {
  const prd = synthesizePrd(idea, profile);
  const design = deriveArchitecture(prd, profile);
  const contract = prdToContract(prd, design, profile, options);
  const spec = buildGenerationSpec(prd, design, profile);
  const validity = validateTaskContract(contract);
  return { prd, design, contract, spec, contractValid: validity.valid, contractErrors: validity.errors };
}
