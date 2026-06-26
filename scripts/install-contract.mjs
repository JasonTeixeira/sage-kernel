#!/usr/bin/env node
// Install the single canonical Operating Contract (P12) into a target project's
// client convention files (CLAUDE.md / .cursorrules / AGENTS.md). One source,
// rendered per client, idempotent, preserving any hand-authored content.
//
//   node scripts/install-contract.mjs [targetDir] [--clients CLAUDE.md,.cursorrules]
import { generateClientContracts, contractHash } from "../packages/companion/operating-contract.mjs";

const args = process.argv.slice(2);
const flagIdx = args.indexOf("--clients");
const clients = flagIdx >= 0 ? args[flagIdx + 1].split(",").map((s) => s.trim()).filter(Boolean) : undefined;
const root = args.find((a, i) => !a.startsWith("--") && i !== (flagIdx >= 0 ? flagIdx + 1 : -1)) || process.cwd();

const res = generateClientContracts({ root, clients });
console.log(`Operating Contract installed (sha256 ${contractHash().slice(0, 12)}) into ${root}:`);
for (const file of res.written) console.log(`  - ${file}`);
