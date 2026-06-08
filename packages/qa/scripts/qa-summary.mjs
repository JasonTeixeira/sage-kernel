import fs from "node:fs";
import path from "node:path";

const sourceRoot =
  process.env.QA_OS_ROOT || "/Users/Sage/.graphify/repos/JasonTeixeira/nexural-qa-os";
const runnersDir = path.join(sourceRoot, "runners");
const packagesDir = path.join(sourceRoot, "packages");
const manifestPath = path.join(sourceRoot, "qa.manifest.json");

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`QA OS source not found: ${sourceRoot}`);
}

const runnerNames = fs.existsSync(runnersDir)
  ? fs
      .readdirSync(runnersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

const packageNames = fs.existsSync(packagesDir)
  ? fs
      .readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : null;

const summary = {
  sourceRoot,
  runnerCount: runnerNames.length,
  sampleRunners: runnerNames.slice(0, 20),
  packageCount: packageNames.length,
  packages: packageNames,
  hasCliPackage: packageNames.includes("cli"),
  hasMcpServerPackage: packageNames.includes("mcp-server"),
  hasEvidencePackage: packageNames.includes("evidence"),
  hasDagPackage: packageNames.includes("dag"),
  hasControlPlanePackage: packageNames.includes("control-plane"),
  manifestProject: manifest?.project?.name || null,
  manifestEnabledRunners: manifest?.runners?.enabled || []
};

console.log(JSON.stringify(summary, null, 2));
