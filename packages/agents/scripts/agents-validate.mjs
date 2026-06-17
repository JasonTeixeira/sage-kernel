#!/usr/bin/env node
import { validateAgentPack } from "../agent-pack.mjs";

const result = validateAgentPack({ root: process.cwd() });
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" ? 0 : 1);
