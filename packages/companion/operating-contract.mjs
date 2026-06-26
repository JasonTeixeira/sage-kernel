// The single canonical, model-AGNOSTIC operating contract (P12). This is the
// "global MD" that tells ANY reasoning model (Claude Code, Cursor, etc.) how the
// owner works, the quality bar, and the exact tools + order of operations. It is
// rendered into each client's convention file (CLAUDE.md / .cursorrules /
// AGENTS.md) from ONE source, between managed markers so it never clobbers
// hand-authored content and re-running is idempotent.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const CONTRACT_START = "<!-- SAGE:CONTRACT:START — generated, do not edit between markers -->";
export const CONTRACT_END = "<!-- SAGE:CONTRACT:END -->";

export const OPERATING_CONTRACT = `# Sage Operating Contract

You are working in tandem with the sage-kernel MCP. Follow this contract on EVERY task.

## Doctrine (non-negotiable)
Nothing stated, everything proven. No fake-green, no scaffolding, no debt, no
abandoned tasks. A success claim is only valid if backed by a real, resolvable
proof in the ledger; otherwise say blocked_* honestly with a next step.

## Order of operations (every task)
1. ORIENT  — call kernel.profile.gaps; its missing checks are the definition of done.
2. CONTRACT — for non-trivial work, kernel.intake.contract { idea } to get acceptance criteria.
3. LOOP    — kernel.operate.run { goal, acceptanceCriteria, files } (or kernel.loops.run).
            It runs gates concurrently, diagnoses failures, repairs, re-verifies,
            and records a proof per gate. Re-run after edits.
4. PROVE   — before declaring done, kernel.enforce.proof_gate MUST return allowed
            (a fresh, diff-matched, passing operate:run proof exists). If it
            blocks, you are NOT done — fix and re-run the loop.
5. SCORE   — kernel.loop.score for the honest 0-100 backed by the proof ledger.

## Quality bar
- Tested means EXECUTED, not import-reachable (execution-grounded coverage).
- Security is measured (SAST/taint/polyglot/cross-file), not assumed.
- The whole product must be green, not just the diff.
- Every claim of "done/verified/passing" must cite a resolvable proofId.

## What NOT to do
- Do not claim done without a passing proof for the CURRENT diff.
- Do not weaken or delete tests to make them pass.
- Do not mark unverified work as warning — mark it blocked_*.
`;

export function renderContract() {
  return `${CONTRACT_START}\n${OPERATING_CONTRACT}\n${CONTRACT_END}\n`;
}

export function contractHash() {
  return crypto.createHash("sha256").update(OPERATING_CONTRACT).digest("hex");
}

// Insert/replace the managed contract block in a file, preserving everything else.
function upsertManagedBlock(filePath, block) {
  let existing = "";
  try { existing = fs.readFileSync(filePath, "utf8"); } catch { existing = ""; }
  const startIdx = existing.indexOf(CONTRACT_START);
  const endIdx = existing.indexOf(CONTRACT_END);
  let next;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    next = existing.slice(0, startIdx) + block.trimEnd() + existing.slice(endIdx + CONTRACT_END.length);
  } else {
    next = existing ? `${existing.trimEnd()}\n\n${block}` : block;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next.endsWith("\n") ? next : `${next}\n`);
}

// Render the ONE contract into every client's convention file.
export function generateClientContracts(options = {}) {
  const root = options.root || process.cwd();
  const clients = options.clients || ["CLAUDE.md", ".cursorrules", "AGENTS.md"];
  const block = renderContract();
  const written = [];
  for (const file of clients) {
    upsertManagedBlock(path.join(root, file), block);
    written.push(file);
  }
  return { written, contractHash: contractHash() };
}
