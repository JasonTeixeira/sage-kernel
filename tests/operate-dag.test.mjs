import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOperate } from "../packages/operate/operate.mjs";

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-dag-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "d", type: "module" }));
  return dir;
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test("operate executes independent gates CONCURRENTLY (peakConcurrency > 1)", async () => {
  const dir = tmpRepo();
  try {
    const slow = async () => { await delay(80); return { status: "passed", detail: "ok" }; };
    const result = await runOperate({
      root: dir, goal: "x", acceptanceCriteria: ["x"], files: [],
      plan: ["g1", "g2", "g3", "g4"],
      gateRunners: { g1: slow, g2: slow, g3: slow, g4: slow },
      concurrency: 4
    });
    assert.ok(result.peakConcurrency >= 2, `expected concurrent execution, got peakConcurrency=${result.peakConcurrency}`);
    assert.equal(result.gates.length, 4);
    assert.ok(result.gates.every((g) => g.status === "passed"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("durable resume: a gate marked passed is REUSED, not re-executed", async () => {
  const dir = tmpRepo();
  try {
    let calls = 0;
    const counting = async () => { calls += 1; return { status: "passed" }; };
    const result = await runOperate({
      root: dir, goal: "x", acceptanceCriteria: ["x"], files: [],
      plan: ["g1", "g2"],
      gateRunners: { g1: counting, g2: counting },
      resume: { g1: "passed" }
    });
    assert.equal(calls, 1, "the resumed gate's runner must NOT run again");
    const g1 = result.gates.find((g) => g.category === "g1");
    assert.equal(g1.status, "passed");
    assert.equal(g1.resumed, true);
    assert.equal(result.gates.find((g) => g.category === "g2").resumed, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
