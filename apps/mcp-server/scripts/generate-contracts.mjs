import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { kernelPrompts } from "../src/kernel-prompts.mjs";
import { kernelResources } from "../src/kernel-resources.mjs";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));
const contractsDir = path.join(root, "apps/mcp-server/contracts");
const docsPath = path.join(root, "docs/mcp-tools.md");
const promptsDocsPath = path.join(root, "docs/mcp-prompts.md");
const resourcesDocsPath = path.join(root, "docs/mcp-resources.md");

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const snapshot = {
  generatedAt: "stable",
  server: manifest.server,
  tools: manifest.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
    permission: tool.permission,
    approvalRequired: Boolean(tool.approvalRequired),
    sideEffects: tool.sideEffects || "none",
    outputShape: tool.outputShape,
    examples: tool.examples,
    failureModes: tool.failureModes,
    inputHash: hash(tool.inputSchema),
    required: tool.inputSchema.required || []
  }))
};

const resourceSnapshot = {
  generatedAt: "stable",
  server: manifest.server,
  resources: kernelResources.map((resource) => ({
    name: resource.name,
    uri: resource.uri,
    title: resource.title,
    description: resource.description,
    mimeType: resource.mimeType,
    access: "read-only"
  }))
};

const promptSnapshot = {
  generatedAt: "stable",
  server: manifest.server,
  prompts: kernelPrompts.map((prompt) => ({
    name: prompt.name,
    title: prompt.title,
    description: prompt.description,
    arguments: Object.keys(prompt.argsSchema || {})
  }))
};

const docs = `# Sage Kernel MCP Tools

Generated from \`apps/mcp-server/tools.json\`.

| Tool | Risk | Permission | Approval Required | Side Effects |
| --- | --- | --- | --- | --- |
${snapshot.tools.map((tool) => `| \`${tool.name}\` | ${tool.risk} | \`${tool.permission}\` | ${tool.approvalRequired ? "Yes" : "No"} | ${tool.sideEffects} |`).join("\n")}

## Output Shape

${snapshot.tools.map((tool) => `### \`${tool.name}\`\n\n${tool.outputShape}\n\nExample input:\n\n\`\`\`json\n${JSON.stringify(tool.examples[0].input, null, 2)}\n\`\`\``).join("\n\n")}

## Failure Modes

${snapshot.tools.map((tool) => `### \`${tool.name}\`\n\n${tool.failureModes.map((mode) => `- ${mode}`).join("\n")}`).join("\n\n")}

## Approval Required

Tools marked "Yes" require a signed approval record whose action and payload match the requested tool call.
`;

const resourceDocs = `# Sage Kernel MCP Resources

Generated from \`apps/mcp-server/src/kernel-resources.mjs\`.

These resources are read-only. Use resources when an MCP client needs to inspect kernel state without invoking command-style tools.

| Resource | URI | MIME Type | Description |
| --- | --- | --- | --- |
${resourceSnapshot.resources.map((resource) => `| ${resource.title} | \`${resource.uri}\` | \`${resource.mimeType}\` | ${resource.description} |`).join("\n")}
`;

const promptDocs = `# Sage Kernel MCP Prompts

Generated from \`apps/mcp-server/src/kernel-prompts.mjs\`.

These prompts are workflow entry points for day-to-day kernel operations.

| Prompt | Arguments | Description |
| --- | --- | --- |
${promptSnapshot.prompts.map((prompt) => `| \`${prompt.name}\` | ${prompt.arguments.map((arg) => `\`${arg}\``).join(", ") || "none"} | ${prompt.description} |`).join("\n")}
`;

fs.mkdirSync(contractsDir, { recursive: true });
fs.writeFileSync(path.join(contractsDir, "tools.snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
fs.writeFileSync(path.join(contractsDir, "prompts.snapshot.json"), `${JSON.stringify(promptSnapshot, null, 2)}\n`);
fs.writeFileSync(path.join(contractsDir, "resources.snapshot.json"), `${JSON.stringify(resourceSnapshot, null, 2)}\n`);
fs.writeFileSync(docsPath, docs);
fs.writeFileSync(promptsDocsPath, promptDocs);
fs.writeFileSync(resourcesDocsPath, resourceDocs);

console.log("MCP contracts generated.");
console.log(`Tools: ${snapshot.tools.length}`);
console.log(`Prompts: ${promptSnapshot.prompts.length}`);
console.log(`Resources: ${resourceSnapshot.resources.length}`);
