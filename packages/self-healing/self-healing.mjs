import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

// GENUINE self-healing proof. Runs the foreign-repair harness, which seeds a
// REAL broken repo (off-by-one bug, a real failing test) and drives the
// PRODUCTION operate loop to fix it end-to-end. Replaces the former tautology
// (write a file, then test that the file exists) with a proof that actually
// exercises diagnose -> repair -> re-verify on a real failure. Fails honestly if
// the loop cannot fix the seeded bug.
export function createSelfHealingProof(options = {}) {
  const kernelRoot = options.kernelRoot || path.resolve(import.meta.dirname, "../..");
  const harness = path.join(kernelRoot, "tests/harness/foreign-repair.mjs");
  if (!fs.existsSync(harness)) {
    return { status: "blocked_not_available", reason: "foreign-repair harness not found", harness };
  }
  const result = spawnSync("node", [harness], { cwd: kernelRoot, encoding: "utf8", timeout: 120000 });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return {
    status: result.status === 0 ? "passed" : "failed",
    proof: "foreign-repair harness (real broken-repo end-to-end fix)",
    detail: output.slice(-500),
    nextActions: result.status === 0 ? [] : ["The production loop failed to fix the seeded bug; investigate operate/repair wiring."]
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
