#!/usr/bin/env node
import { formatClosedLoopOutput, validateClosedLoopWorkflows } from "../closed-loop.mjs";

const result = validateClosedLoopWorkflows({ root: process.cwd() });
console.log(formatClosedLoopOutput(result, { json: process.argv.includes("--json") }));
process.exit(result.status === "passed" ? 0 : 1);
