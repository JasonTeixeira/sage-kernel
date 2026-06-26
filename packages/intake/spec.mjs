// GenerationSpec — the structured, validated hand-off from intake (P28) to the
// generation engine (P29). A plain structural validator (no external dep in the
// hot path) so every branch is testable and the contract is explicit.
//
// Shape:
//   { name, profileId, idea, requirements:[{id,label,requiredCheck}],
//     components:[{name,responsibility}], risk:{level,classes} }

import { SDLC_PROFILES } from "../profiles/project-detector.mjs";

export function resolveProfile(profile) {
  if (profile && typeof profile === "object" && Array.isArray(profile.requiredChecks)) return profile;
  const id = typeof profile === "string" ? profile : profile?.id || profile?.winner;
  return SDLC_PROFILES.find((p) => p.id === id) || SDLC_PROFILES.find((p) => p.id === "library");
}

export function validateGenerationSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") return { valid: false, errors: ["spec must be an object"] };
  if (!spec.name || typeof spec.name !== "string") errors.push("name must be a non-empty string");
  if (!spec.profileId || typeof spec.profileId !== "string") errors.push("profileId must be a string");
  if (!spec.idea || typeof spec.idea !== "string") errors.push("idea must be a non-empty string");
  if (!Array.isArray(spec.requirements) || spec.requirements.length === 0) errors.push("requirements must be a non-empty array");
  else if (spec.requirements.some((r) => !r.id || !r.label)) errors.push("every requirement needs id + label");
  if (!Array.isArray(spec.components)) errors.push("components must be an array");
  if (!spec.risk || !["low", "medium", "high"].includes(spec.risk.level)) errors.push("risk.level must be low|medium|high");
  return { valid: errors.length === 0, errors };
}
