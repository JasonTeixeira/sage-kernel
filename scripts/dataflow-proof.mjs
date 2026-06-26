// Cross-file dataflow gate (P32). Self-check: the analyzer detects a known
// cross-file source->sink chain and does NOT flag a sanitized one (capability is
// real). Repo scan: the kernel has no interprocedural-taint findings.
import fs from "node:fs";
import path from "node:path";
import { analyzeInterprocedural, scanInterprocedural } from "../packages/security/dataflow.mjs";

const root = process.cwd();

const positive = analyzeInterprocedural([
  { path: "handler.mjs", content: "import { runCmd } from './exec.mjs';\nexport function handle(req){ runCmd(req.body.cmd); }\n" },
  { path: "exec.mjs", content: "export function runCmd(cmd){ execSync(cmd); }\n" }
]).findings.length === 1;

const negative = analyzeInterprocedural([
  { path: "handler.mjs", content: "import { runCmd } from './exec.mjs';\nexport function handle(req){ const safe = sanitize(req.body.cmd); runCmd(safe); }\n" },
  { path: "exec.mjs", content: "export function runCmd(cmd){ execSync(cmd); }\n" }
]).findings.length === 0;

const repo = scanInterprocedural({ root });
const status = positive && negative && repo.status === "passed" ? "passed" : "failed";

const report = {
  type: "dataflow-proof",
  status,
  selfCheck: { detectsCrossFileTaint: positive, ignoresSanitized: negative },
  repo: { filesScanned: repo.filesScanned, high: repo.high },
  depthLimit: repo.depthLimit,
  generatedAt: new Date().toISOString()
};
const target = path.join(root, ".sage-kernel/evidence/dataflow-proof-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(status === "passed" ? 0 : 1);
