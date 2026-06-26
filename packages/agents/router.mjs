// Agent Router — selects the right agent for each gate/phase based on the gate
// category, detected languages, profile, and risk. This is deterministic routing
// (a recommendation layer): the operate loop annotates every gate with the agent
// that should run/verify it, and a real agent runtime dispatches accordingly.

import { detectProfileWithLearning } from "../profiles/profile-learning.mjs";
import { classifyDiff } from "../risk/diff-classifier.mjs";
import { createTaskContract } from "../contracts/task-contract.mjs";

export const AGENT_CATALOG = [
  { id: "tdd-guide", role: "testing", gates: ["impacted-tests", "migration-tests", "rollback-tests"], description: "Writes tests first and verifies coverage." },
  { id: "code-reviewer", role: "review", gates: ["code-review"], description: "General code-quality review." },
  { id: "senior-engineer", role: "review", gates: ["senior-review"], description: "Senior architectural and quality review." },
  { id: "security-reviewer", role: "security", gates: ["secret-scan", "security-proof", "redteam"], description: "Security and adversarial review." },
  { id: "release-engineer", role: "release", gates: ["release-check"], description: "Release readiness and provenance." }
];

// Language-specialized reviewers take precedence for review gates.
const LANGUAGE_REVIEWERS = {
  typescript: "typescript-reviewer",
  javascript: "typescript-reviewer",
  python: "python-reviewer",
  go: "go-reviewer",
  rust: "rust-reviewer",
  swift: "swift-reviewer",
  java: "java-reviewer",
  ruby: "ruby-reviewer"
};

const REVIEW_GATES = new Set(["code-review", "senior-review"]);

export function selectAgent(options = {}) {
  const gate = options.gate;
  const languages = options.languages || [];
  const riskLevel = options.riskLevel || "medium";

  const base = AGENT_CATALOG.find((agent) => agent.gates.includes(gate));
  let agent = base ? base.id : "general-purpose";
  let reason = base ? `gate '${gate}' routes to ${agent}` : `no specialized agent for '${gate}'; using general-purpose`;

  if (REVIEW_GATES.has(gate)) {
    const lang = languages.find((language) => LANGUAGE_REVIEWERS[language]);
    if (lang) {
      agent = LANGUAGE_REVIEWERS[lang];
      reason = `${gate} on ${lang} routes to ${agent}`;
    }
  }

  let confidence = base ? 0.8 : 0.4;
  if (REVIEW_GATES.has(gate) && languages.some((language) => LANGUAGE_REVIEWERS[language])) confidence = 0.9;
  if ((riskLevel === "high") && base && base.role === "security") confidence = 0.95;

  return { gate, agent, role: base ? base.role : "general", reason, confidence };
}

export function routePlan(plan = [], context = {}) {
  return plan.map((gate) => selectAgent({ gate, ...context }));
}

function safeDetect(root) {
  try {
    const detected = detectProfileWithLearning({ root, projectPath: "." });
    return { profile: detected.profile?.id || "unknown", languages: detected.languages || [], source: detected.source || "detected" };
  } catch {
    return { profile: "unknown", languages: [], source: "detected" };
  }
}

// Route an entire task: detect profile/languages, derive the required gate plan
// from a task contract, and assign an agent to each gate.
export function routeTask(options = {}) {
  const root = options.root || process.cwd();
  const goal = options.goal || "";
  const detected = safeDetect(root);
  const languages = options.languages || detected.languages;
  const contract = createTaskContract({
    root,
    goal,
    acceptanceCriteria: options.acceptanceCriteria || ["Routed task."],
    extraRiskClasses: options.files ? classifyDiff(options.files).classes : []
  });
  const plan = [
    ...contract.requiredTests,
    ...contract.requiredReviewGates,
    ...contract.requiredSecurityGates,
    ...contract.requiredReleaseGates
  ];
  return {
    goal,
    profile: detected.profile,
    profileSource: detected.source,
    languages,
    riskLevel: contract.riskClassification.level,
    routes: routePlan(plan, { languages, profile: detected.profile, riskLevel: contract.riskClassification.level })
  };
}
