import { loadPolicy, validatePolicy } from "../packages/policy/engine.mjs";

// Validate the active capability policy (default + any overrides).
const policy = loadPolicy(process.cwd());
const result = validatePolicy(policy);

console.log(JSON.stringify({ status: result.valid ? "passed" : "failed", errors: result.errors, policy }, null, 2));

if (!result.valid) {
  console.error(`Policy validation failed: ${result.errors.join("; ")}`);
  process.exit(1);
}
console.log("Policy validation passed.");
