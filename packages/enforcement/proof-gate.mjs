// Enforcement gate (P10). Turns the proof-first loop from "the model MAY call it"
// into "the model CANNOT declare done without it." It answers one question: is the
// CURRENT working state backed by a fresh, untampered, PASSING operate:run proof?
//
// Match is by git diff hash: operate records each proof with git.diffHash (the
// hash of `git diff HEAD` at run time). If the model edits more after operate, the
// current diff hash no longer matches any passing proof -> blocked -> must re-run
// operate. This is mechanical enforcement, not a doctrine string a model can ignore.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { listProofs, verifyLedger } from "../proof/ledger.mjs";
import { verifyReport } from "../proof/claim-firewall.mjs";

function currentDiffHash(root) {
  const r = spawnSync("git", ["diff", "HEAD"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) return null; // not a git repo / no commits
  // Must match the ledger's captureGitState exactly, which hashes the TRIMMED diff.
  return crypto.createHash("sha256").update(String(r.stdout || "").trim()).digest("hex");
}

// allowed=true only when a passing operate:run proof exists for the EXACT current
// diff and the ledger verifies clean. Otherwise blocked, with the reason.
export function checkProofGate(options = {}) {
  const root = options.root || process.cwd();
  const diffHash = options.diffHash ?? currentDiffHash(root);
  if (diffHash === null) {
    return { allowed: false, reason: "not a git repo (or no commits) — enforcement needs git to bind a proof to the working state", git: false };
  }
  const ledger = verifyLedger({ root });
  if (ledger.status === "tampered") {
    return { allowed: false, reason: "proof ledger is tampered — refusing to honor any proof", ledger: ledger.status };
  }
  const matches = listProofs({ root }).filter(
    (p) => p.tool === "operate:run" && p.status === "passed" && p.git && p.git.diffHash === diffHash
  );
  if (!matches.length) {
    return {
      allowed: false,
      reason: "no passing operate:run proof for the current working state — run kernel.operate.run (and pass its gates) before declaring done",
      diffHash
    };
  }
  // If a deliverable (the model's "done" message) is supplied, every success
  // claim in it must be backed by a RESOLVABLE proofId (strict firewall) — a URL
  // or backtick path does not count. A lying/unproven claim blocks "done".
  if (options.deliverable) {
    const report = verifyReport(options.deliverable, { root, strict: true, source: "deliverable" });
    if (report.status !== "passed") {
      return { allowed: false, reason: `deliverable makes unproven success claims (${report.violations.length})`, violations: report.violations, diffHash };
    }
  }
  return { allowed: true, reason: "a passing operate:run proof matches the current diff", proofId: matches[matches.length - 1].proofId, diffHash };
}

// Install the enforcement hook into a TARGET project: a Claude Code Stop hook that
// runs this gate and blocks turn completion when there is no fresh passing proof.
// (Cursor/other clients: same script, wired via their hook/rules mechanism.)
export function installEnforcementHooks(options = {}) {
  const root = options.root || process.cwd();
  const kernelRoot = options.kernelRoot || path.resolve(import.meta.dirname, "../..");
  const gateScript = path.join(kernelRoot, "scripts/proof-gate.mjs");
  const settingsPath = path.join(root, ".claude/settings.json");
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch { settings = {}; }
  settings.hooks = settings.hooks || {};
  const command = `node ${gateScript}`;
  const stopHook = { matcher: "", hooks: [{ type: "command", command, description: "Block 'done' without a fresh passing operate:run proof for the current diff." }] };
  settings.hooks.Stop = [stopHook];
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { settingsPath, command, hook: "Stop" };
}
