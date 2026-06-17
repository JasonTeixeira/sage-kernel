import { validateAdapters } from "../adapters.mjs";

const result = validateAdapters({ root: process.cwd() });
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" ? 0 : 1);
