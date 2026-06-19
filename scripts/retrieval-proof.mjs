import { fileURLToPath } from "node:url";
import { createRetrievalProof } from "../packages/intelligence/retrieval-proof.mjs";

function valueFor(argv, name) {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1] || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createRetrievalProof({
    root: process.cwd(),
    projectPath: valueFor(process.argv.slice(2), "--project") || ".",
    query: valueFor(process.argv.slice(2), "--query") || "release proof"
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
