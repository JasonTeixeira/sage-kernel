#!/usr/bin/env node
import { validateReviewSystem } from "../review-report.mjs";

const result = validateReviewSystem({ root: process.cwd() });
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" ? 0 : 1);
