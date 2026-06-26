// Chaos / fault-injection harness (cat 19: resilience). Proves the kernel's own
// IO primitives recover correctly under adverse conditions instead of corrupting
// state or silently accepting bad data. Every scenario is deterministic (temp
// dirs + injectable clock) so it runs as a real release gate, not a flaky probe.
//
// Each scenario returns { scenario, status: "passed"|"failed", evidence } and is
// pure with respect to the real repo (all writes go to an isolated temp dir).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { acquireLease, releaseLease, isLeaseHeld } from "./lease.mjs";

const LEASE_MODULE = new URL("./lease.mjs", import.meta.url).href;
import { runDag } from "./dag.mjs";
import { verifyLedger, recordProof } from "../proof/ledger.mjs";

function tmpRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `sage-chaos-${label}-`));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function verdict(scenario, ok, evidence) {
  return { scenario, status: ok ? "passed" : "failed", evidence };
}

// 1. Two holders contend for the same lease; the second must be refused while the
//    first holds it (real mutual exclusion, not a post-hoc annotation).
export function chaosLeaseContention() {
  const root = tmpRoot("contend");
  try {
    const now = 1000;
    const first = acquireLease(root, "resource", { ttlMs: 60000, now });
    const second = acquireLease(root, "resource", { ttlMs: 60000, now });
    const ok = first.acquired === true && second.acquired === false && Boolean(second.heldBy);
    releaseLease(root, "resource", first.leaseId);
    const afterRelease = acquireLease(root, "resource", { ttlMs: 60000, now });
    return verdict("lease-contention", ok && afterRelease.acquired === true, {
      first: first.acquired, second: second.acquired, reacquiredAfterRelease: afterRelease.acquired
    });
  } finally {
    cleanup(root);
  }
}

// 2. An expired lease (TTL elapsed) is taken over by a new holder.
export function chaosStaleLeaseTakeover() {
  const root = tmpRoot("stale");
  try {
    const first = acquireLease(root, "resource", { ttlMs: 100, now: 1000 });
    const heldDuring = isLeaseHeld(root, "resource", { now: 1050 });
    const takeover = acquireLease(root, "resource", { ttlMs: 100, now: 5000 });
    const ok = first.acquired === true && heldDuring === true && takeover.acquired === true && takeover.tookOverStale === true;
    return verdict("stale-lease-takeover", ok, { heldDuring, tookOverStale: Boolean(takeover.tookOverStale) });
  } finally {
    cleanup(root);
  }
}

// 3. A lock owned by a dead process (unsignalable pid) is taken over.
export function chaosDeadHolderTakeover() {
  const root = tmpRoot("dead");
  try {
    const file = path.join(root, ".sage-kernel/locks", "resource.lock");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // pid 1 is alive; use an implausibly-high pid that cannot exist to simulate a
    // dead holder. process.kill(pid,0) throws ESRCH -> treated as dead.
    const deadPid = 2 ** 22;
    fs.writeFileSync(file, JSON.stringify({ leaseId: "ghost", name: "resource", pid: deadPid, acquiredAt: 0, expiresAt: 10 ** 15 }));
    const takeover = acquireLease(root, "resource", { ttlMs: 1000, now: 2000 });
    return verdict("dead-holder-takeover", takeover.acquired === true, { tookOverStale: Boolean(takeover.tookOverStale) });
  } finally {
    cleanup(root);
  }
}

// 4. A lock file corrupted by a partial write (garbage / truncated JSON) does not
//    wedge the system: it is treated as absent and a fresh lease is acquired.
export function chaosCorruptLockRecovery() {
  const root = tmpRoot("corrupt");
  try {
    const file = path.join(root, ".sage-kernel/locks", "resource.lock");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"leaseId":"trunc'); // truncated mid-write
    const recovered = acquireLease(root, "resource", { ttlMs: 1000, now: 1000 });
    return verdict("corrupt-lock-recovery", recovered.acquired === true, { recovered: recovered.acquired });
  } finally {
    cleanup(root);
  }
}

// 5. A proof ledger with a partial/truncated trailing write is DETECTED as
//    tampered (never silently accepted) — integrity is fail-closed.
export function chaosLedgerPartialWriteDetected() {
  const root = tmpRoot("ledger");
  try {
    recordProof({ tool: "chaos", command: "chaos", status: "passed", exitCode: 0, verifier: "chaos" }, { root });
    recordProof({ tool: "chaos", command: "chaos", status: "passed", exitCode: 0, verifier: "chaos" }, { root });
    const clean = verifyLedger({ root });
    const ledgerPath = path.join(root, ".sage-kernel/proof/ledger.jsonl");
    fs.appendFileSync(ledgerPath, '{"proofId":"proof_trunc","record'); // partial write
    const corrupted = verifyLedger({ root });
    const ok = clean.status === "verified" && corrupted.status === "tampered" && corrupted.tampered >= 1;
    return verdict("ledger-partial-write-detected", ok, { cleanStatus: clean.status, corruptedStatus: corrupted.status });
  } finally {
    cleanup(root);
  }
}

// 6. A DAG node that throws fails closed: its dependents are skipped (never run on
//    an unproven precondition), and the overall run is reported failed.
export async function chaosDagFailClosed() {
  const ran = new Set();
  const nodes = [
    { id: "a", task: () => { ran.add("a"); return { ok: true }; } },
    { id: "b", deps: ["a"], task: () => { ran.add("b"); throw new Error("boom"); } },
    { id: "c", deps: ["b"], task: () => { ran.add("c"); return { ok: true }; } }
  ];
  const report = await runDag(nodes, { limit: 2 });
  const byId = Object.fromEntries(report.nodes.map((n) => [n.id, n.status]));
  const ok = byId.a === "passed" && byId.b === "failed" && byId.c === "skipped" && !ran.has("c") && report.status === "failed";
  return verdict("dag-fail-closed", ok, { statuses: byId, ranC: ran.has("c") });
}

// 7. Durable resume: a run that crashed after N steps resumes by SKIPPING already
//    -passed steps (real skip, proven by an execution counter), not re-running.
export function resumableRun(steps, statePath, options = {}) {
  const done = readState(statePath);
  const executed = [];
  for (const step of steps) {
    if (done[step.id] === "passed") continue; // skip durable-completed work
    const status = step.run();
    executed.push(step.id);
    done[step.id] = status;
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.appendFileSync(statePath, `${JSON.stringify({ id: step.id, status })}\n`);
    if (status !== "passed" && !options.continueOnFail) break; // fail-closed stop
  }
  return { executed, state: done };
}

function readState(statePath) {
  const state = {};
  try {
    for (const line of fs.readFileSync(statePath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line);
      state[entry.id] = entry.status;
    }
  } catch { /* no prior state */ }
  return state;
}

export function chaosDurableResume() {
  const root = tmpRoot("resume");
  try {
    const statePath = path.join(root, ".sage-kernel/runs", "run.ndjson");
    const counter = { a: 0, b: 0, c: 0 };
    const makeSteps = (crashAtB) => [
      { id: "a", run: () => { counter.a += 1; return "passed"; } },
      { id: "b", run: () => { counter.b += 1; return crashAtB ? "failed" : "passed"; } },
      { id: "c", run: () => { counter.c += 1; return "passed"; } }
    ];
    // First run: step b "crashes" (fails) -> fail-closed stop before c.
    const firstPass = resumableRun(makeSteps(true), statePath);
    // Recover and resume: a is skipped (already passed), b retried, c runs.
    const secondPass = resumableRun(makeSteps(false), statePath);
    const ok =
      firstPass.executed.join(",") === "a,b" &&
      counter.a === 1 && // a never re-ran on resume
      secondPass.executed.join(",") === "b,c" &&
      counter.c === 1;
    return verdict("durable-resume-skips-passed", ok, { firstPass: firstPass.executed, secondPass: secondPass.executed, counter });
  } finally {
    cleanup(root);
  }
}

// 8. Concurrent run isolation: a second orchestration run cannot start while the
//    first holds the run-level lease (no interleaved mutation of shared state).
export function chaosConcurrentRunIsolation() {
  const root = tmpRoot("isolation");
  try {
    const now = 1000;
    const runA = acquireLease(root, "orchestration", { ttlMs: 120000, now });
    const runB = acquireLease(root, "orchestration", { ttlMs: 120000, now });
    const ok = runA.acquired === true && runB.acquired === false;
    releaseLease(root, "orchestration", runA.leaseId);
    return verdict("concurrent-run-isolation", ok, { runA: runA.acquired, runB: runB.acquired });
  } finally {
    cleanup(root);
  }
}

// 9. REAL multi-process contention: fork N OS processes that all race to take
//    over the same stale lock simultaneously. Exactly one must win — proving the
//    atomic-takeover fix under genuine concurrency (not a simulated one).
export async function chaosForkedLeaseContention(options = {}) {
  const root = tmpRoot("forklease");
  try {
    // Seed a STALE lock (expired + dead pid) so every contender hits takeover.
    const file = path.join(root, ".sage-kernel/locks", "shared.lock");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ leaseId: "stale", name: "shared", pid: 2 ** 22, acquiredAt: 0, expiresAt: 1 }));
    const workers = options.workers || 12;
    // A winner HOLDS the lease briefly (stays alive) before exiting — a real
    // holder does not vanish the instant it acquires. Losers exit immediately.
    // (Without the hold, the winner's pid looks dead and others falsely take over.)
    const code = `import(${JSON.stringify(LEASE_MODULE)}).then((m) => { const r = m.acquireLease(${JSON.stringify(root)}, "shared", { ttlMs: 60000, now: 1000 }); if (r.acquired) { process.stdout.write("WIN"); setTimeout(() => process.exit(0), 700); } else { process.stdout.write("LOSE"); process.exit(0); } });`;
    const outs = await Promise.all(
      Array.from({ length: workers }, () => new Promise((resolve) => {
        const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "ignore"] });
        let out = "";
        child.stdout.on("data", (d) => { out += d; });
        child.on("close", () => resolve(out.trim()));
        child.on("error", () => resolve("ERR"));
      }))
    );
    const wins = outs.filter((o) => o === "WIN").length;
    return verdict("forked-lease-contention", wins === 1, { workers, wins, losses: outs.filter((o) => o === "LOSE").length });
  } finally {
    cleanup(root);
  }
}

export async function runChaosMatrix() {
  const scenarios = [
    chaosLeaseContention(),
    chaosStaleLeaseTakeover(),
    chaosDeadHolderTakeover(),
    chaosCorruptLockRecovery(),
    chaosLedgerPartialWriteDetected(),
    await chaosDagFailClosed(),
    chaosDurableResume(),
    chaosConcurrentRunIsolation(),
    await chaosForkedLeaseContention()
  ];
  const failed = scenarios.filter((s) => s.status !== "passed");
  return {
    type: "chaos-matrix",
    status: failed.length === 0 ? "passed" : "failed",
    total: scenarios.length,
    passed: scenarios.length - failed.length,
    generatedAt: new Date().toISOString(),
    scenarios
  };
}
