import { fileURLToPath } from "node:url";
import { createKernelRuntime } from "../../../packages/core/runtime.mjs";

export async function callToolCli(args = process.argv.slice(2), options = {}) {
  const [toolName, rawInput = "{}"] = args;

  if (!toolName) {
    return { status: 1, stderr: "Usage: npm run mcp:call -- <tool-name> ['{\"key\":\"value\"}']" };
  }

  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (error) {
    return { status: 1, stderr: `Tool input must be JSON: ${error.message}` };
  }

  const runtime = options.runtime || createKernelRuntime({ root: options.root || process.cwd() });
  await runtime.loadBuiltInTools();
  const result = await runtime.call(toolName, input);
  return { status: 0, stdout: JSON.stringify(result, null, 2) };
}

/* node:coverage ignore next 6 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await callToolCli();
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.log(result.stdout);
  process.exit(result.status);
}
