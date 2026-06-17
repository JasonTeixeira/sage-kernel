import { validateRunbooks } from "../runbooks.mjs";

const result = validateRunbooks({ root: process.cwd() });
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" ? 0 : 1);
