// Approval-gated autonomous improvement loop — SAFE for unattended runs. For each
// target it runs improveOnce (prove-or-discard). A change that passes the full
// gauntlet is NOT committed and NOT left dirty: it is snapshotted as a reviewable
// PATCH into an approval queue, and the working tree is restored to clean. A human
// reviews the queue and applies the patches they approve. Changes that fail the
// gauntlet are scoped-reverted as usual. The loop NEVER commits and NEVER leaves
// the tree mutated — the worst case is a queue of proposed patches.

import fs from "node:fs";
import path from "node:path";
import { improveOnce, defaultGitOps, scopedRevertFiles } from "./source-improve.mjs";

export async function runImproveLoop(options = {}) {
  const root = options.root || process.cwd();
  const targets = options.targets || [];
  const gitOps = options.gitOps || defaultGitOps(root);
  const queueDir = options.queueDir || path.join(root, ".sage-kernel/autonomy");
  const captureDiff = options.captureDiff || ((touched) => gitOps.diff(touched));
  const writeFile = options.writeFile || ((p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); });
  const appendLine = options.appendLine || ((p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.appendFileSync(p, c); });
  const stamp = options.stamp || "run"; // injected timestamp (no Date.now in some envs)

  const pending = []; const reverted = []; const noChange = [];
  let n = 0;
  for (const targetId of targets) {
    const res = await improveOnce({ ...options, root, targetId, gitOps });
    if (res.decision === "kept") {
      n += 1;
      const id = `${stamp}-${targetId}-${n}`;
      const patch = captureDiff(res.touched);
      const patchFile = path.join(queueDir, "approved-patches", `${id}.patch`);
      writeFile(patchFile, patch);
      const entry = { id, targetId, touched: res.touched, targetBefore: res.targetBefore, targetAfter: res.targetAfter, patchFile, status: "pending_approval" };
      appendLine(path.join(queueDir, "pending-approval.jsonl"), `${JSON.stringify(entry)}\n`);
      // Restore clean tree — the change lives ONLY as a reviewable patch now.
      scopedRevertFiles(gitOps, res.touched);
      pending.push(entry);
    } else if (res.decision === "reverted") {
      reverted.push({ targetId, reason: res.reason });
    } else {
      noChange.push({ targetId, reason: res.reason });
    }
  }
  return { pending, reverted, noChange, committed: false };
}
