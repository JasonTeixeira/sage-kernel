import { fileURLToPath } from "node:url";
import { runExecutableRedteam } from "../packages/security/test-fixtures/redteam.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runExecutableRedteam({ root: process.cwd() });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
