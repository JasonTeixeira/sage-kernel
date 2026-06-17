import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const releaseWorkflow = ".github/workflows/release.yml";

export function validateReleaseProvenance(options = {}) {
  const workspace = options.root || root;
  const failures = [];
  const pkg = readJson(path.join(workspace, "package.json"), failures, "package.json");
  const workflowPath = path.join(workspace, releaseWorkflow);
  const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, "utf8") : "";

  if (!pkg?.repository?.url?.includes("github.com/JasonTeixeira/sage-kernel")) {
    failures.push("package.json repository.url must match the public GitHub repository for provenance");
  }
  if (pkg?.publishConfig?.access !== "public") {
    failures.push("package.json publishConfig.access must be public");
  }
  if (pkg?.publishConfig?.provenance !== true) {
    failures.push("package.json publishConfig.provenance must be true");
  }
  if (!pkg?.scripts?.["verify:fresh-install"]) failures.push("Missing verify:fresh-install script");
  if (!pkg?.scripts?.["release:check"]) failures.push("Missing release:check script");

  if (!workflow) {
    failures.push(`Missing release workflow: ${releaseWorkflow}`);
  } else {
    requirePattern(workflow, /on:\s*\n\s*release:/, `${releaseWorkflow} must publish from GitHub release events`, failures);
    requirePattern(workflow, /types:\s*\[published]/, `${releaseWorkflow} must run only for published releases`, failures);
    requirePattern(workflow, /contents:\s*read/, `${releaseWorkflow} must request contents: read`, failures);
    requirePattern(workflow, /id-token:\s*write/, `${releaseWorkflow} must request id-token: write for provenance`, failures);
    requirePattern(workflow, /node-version:\s*22\.14\.0/, `${releaseWorkflow} must use Node 22.14.0 or newer for trusted publishing`, failures);
    requirePattern(workflow, /registry-url:\s*['"]https:\/\/registry\.npmjs\.org['"]/, `${releaseWorkflow} must publish to npmjs registry`, failures);
    requirePattern(workflow, /package-manager-cache:\s*false/, `${releaseWorkflow} must disable package manager cache for release builds`, failures);
    requirePattern(workflow, /npm install -g npm@\^11\.10\.0/, `${releaseWorkflow} must install npm 11.10+ for trusted publishing support`, failures);
    requirePattern(workflow, /npm ci/, `${releaseWorkflow} must install from lockfile`, failures);
    requirePattern(workflow, /npm run verify:fresh-install/, `${releaseWorkflow} must run fresh-install verification`, failures);
    requirePattern(workflow, /npm run release:check/, `${releaseWorkflow} must run release checks`, failures);
    requirePattern(workflow, /npm publish --provenance --access public/, `${releaseWorkflow} must publish with provenance and public access`, failures);
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    workflow: releaseWorkflow,
    failures
  };
}

function requirePattern(body, pattern, message, failures) {
  if (!pattern.test(body)) failures.push(message);
}

function readJson(file, failures, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`Invalid ${label}: ${error.message}`);
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateReleaseProvenance({ root });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "passed" ? 0 : 1);
}
