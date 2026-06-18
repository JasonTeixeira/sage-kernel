#!/usr/bin/env node
import { evaluateAgentRuntime, formatAgentRuntimeOutput } from "../runtime.mjs";

const result = evaluateAgentRuntime({ root: process.cwd() });
console.log(formatAgentRuntimeOutput(result, { json: process.argv.includes("--json") }));
process.exit(result.status === "passed" ? 0 : 1);
