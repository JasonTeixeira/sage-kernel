import fs from "node:fs";
import path from "node:path";

import { createBenchmarkMatrixReport } from "./benchmark-matrix.mjs";
import { createBenchmarkFixtureCorpus } from "./test-fixtures/corpus.mjs";

export function createBenchmarkCorpusProof(options = {}) {
  const root = options.root || process.cwd();
  const corpusRoot = options.corpusRoot || createBenchmarkFixtureCorpus();
  const paths = fs.readdirSync(corpusRoot).sort().map((item) => path.relative(root, path.join(corpusRoot, item)));
  const previousAllowed = process.env.SAGE_PROFILE_ALLOWED_ROOTS;
  const previousSecurity = process.env.SAGE_SECURITY_ALLOWED_ROOTS;
  const previousReview = process.env.SAGE_REVIEW_ALLOWED_ROOTS;
  process.env.SAGE_PROFILE_ALLOWED_ROOTS = [previousAllowed, corpusRoot].filter(Boolean).join(path.delimiter);
  process.env.SAGE_SECURITY_ALLOWED_ROOTS = [previousSecurity, corpusRoot].filter(Boolean).join(path.delimiter);
  process.env.SAGE_REVIEW_ALLOWED_ROOTS = [previousReview, corpusRoot].filter(Boolean).join(path.delimiter);
  try {
    const matrix = createBenchmarkMatrixReport({
      root,
      paths,
      risk: "high",
      save: options.save !== false,
      compare: Boolean(options.compare),
      failOnRegression: Boolean(options.failOnRegression)
    });
    const profileCoverage = new Set(matrix.results.map((result) => result.profile));
    const report = {
      type: "benchmark-corpus-proof",
      status: matrix.status === "passed" && matrix.summary.count >= 20 && profileCoverage.size >= 12 ? "passed" : "failed",
      generatedAt: new Date().toISOString(),
      corpusRoot,
      minimumRepos: 20,
      profileCoverage: [...profileCoverage].sort(),
      matrix
    };
    if (options.save !== false) writeEvidence(root, "benchmark-corpus-latest.json", report);
    return report;
  } finally {
    if (previousAllowed === undefined) delete process.env.SAGE_PROFILE_ALLOWED_ROOTS;
    else process.env.SAGE_PROFILE_ALLOWED_ROOTS = previousAllowed;
    if (previousSecurity === undefined) delete process.env.SAGE_SECURITY_ALLOWED_ROOTS;
    else process.env.SAGE_SECURITY_ALLOWED_ROOTS = previousSecurity;
    if (previousReview === undefined) delete process.env.SAGE_REVIEW_ALLOWED_ROOTS;
    else process.env.SAGE_REVIEW_ALLOWED_ROOTS = previousReview;
  }
}

function writeEvidence(root, file, report) {
  const target = path.join(root, ".sage-kernel/evidence", file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
}
