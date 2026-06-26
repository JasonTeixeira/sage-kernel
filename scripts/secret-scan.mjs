import { scanForSecrets } from "../packages/security/secret-scan.mjs";

// CLI wrapper around the shared secret scanner.
const result = scanForSecrets({ root: process.cwd() });

if (result.status === "failed") {
  console.error(JSON.stringify({ findings: result.findings }, null, 2));
  process.exit(1);
}

console.log("Secret scan passed.");
