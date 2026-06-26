// P13b: turn a fuzzy objective into a real task DAG. This is the "intelligence"
// half the driver was missing. It is structural and deterministic by default
// (parse the objective into clauses, classify each, derive dependency edges, and
// fold in the project's actual profile gaps), with an injectable model-backed
// decomposer for cases where structure isn't enough. Output is the task[] shape
// driveGoal consumes: { id, goal, acceptanceCriteria, files, deps, requiresApproval }.

import { createProfileGapReport } from "../../apps/mcp-server/src/sdlc-tools.mjs";

// Clause classification → phase. Order matters: a clause matching "test" is a
// verification phase even if it also says "build the tests".
// Stems (prefix match, no trailing \b) so "security"/"authorization"/"vulnerability"
// all classify. Order matters: secure beats review for "security review".
const PHASE_RULES = [
  { phase: "secure", deps: ["implement"], re: /\b(secur|auth|encrypt|sanitiz|vulnerab|injection|csrf|xss)/i },
  { phase: "test", deps: ["implement"], re: /\b(test|coverage|unit|e2e|integration|spec)/i },
  { phase: "review", deps: ["implement"], re: /\b(review|audit|lint|refactor|clean up|quality)/i },
  { phase: "release", deps: ["implement", "test"], requiresApproval: true, re: /\b(deploy|release|publish|ship|rollout|production)/i },
  { phase: "document", deps: ["implement"], re: /\b(document|docs|readme|changelog)/i }
];

function splitObjective(objective) {
  return String(objective)
    .split(/\s*(?:,|;|\+|\band then\b|\bthen\b|\band\b|\bwith\b|\bplus\b|\bincluding\b)\s*/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 2);
}

function slug(text, fallback) {
  const s = String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
  return s || fallback;
}

function classify(clause) {
  for (const rule of PHASE_RULES) if (rule.re.test(clause)) return rule;
  return { phase: "implement", deps: [] };
}

// Build the structural DAG from the objective clauses + profile gaps.
function structuralDecompose({ objective, root, projectPath }) {
  const clauses = splitObjective(objective);
  const tasks = [];
  const phaseIds = {}; // phase -> [taskId] (so deps can resolve to concrete ids)

  // The first clause (or the whole objective) is always the core implementation.
  const implClause = clauses[0] || objective;
  const implId = `implement-${slug(implClause, "core")}`;
  tasks.push({ id: implId, phase: "implement", goal: implClause, acceptanceCriteria: [implClause], deps: [] });
  (phaseIds.implement ||= []).push(implId);

  for (const clause of clauses.slice(1)) {
    const rule = classify(clause);
    if (rule.phase === "implement") {
      const id = `implement-${slug(clause, `step-${tasks.length}`)}`;
      tasks.push({ id, phase: "implement", goal: clause, acceptanceCriteria: [clause], deps: [] });
      (phaseIds.implement ||= []).push(id);
    } else {
      const id = `${rule.phase}-${slug(clause, rule.phase)}`;
      tasks.push({ id, phase: rule.phase, goal: clause, acceptanceCriteria: [clause], deps: [...(rule.deps || [])], requiresApproval: rule.requiresApproval || false });
      (phaseIds[rule.phase] ||= []).push(id);
    }
  }

  // Fold in REAL profile gaps as remediation tasks (grounded, not guessed).
  let gaps = [];
  try {
    const report = createProfileGapReport(root, { projectPath: projectPath || "." });
    gaps = (report.missing || []).slice(0, 6);
  } catch { gaps = []; }
  gaps.forEach((gap, index) => {
    const id = `gap-${index + 1}-${slug(gap, `fix-${index + 1}`)}`;
    tasks.push({ id, phase: "gap", goal: `Close profile gap: ${gap}`, acceptanceCriteria: [gap], deps: [...(phaseIds.implement || [])] });
  });

  // Resolve phase-name deps to concrete task ids (e.g. a test task depends on ALL
  // implement tasks). Then add a final verify task gating on everything.
  const resolved = tasks.map((task) => ({
    ...task,
    deps: (task.deps || []).flatMap((dep) => phaseIds[dep] || (tasks.some((t) => t.id === dep) ? [dep] : []))
  }));
  const verifyId = "verify-goal";
  resolved.push({
    id: verifyId, phase: "verify", goal: `Verify the whole goal is met: ${objective}`,
    acceptanceCriteria: [`All sub-tasks pass and the goal "${objective}" is satisfied.`],
    deps: resolved.map((t) => t.id)
  });
  return resolved;
}

export async function decomposeGoal(options = {}) {
  const objective = options.objective;
  if (!objective || !String(objective).trim()) throw new Error("decomposeGoal requires an objective");
  if (typeof options.modelDecompose === "function") {
    const tasks = await options.modelDecompose({ objective, root: options.root });
    if (Array.isArray(tasks) && tasks.length) return tasks;
  }
  return structuralDecompose({ objective, root: options.root || process.cwd(), projectPath: options.projectPath });
}
