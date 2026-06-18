#!/usr/bin/env node
import { proveProfilePaths } from "../project-detector.mjs";

const paths = process.argv.slice(2).filter(Boolean);
const result = proveProfilePaths({ paths }, { root: process.cwd() });
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" ? 0 : 1);
