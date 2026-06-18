import { fileURLToPath } from "node:url";

import { semanticSmoke } from "../semantic-code.mjs";

export function runSemanticSmokeCli(options = {}) {
  const root = options.root || process.cwd();
  const smoke = options.smoke || semanticSmoke;
  const stdout = options.stdout || console.log;
  const result = smoke({ root });
  stdout(JSON.stringify(result, null, 2));
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runSemanticSmokeCli());
}
