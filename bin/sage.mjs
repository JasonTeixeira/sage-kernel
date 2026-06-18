#!/usr/bin/env node
/* node:coverage disable */
import { handleAgentCommand } from "./sage-agent-commands.mjs";
import { handleCoreCommand } from "./sage-core-commands.mjs";
import { handleOpsCommand } from "./sage-ops-commands.mjs";
import { help } from "./sage-runtime.mjs";

const [command, ...args] = process.argv.slice(2);

const handlers = [handleCoreCommand, handleAgentCommand, handleOpsCommand];
let handled = false;

for (const handler of handlers) {
  handled = await handler(command, args);
  if (handled) break;
}

if (!handled) {
  console.error(`Unknown command: ${command}`);
  help();
  process.exit(1);
}
