#!/usr/bin/env node
// Deterministic stand-in for `claude` in the model-gen unit test: ignores the
// prompt args, writes a correct implementation into cwd/src/sum.mjs. Exercises
// model-gen's command runner + buildPrompt path without a live model.
import fs from "node:fs";
import path from "node:path";
fs.mkdirSync(path.join(process.cwd(), "src"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "src/sum.mjs"), "export function sum(items){ return items.reduce((a,b)=>a+b,0); }\n");
process.stdout.write("generated src/sum.mjs");
