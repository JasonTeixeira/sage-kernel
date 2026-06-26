import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBenchmarks, detectRegressions } from "../packages/testing/benchmark-harness.mjs";
import { safeParse } from "../packages/ast/parse.mjs";
import { scanSastFile } from "../packages/security/sast.mjs";
import { buildModuleGraph } from "../packages/testing/module-graph.mjs";
import { recordProof } from "../packages/proof/ledger.mjs";

// Advisory performance benchmarks for hot kernel operations. Budgets are
// order-of-magnitude generous (catch catastrophic regressions, tolerate machine
// jitter). Baseline at .sage-kernel/evidence/bench-baseline.json; --save updates it.
const SAMPLE = "import x from './a.mjs';\nexport function f(a, b){ if (a === b) return a && b; return [1,2,3].map((n) => n + 1); }\n";

export function benchmarkCases(root) {
  const benchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sage-bench-"));
  return [
    { name: "ast.safeParse", fn: () => safeParse(SAMPLE), iterations: 500, budgetMsPerOp: 5 },
    { name: "sast.scanFile", fn: () => scanSastFile("b.mjs", SAMPLE), iterations: 300, budgetMsPerOp: 10 },
    { name: "graph.buildModuleGraph", fn: () => buildModuleGraph(root), iterations: 5, budgetMsPerOp: 5000 },
    { name: "proof.recordProof", fn: () => recordProof({ tool: "bench", status: "passed" }, { root: benchRoot }), iterations: 50, budgetMsPerOp: 200 }
  ];
}

/* node:coverage ignore next 18 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const baselinePath = path.join(root, ".sage-kernel/evidence/bench-baseline.json");
  const report = await runBenchmarks(benchmarkCases(root));
  let regression = { status: "passed", regressions: [] };
  if (fs.existsSync(baselinePath)) {
    regression = detectRegressions(report.results, JSON.parse(fs.readFileSync(baselinePath, "utf8")).results || []);
  }
  console.log(JSON.stringify({ ...report, regression }, null, 2));
  if (process.argv.includes("--save")) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Baseline saved to ${path.relative(root, baselinePath)}`);
  }
  process.exit(report.status === "passed" && regression.status === "passed" ? 0 : 1);
}
