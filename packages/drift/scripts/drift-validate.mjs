#!/usr/bin/env node
import { createDriftProof, formatDriftOutput } from "../drift-engine.mjs";

const proof = createDriftProof({ root: process.cwd() });
console.log(formatDriftOutput(proof, { json: process.argv.includes("--json") }));
process.exit(proof.status === "passed" ? 0 : 1);
