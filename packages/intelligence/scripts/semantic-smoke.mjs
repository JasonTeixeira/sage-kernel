import { semanticSmoke } from "../semantic-code.mjs";

const result = semanticSmoke({ root: process.cwd() });
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" ? 0 : 1);
