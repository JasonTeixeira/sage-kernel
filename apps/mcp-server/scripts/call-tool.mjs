import { createKernelRuntime } from "../../../packages/core/runtime.mjs";

const [toolName, rawInput = "{}"] = process.argv.slice(2);

if (!toolName) {
  console.error("Usage: npm run mcp:call -- <tool-name> ['{\"key\":\"value\"}']");
  process.exit(1);
}

let input;
try {
  input = JSON.parse(rawInput);
} catch (error) {
  throw new Error(`Tool input must be JSON: ${error.message}`);
}

const runtime = createKernelRuntime({ root: process.cwd() });
await runtime.loadBuiltInTools();
const result = await runtime.call(toolName, input);
console.log(JSON.stringify(result, null, 2));
