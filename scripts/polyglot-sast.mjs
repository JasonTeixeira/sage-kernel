// Polyglot SAST gate (cat 12 + 13). Two-part proof:
//  1) self-check: the detector finds known Python/Swift vulnerabilities in an
//     in-memory fixture (proves the capability is real, not vacuous);
//  2) repo scan: the target repo has no high-severity polyglot findings.
import fs from "node:fs";
import path from "node:path";
import { scanPolyglotFile, scanPolyglot } from "../packages/security/polyglot-sast.mjs";

const root = process.cwd();

const selfChecks = [
  { file: "f.py", src: "os.system(cmd)\n", expect: "py-command-injection" },
  { file: "f.py", src: "pickle.loads(d)\n", expect: "py-insecure-deserialization" },
  { file: "f.swift", src: "let w = UIWebView()\n", expect: "swift-insecure-webview" }
];
const selfFailures = selfChecks.filter((c) => !scanPolyglotFile(c.file, c.src).some((f) => f.rule === c.expect));

const repo = scanPolyglot({ root });
const status = selfFailures.length === 0 && repo.status === "passed" ? "passed" : "failed";

const report = {
  type: "polyglot-sast",
  status,
  selfCheck: { total: selfChecks.length, failed: selfFailures.map((c) => c.expect) },
  repo: { languages: repo.languages, filesScanned: repo.filesScanned, high: repo.high, summary: repo.summary }
};
const target = path.join(root, ".sage-kernel/evidence/polyglot-sast-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(status === "passed" ? 0 : 1);
