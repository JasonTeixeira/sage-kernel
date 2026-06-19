import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBenchmarkMatrixReport } from "../packages/benchmark/benchmark-matrix.mjs";

export function createRealRepoMatrixProof(options = {}) {
  const root = options.root || process.cwd();
  const paths = options.paths || [];
  if (paths.length < 20) {
    const report = {
      type: "real-repo-matrix",
      corpusKind: "real",
      status: "failed",
      requiredRepos: 20,
      providedRepos: paths.length,
      message: "Provide at least 20 real repository paths."
    };
    writeLatest(root, report);
    return report;
  }
  const allowed = paths.map((item) => path.resolve(root, item)).join(path.delimiter);
  const previousProfile = process.env.SAGE_PROFILE_ALLOWED_ROOTS;
  const previousSecurity = process.env.SAGE_SECURITY_ALLOWED_ROOTS;
  const previousReview = process.env.SAGE_REVIEW_ALLOWED_ROOTS;
  process.env.SAGE_PROFILE_ALLOWED_ROOTS = [previousProfile, allowed].filter(Boolean).join(path.delimiter);
  process.env.SAGE_SECURITY_ALLOWED_ROOTS = [previousSecurity, allowed].filter(Boolean).join(path.delimiter);
  process.env.SAGE_REVIEW_ALLOWED_ROOTS = [previousReview, allowed].filter(Boolean).join(path.delimiter);
  try {
    const matrix = createBenchmarkMatrixReport({
      root,
      paths,
      risk: options.risk || "high",
      compare: Boolean(options.compare),
      failOnRegression: Boolean(options.failOnRegression)
    });
    const report = {
      ...matrix,
      type: "real-repo-matrix",
      corpusKind: "real",
      status: matrix.status === "passed" && matrix.summary.count >= 20 ? "passed" : "failed"
    };
    writeLatest(root, report);
    return report;
  } finally {
    restore("SAGE_PROFILE_ALLOWED_ROOTS", previousProfile);
    restore("SAGE_SECURITY_ALLOWED_ROOTS", previousSecurity);
    restore("SAGE_REVIEW_ALLOWED_ROOTS", previousReview);
  }
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function writeLatest(root, report) {
  const file = path.join(root, ".sage-kernel/evidence/real-repo-matrix-latest.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const report = createRealRepoMatrixProof({
    root: process.cwd(),
    paths,
    compare: process.argv.includes("--compare"),
    failOnRegression: process.argv.includes("--fail-on-regression")
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
