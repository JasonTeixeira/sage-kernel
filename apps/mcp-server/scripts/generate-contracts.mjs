import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kernelPrompts } from "../src/kernel-prompts.mjs";
import { kernelResources } from "../src/kernel-resources.mjs";

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createMcpContractArtifacts({ manifest, prompts = kernelPrompts, resources = kernelResources }) {
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
    resources: resources.map((resource) => ({
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
    prompts: prompts.map((prompt) => ({
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

  return { snapshot, promptSnapshot, resourceSnapshot, docs, promptDocs, resourceDocs };
}

export function generateMcpContracts(options = {}) {
  const root = options.root || process.cwd();
  const manifest = options.manifest || JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));
  const artifacts = createMcpContractArtifacts({
    manifest,
    prompts: options.prompts || kernelPrompts,
    resources: options.resources || kernelResources
  });
  const contractsDir = path.join(root, "apps/mcp-server/contracts");
  const docsPath = path.join(root, "docs/mcp-tools.md");
  const promptsDocsPath = path.join(root, "docs/mcp-prompts.md");
  const resourcesDocsPath = path.join(root, "docs/mcp-resources.md");

  fs.mkdirSync(contractsDir, { recursive: true });
  fs.writeFileSync(path.join(contractsDir, "tools.snapshot.json"), `${JSON.stringify(artifacts.snapshot, null, 2)}\n`);
  fs.writeFileSync(path.join(contractsDir, "prompts.snapshot.json"), `${JSON.stringify(artifacts.promptSnapshot, null, 2)}\n`);
  fs.writeFileSync(path.join(contractsDir, "resources.snapshot.json"), `${JSON.stringify(artifacts.resourceSnapshot, null, 2)}\n`);
  fs.writeFileSync(docsPath, artifacts.docs);
  fs.writeFileSync(promptsDocsPath, artifacts.promptDocs);
  fs.writeFileSync(resourcesDocsPath, artifacts.resourceDocs);

  return {
    tools: artifacts.snapshot.tools.length,
    prompts: artifacts.promptSnapshot.prompts.length,
    resources: artifacts.resourceSnapshot.resources.length
  };
}

export function runGenerateContractsCli(options = {}) {
  const stdout = options.stdout || console.log;
  const result = generateMcpContracts(options);
  stdout("MCP contracts generated.");
  stdout(`Tools: ${result.tools}`);
  stdout(`Prompts: ${result.prompts}`);
  stdout(`Resources: ${result.resources}`);
  return 0;
}

export const __generateContractsTestInternals = { hash };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runGenerateContractsCli());
}
