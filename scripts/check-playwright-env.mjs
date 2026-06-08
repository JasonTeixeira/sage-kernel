import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envLocal = path.join(root, ".env.local");
const key = "PLAYWRIGHT_MCP_EXTENSION_TOKEN";

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return index >= 0 ? [line.slice(0, index), line.slice(index + 1)] : [line, ""];
      })
  );
}

const localEnv = parseEnvFile(envLocal);
const value = process.env[key] || localEnv[key];

if (!value || value === "undefined") {
  console.error(`${key} is missing. Set it in .env.local or your shell environment.`);
  process.exit(1);
}

console.log(`${key} is configured.`);
