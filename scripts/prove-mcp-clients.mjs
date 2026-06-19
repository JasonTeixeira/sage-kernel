import { fileURLToPath } from "node:url";
import { createMcpClientProof } from "../packages/core/mcp-client-proof.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  return {
    clients: argv.filter((arg) => !arg.startsWith("--")),
    install: argv.includes("--install")
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await createMcpClientProof({ root: process.cwd(), ...parseArgs() });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "failed" ? 1 : 0);
}
