import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runSelfAudit } from "../drift/drift-engine.mjs";

export function createRepairPlan(input = {}) {
  const failedGate = input.failedGate || "unknown";
  const signal = input.signal || "No failure signal provided.";
  return {
    status: "planned",
    failedGate,
    signal,
    approvalRequired: true,
    retryBudget: Number.isInteger(input.retryBudget) ? input.retryBudget : 1,
    steps: [
      { id: "inspect", action: "Inspect the exact failed gate output.", mutates: false },
      { id: "patch", action: "Apply the smallest bounded patch.", mutates: true },
      { id: "verify", action: `Rerun exact failed gate: ${failedGate}`, mutates: false },
      { id: "rollback", action: "Rollback patch if verification fails.", mutates: true }
    ],
    stopConditions: ["missing approval", "retry budget exhausted", "patch outside allowed root", "verification still failing"]
  };
}

export function applyApprovedRepair(plan, options = {}) {
  if (!plan || plan.status !== "planned") throw new Error("Repair plan is required.");
  if (!options.approved) {
    return { status: "blocked", reason: "approval_required", plan, patches: [], verification: null, rollback: [] };
  }
  const root = path.resolve(options.root || process.cwd());
  const target = path.resolve(root, options.relativePath || "SELF_HEALING_PROOF.txt");
  if (!target.startsWith(root)) throw new Error("Repair target must stay inside root.");
  const before = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  const next = options.content || "self-healing proof repaired\n";
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, next);
  const verification = runCommand(options.verifyCommand || "test -f SELF_HEALING_PROOF.txt", root);
  const rollback = [];
  if (verification.status !== 0) {
    if (before === null) fs.rmSync(target, { force: true });
    else fs.writeFileSync(target, before);
    rollback.push({ target: path.relative(root, target), status: "rolled_back" });
  }
  return {
    status: verification.status === 0 ? "passed" : "failed",
    plan,
    patches: [{ target: path.relative(root, target), beforeExists: before !== null }],
    verification,
    rollback,
    audit: [
      { type: "self_healing.plan", failedGate: plan.failedGate },
      { type: "self_healing.patch", target: path.relative(root, target) },
      { type: "self_healing.verify", command: verification.command, status: verification.status }
    ]
  };
}

export function createSelfHealingProof(options = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-self-healing-"));
  const plan = createRepairPlan({ failedGate: "test -f SELF_HEALING_PROOF.txt", signal: "proof file missing", retryBudget: 1 });
  const blocked = applyApprovedRepair(plan, { root: fixtureRoot, approved: false });
  const repaired = applyApprovedRepair(plan, {
    root: fixtureRoot,
    approved: true,
    relativePath: "SELF_HEALING_PROOF.txt",
    verifyCommand: "test -f SELF_HEALING_PROOF.txt"
  });
  const audit = runSelfAudit({ root: options.root || process.cwd() });
  return {
    status: blocked.status === "blocked" && repaired.status === "passed" ? "passed" : "failed",
    fixtureRoot,
    blocked,
    repaired,
    selfAudit: { status: audit.status, checks: audit.checks?.length || 0 },
    nextActions: ["Use approval-gated repairs only for controlled fixture failures until project-specific policies are configured."]
  };
}

export function formatSelfHealingOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.blocked && value.repaired) return `Self-healing proof ${value.status}: approval=${value.blocked.status}, repair=${value.repaired.status}\n`;
  if (value.steps) return `Repair plan ${value.status}: ${value.steps.length} step(s), approval required=${value.approvalRequired}\n`;
  return `${JSON.stringify(value, null, 2)}\n`;
}

function runCommand(command, root) {
  const result = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", timeout: 30000 });
  return {
    command,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}
