import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModuleGraph, parseExports } from "../packages/refactor/dead-code.mjs";
import { buildModuleGraph as buildGraph, dependentsOf } from "../packages/testing/module-graph.mjs";
import { computeFileComplexity, analyzeComplexity } from "../packages/refactor/complexity.mjs";
import { scanSastFile } from "../packages/security/sast.mjs";
import { acquireLease, releaseLease, renewLease, isLeaseHeld } from "../packages/orchestration/lease.mjs";
import { stressConfig, measureLatency, createFullStressMatrix } from "../packages/testing/stress-matrix.mjs";
import { astFindingsByCategory } from "../packages/review/ast-audit.mjs";
import { createDurableOrchestrationProof } from "../packages/orchestration/durable-proof.mjs";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-cov-"));
}

// --- dead-code regex fallback (only runs when acorn cannot parse a file) ---
test("dead-code falls back to regex extraction on unparseable files", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "packages"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages/a.mjs"), "export const a = 1;\nexport function helper() {}\n");
  // Unparseable (trailing syntax error) but with regex-detectable imports/exports + strings/comments.
  fs.writeFileSync(
    path.join(root, "packages/b.mjs"),
    [
      "import { a as aa } from './a.mjs';",
      "import def from './a.mjs';",
      "import * as ns from './a.mjs';",
      "export const b = 2;",
      "export { b as bb };",
      "export default 1;",
      'const s = "export const fake = 99";',
      "// import ghost from './ghost.mjs'",
      "const broken = ;;;("
    ].join("\n")
  );
  const graph = buildModuleGraph(root);
  assert.ok(graph.exportsByFile["packages/b.mjs"].includes("b"));
  assert.ok(graph.exportsByFile["packages/b.mjs"].includes("bb"));
  // The string/comment content must NOT leak as a real export.
  assert.equal(graph.exportsByFile["packages/b.mjs"].includes("fake"), false);
  // Regex fallback still resolves the relative import edge to a.mjs.
  assert.ok(graph.importsByFile["packages/b.mjs"].some((edge) => edge.target === "packages/a.mjs"));
});

test("parseExports handles braced aliases and default", () => {
  assert.deepEqual(parseExports("export { c, d as e };\nexport default 1;").sort(), ["c", "default", "e"].sort());
});

// --- module-graph extensionless/index resolution + regex fallback ---
test("module-graph resolves extensionless and index imports", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "pkg/sub"), { recursive: true });
  fs.writeFileSync(path.join(root, "pkg/leaf.mjs"), "export const leaf = 1;\n");
  fs.writeFileSync(path.join(root, "pkg/sub/index.mjs"), "export const idx = 1;\n");
  fs.writeFileSync(path.join(root, "pkg/main.mjs"), "import { leaf } from './leaf';\nimport { idx } from './sub';\nimport os from 'node:os';\nconsole.log(leaf, idx, os);\n");
  const graph = buildGraph(root);
  const targets = graph.importsByFile["pkg/main.mjs"];
  assert.ok(targets.includes("pkg/leaf.mjs"), "extensionless ./leaf -> leaf.mjs");
  assert.ok(targets.includes("pkg/sub/index.mjs"), "./sub -> sub/index.mjs");
  assert.equal(dependentsOf(graph, "pkg/leaf.mjs").has("pkg/main.mjs"), true);
});

test("module-graph falls back to regex on unparseable files", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "pkg"), { recursive: true });
  fs.writeFileSync(path.join(root, "pkg/leaf.mjs"), "export const leaf = 1;\n");
  fs.writeFileSync(path.join(root, "pkg/broken.mjs"), "import { leaf } from './leaf.mjs';\nconst x = ;;;(\n");
  const graph = buildGraph(root);
  assert.ok(graph.importsByFile["pkg/broken.mjs"].includes("pkg/leaf.mjs"));
});

test("module-graph tolerates missing files and unresolved relative imports", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "pkg"), { recursive: true });
  // Unresolved relative import -> resolveSpec returns null (no edge).
  fs.writeFileSync(path.join(root, "pkg/main.mjs"), "import x from './missing.mjs';\nconsole.log(x);\n");
  const graph = buildGraph(root);
  assert.deepEqual(graph.importsByFile["pkg/main.mjs"], []);
  // A file listed but absent on disk -> read() catch returns "" (no crash).
  const graph2 = buildGraph(root, { files: ["pkg/ghost.mjs"] });
  assert.deepEqual(graph2.importsByFile["pkg/ghost.mjs"], []);
});

// --- complexity edge branches ---
test("complexity handles anonymous functions and files with no functions", () => {
  const anon = computeFileComplexity("const f = (a) => a || 1; [1,2].map((x) => x + 1);");
  assert.ok(anon.every((fn) => fn.complexity >= 1));
  assert.ok(anon.some((fn) => /anonymous@/.test(fn.name)));
  assert.deepEqual(computeFileComplexity("const x = 1;"), []);
});

test("analyzeComplexity tolerates unreadable files in its list", () => {
  const root = tmp();
  const report = analyzeComplexity({ root, files: ["does/not/exist.mjs"], maxComplexity: 5 });
  assert.equal(report.status, "passed");
  assert.equal(report.functionsScanned, 0);
});

// --- sast non-flag branches ---
test("sast does not flag fs reads wrapped in path.join, and ignores non-cp exec", () => {
  const clean = scanSastFile("x.mjs", "import fs from 'node:fs'; import path from 'node:path'; fs.readFileSync(path.join(a, b));");
  assert.equal(clean.length, 0);
  const regexExec = scanSastFile("x.mjs", "const m = /re/.exec(line); use(m);");
  assert.equal(regexExec.some((f) => f.rule === "command-injection" || f.rule === "shell-dynamic-command"), false);
});

// --- lease edge branches ---
test("lease release/renew reject the wrong leaseId; isLeaseHeld false after release", () => {
  const root = tmp();
  const a = acquireLease(root, "j");
  assert.equal(releaseLease(root, "j", "wrong-id"), false);
  assert.equal(renewLease(root, "j", "wrong-id"), null);
  assert.equal(isLeaseHeld(root, "j"), true);
  assert.equal(releaseLease(root, "j", a.leaseId), true);
  assert.equal(isLeaseHeld(root, "j"), false);
  // releasing a non-existent lease returns false.
  assert.equal(releaseLease(root, "missing", "x"), false);
});

// --- stress config both branches + latency catch ---
test("stressConfig covers both local-proof and release-scale branches", () => {
  assert.equal(stressConfig(false).dashboardCount, 50);
  assert.equal(stressConfig(true).dashboardCount, 50000);
  assert.equal(stressConfig(true).latencyBudgetP99, 100);
});

test("measureLatency tolerates a throwing fetch and records durations", async () => {
  const ctx = { baseUrl: "http://127.0.0.1:1", fetchImpl: async () => { throw new Error("net down"); } };
  const latency = await measureLatency(ctx, { samples: 3 });
  assert.equal(latency.samples, 3);
  assert.equal(typeof latency.p99, "number");
});

test("stress matrix writes evidence when save is enabled", async () => {
  const matrix = await createFullStressMatrix({ root: process.cwd(), save: true });
  assert.ok(["passed", "needs_hardening", "failed"].includes(matrix.status));
  assert.ok(fs.existsSync(path.join(process.cwd(), ".sage-kernel/evidence/stress-matrix-latest.json")));
});

// --- durable orchestration with save:true (covers writeEvidence + lease release) ---
test("durable orchestration proof writes evidence when save is enabled", async () => {
  const trace = await createDurableOrchestrationProof({ root: process.cwd(), save: true });
  assert.equal(trace.type, "orchestration-trace");
  assert.equal(trace.leases.every((l) => l.acquired && l.released), true);
  assert.ok(fs.existsSync(path.join(process.cwd(), ".sage-kernel/evidence/orchestration-trace-latest.json")));
});

// --- ast-audit grouping helper ---
test("astFindingsByCategory splits clean_code and security", () => {
  const grouped = astFindingsByCategory([{ category: "clean_code" }, { category: "security" }, { category: "clean_code" }]);
  assert.equal(grouped.clean_code.length, 2);
  assert.equal(grouped.security.length, 1);
});
