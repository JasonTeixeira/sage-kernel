import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashContent, incrementalMap } from "../packages/perf/cache.mjs";
import { scanSastIncremental } from "../packages/perf/incremental-sast.mjs";
import { scanSast } from "../packages/security/sast.mjs";
import { checkLatencyBudgets, checkIncrementalGain } from "../packages/perf/budget.mjs";

test("hashContent is deterministic and content-sensitive", () => {
  assert.equal(hashContent("a"), hashContent("a"));
  assert.notEqual(hashContent("a"), hashContent("b"));
});

test("incrementalMap reuses cached values only when the hash matches", () => {
  let analyzed = 0;
  const analyze = (item) => { analyzed += 1; return item.content.length; };
  const items = [{ key: "x", content: "abc" }, { key: "y", content: "de" }];
  const cold = incrementalMap(items, { cache: {}, analyze });
  assert.equal(cold.misses, 2);
  assert.equal(cold.hitRate, 0);
  assert.equal(analyzed, 2);

  const warm = incrementalMap(items, { cache: cold.cache, analyze });
  assert.equal(warm.hits, 2);
  assert.equal(warm.missRate, 0);
  assert.equal(analyzed, 2); // nothing re-analyzed

  const changed = incrementalMap([{ key: "x", content: "abcd" }, { key: "y", content: "de" }], { cache: warm.cache, analyze });
  assert.equal(changed.hits, 1); // only y unchanged
  assert.equal(changed.misses, 1);
  assert.equal(analyzed, 3);
});

test("incremental SAST gives identical findings to a full scan, with a warm cache hit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-perf-"));
  fs.writeFileSync(path.join(root, "safe.mjs"), "export const x = path.join(base, name);\n");
  fs.writeFileSync(path.join(root, "vuln.mjs"), "export function h(req){ execSync(req.body.cmd); }\n");

  const full = scanSast({ root });
  const cold = scanSastIncremental({ root, cache: {} });
  // Same set of findings (count) as the canonical full scan.
  assert.equal(cold.findings.length, full.findings.length);
  assert.equal(cold.perf.missRate, 1);

  const warm = scanSastIncremental({ root, cache: cold.cache });
  assert.equal(warm.perf.missRate, 0);
  assert.ok(warm.perf.hits > 0);
  assert.equal(warm.findings.length, cold.findings.length);

  const gain = checkIncrementalGain(cold, warm);
  assert.equal(gain.status, "passed", JSON.stringify(gain.reasons));

  // Changing one file invalidates only that file's cache entry.
  fs.writeFileSync(path.join(root, "safe.mjs"), "export const x = path.join(base, name); // touched\n");
  const partial = scanSastIncremental({ root, cache: warm.cache });
  assert.equal(partial.perf.misses, 1);
  assert.equal(partial.perf.hits, partial.perf.total - 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test("default cache path persists to disk and is reloaded on the next run", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-perf-persist-"));
  fs.writeFileSync(path.join(root, "vuln.mjs"), "export function h(req){ execSync(req.body.cmd); }\n");
  // No cache option -> loadCache (empty) + saveCache to .sage-kernel/cache/sast.json
  const cold = scanSastIncremental({ root });
  assert.equal(cold.perf.missRate, 1);
  assert.ok(fs.existsSync(path.join(root, ".sage-kernel/cache/sast.json")));
  // Next default run reloads the persisted cache -> warm hits, 0 misses.
  const warm = scanSastIncremental({ root });
  assert.equal(warm.perf.missRate, 0);
  assert.ok(warm.perf.hits > 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("latency budget gate fails when a stage exceeds its budget", () => {
  assert.equal(checkLatencyBudgets([{ name: "scan", ms: 10 }], { scan: 100 }).status, "passed");
  assert.equal(checkLatencyBudgets([{ name: "scan", ms: 500 }], { scan: 100 }).status, "failed");
  // Unbudgeted stage is reported but never fails the gate.
  const unb = checkLatencyBudgets([{ name: "scan", ms: 10 }], {});
  assert.equal(unb.status, "passed");
  assert.equal(unb.checks[0].status, "unbudgeted");
});

test("incremental gain gate flags a broken cache (each failure reason)", () => {
  const mk = (missRate, hits, findings) => ({ perf: { missRate, hits }, findings: new Array(findings) });
  // cold didn't miss ~all -> reason
  assert.equal(checkIncrementalGain(mk(0.5, 0, 1), mk(0, 1, 1)).status, "failed");
  // warm produced no hits -> reason
  assert.equal(checkIncrementalGain(mk(1, 1, 1), mk(0, 0, 1)).status, "failed");
  // warm still missing on unchanged tree -> reason
  assert.equal(checkIncrementalGain(mk(1, 1, 1), mk(0.5, 1, 1)).status, "failed");
  // finding count diverged -> reason
  assert.equal(checkIncrementalGain(mk(1, 1, 2), mk(0, 1, 3)).status, "failed");
});

test("explicit files list is filtered through the canonical scan-file collector", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-perf-files-"));
  fs.writeFileSync(path.join(root, "vuln.mjs"), "export function h(req){ execSync(req.body.cmd); }\n");
  fs.writeFileSync(path.join(root, "notes.txt"), "not code\n");
  // Pass an explicit list including a non-code file; collector drops notes.txt.
  const res = scanSastIncremental({ root, cache: {}, files: ["vuln.mjs", "notes.txt"] });
  assert.equal(res.perf.total, 1);
  fs.rmSync(root, { recursive: true, force: true });
});
