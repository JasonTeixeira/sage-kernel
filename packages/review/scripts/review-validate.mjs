#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { validateReviewSystem } from "../review-report.mjs";

export function runReviewValidateCli(options = {}) {
  const root = options.root || process.cwd();
  const validate = options.validate || validateReviewSystem;
  const stdout = options.stdout || console.log;
  const result = validate({ root });
  stdout(JSON.stringify(result, null, 2));
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runReviewValidateCli());
}
