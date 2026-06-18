#!/usr/bin/env node
import { formatClosedLoopOutput, proveClosedLoopWorkflows } from "../closed-loop.mjs";

const result = proveClosedLoopWorkflows({ root: process.cwd() });
console.log(formatClosedLoopOutput(result, { json: process.argv.includes("--json") }));
process.exit(result.status === "passed" ? 0 : 1);
