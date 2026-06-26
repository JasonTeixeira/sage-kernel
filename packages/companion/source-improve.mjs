// Autonomous source-improvement with PROVE-OR-DISCARD and SCOPED revert. A worker
// (a live model in real use, a stub in tests) edits the kernel's own source to
// raise a target capability. The change is KEPT only if it passes the full
// guardrail gauntlet; otherwise ONLY the files the worker touched are reverted —
// never a blanket reset, so unrelated in-flight work is never destroyed.
//
// Gauntlet (all required to keep):
//   1. the target category's score strictly IMPROVES,
//   2. NO other category regresses,
//   3. the full test suite stays green,
//   4. adversarial verification (if provided) does not refute the change.
//
// Everything external (worker, measurement, tests, git) is injected so the policy
// is unit-testable without a model or real mutations.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Default git operations over the real repo (overridable in tests).
export function defaultGitOps(root) {
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return {
    dirty() {
      const r = git(["status", "--porcelain"]);
      return new Set((r.stdout || "").split("\n").map((l) => l.slice(3).trim()).filter(Boolean));
    },
    isTracked(file) {
      return git(["ls-files", "--error-unmatch", file]).status === 0;
    },
    revert(file) { git(["checkout", "--", file]); },
    remove(file) { try { fs.rmSync(path.join(root, file), { force: true }); } catch { /* ignore */ } }
  };
}

// Revert ONLY the worker-touched files: tracked -> restore from HEAD, new -> delete.
function scopedRevert(gitOps, touched) {
  for (const file of touched) {
    if (gitOps.isTracked(file)) gitOps.revert(file);
    else gitOps.remove(file);
  }
}

export async function improveOnce(options = {}) {
  const { root = process.cwd(), targetId } = options;
  const applyChange = options.applyChange; // async ({root,targetId}) -> void (edits source)
  const measureAll = options.measureAll;   // async () -> [{id, score, proven}]
  const runTests = options.runTests;       // async () -> boolean (full suite green)
  const adversarialVerify = options.adversarialVerify; // async ({touched}) -> boolean (true=ok)
  const gitOps = options.gitOps || defaultGitOps(root);
  if (!applyChange || !measureAll || !runTests) throw new Error("improveOnce requires applyChange, measureAll, runTests");

  const before = await measureAll();
  const beforeById = Object.fromEntries(before.map((c) => [c.id, c.score]));
  const preDirty = gitOps.dirty();

  await applyChange({ root, targetId });

  const postDirty = gitOps.dirty();
  const touched = [...postDirty].filter((f) => !preDirty.has(f));
  if (touched.length === 0) {
    return { decision: "no_change", reason: "worker made no file changes", touched: [], targetBefore: beforeById[targetId] };
  }

  const testsGreen = await runTests();
  const after = await measureAll();
  const afterById = Object.fromEntries(after.map((c) => [c.id, c.score]));

  const targetBefore = beforeById[targetId] ?? 0;
  const targetAfter = afterById[targetId] ?? 0;
  const improved = targetAfter > targetBefore;
  const regressions = before
    .filter((c) => c.id !== targetId && (afterById[c.id] ?? 0) < (beforeById[c.id] ?? 0))
    .map((c) => ({ id: c.id, from: beforeById[c.id], to: afterById[c.id] }));
  const adv = adversarialVerify ? await adversarialVerify({ touched, targetId }) : true;

  const keep = testsGreen && improved && regressions.length === 0 && adv;
  if (keep) {
    return { decision: "kept", reason: "passed the full gauntlet", touched, targetBefore, targetAfter, regressions };
  }

  scopedRevert(gitOps, touched);
  const why = !testsGreen ? "tests_red" : !improved ? "no_improvement" : regressions.length ? "regression" : !adv ? "refuted" : "unknown";
  return { decision: "reverted", reason: why, touched, targetBefore, targetAfter, regressions };
}
