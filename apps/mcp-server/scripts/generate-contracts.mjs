import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8"));
const contractsDir = path.join(root, "apps/mcp-server/contracts");
const docsPath = path.join(root, "docs/mcp-tools.md");

function inferRisk(tool) {
  if (!tool.sideEffects) return "safe";
  if (tool.sideEffects.includes("external")) return "external";
  if (tool.sideEffects.includes("runs") || tool.sideEffects.includes("writes")) return "mutating";
  return "safe";
}

function inferPermission(tool) {
  if (tool.permission) return tool.permission;
  const [, domain, action = "read"] = tool.name.split(".");
  return `${domain}:${action}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const snapshot = {
  generatedAt: "stable",
  server: manifest.server,
  tools: manifest.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    risk: inferRisk(tool),
    permission: inferPermission(tool),
    approvalRequired: Boolean(tool.approvalRequired),
    sideEffects: tool.sideEffects || "none",
    inputHash: hash(tool.inputSchema),
    required: tool.inputSchema.required || []
  }))
};

const docs = `# Sage Kernel MCP Tools

Generated from \`apps/mcp-server/tools.json\`.

| Tool | Risk | Permission | Approval Required | Side Effects |
| --- | --- | --- | --- | --- |
${snapshot.tools.map((tool) => `| \`${tool.name}\` | ${tool.risk} | \`${tool.permission}\` | ${tool.approvalRequired ? "Yes" : "No"} | ${tool.sideEffects} |`).join("\n")}

## Approval Required

Tools marked "Yes" require a signed approval record whose action and payload match the requested tool call.
`;

fs.mkdirSync(contractsDir, { recursive: true });
fs.writeFileSync(path.join(contractsDir, "tools.snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
fs.writeFileSync(docsPath, docs);

console.log("MCP contracts generated.");
console.log(`Tools: ${snapshot.tools.length}`);
