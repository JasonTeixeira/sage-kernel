import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const PROFILE_IDS = ["web", "mobile", "backend", "mcp", "security", "release"];

export function getAgentPack(options = {}) {
  const root = options.root || process.cwd();
  const manifest = readJson(path.join(root, "agents/manifest.json"));
  const canonical = readMarkdownFile(root, manifest.canonical, manifest.id);
  const profiles = manifest.profiles.map((relativePath) => {
    const id = path.basename(relativePath, ".md");
    return readMarkdownFile(root, relativePath, id);
  });
  return {
    version: manifest.version,
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    canonical,
    profiles,
    checks: {
      mustHaveRules: manifest.mustHaveRules || [],
      requiredProfiles: manifest.requiredProfiles || []
    },
    files: [canonical, ...profiles].map(({ relativePath, sha256, bytes }) => ({ relativePath, sha256, bytes }))
  };
}

export function validateAgentPack(options = {}) {
  const root = options.root || process.cwd();
  const failures = [];
  let pack = null;

  try {
    pack = getAgentPack({ root });
  } catch (error) {
    failures.push(error.message);
  }

  if (pack) {
    if (pack.version !== 1) failures.push("agents/manifest.json version must be 1");
    if (pack.id !== "sage-global-agents") failures.push("agents/manifest.json id must be sage-global-agents");
    if (!pack.canonical.text.includes("Sage Global Agent Operating System")) {
      failures.push("agents/AGENTS.md must identify the Sage Global Agent Operating System");
    }

    const profileIds = new Set(pack.profiles.map((profile) => profile.id));
    for (const id of PROFILE_IDS) {
      if (!profileIds.has(id)) failures.push(`Missing required agent profile: ${id}`);
    }

    for (const rule of pack.checks.mustHaveRules) {
      if (!pack.canonical.text.includes(rule)) failures.push(`agents/AGENTS.md missing required rule: ${rule}`);
    }

    for (const profile of pack.profiles) {
      if (!profile.text.includes("Required Checks")) failures.push(`${profile.relativePath} missing Required Checks section`);
      if (!profile.text.includes("Review Questions")) failures.push(`${profile.relativePath} missing Review Questions section`);
    }
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    coverage: {
      globalAgentFile: Boolean(pack?.canonical),
      profileCount: pack?.profiles.length || 0,
      requiredProfiles: PROFILE_IDS.length,
      ruleCount: pack?.checks.mustHaveRules.length || 0
    },
    failures
  };
}

export function installGlobalAgentPack(options = {}) {
  const root = options.root || process.cwd();
  const home = resolveAgentHome(options.home);
  const force = Boolean(options.force);
  const pack = getAgentPack({ root });
  const validation = validateAgentPack({ root });
  if (validation.status !== "passed") {
    throw new Error(`Agent pack validation failed: ${validation.failures.join("; ")}`);
  }

  fs.mkdirSync(home, { recursive: true });
  const target = path.join(home, "AGENTS.md");
  const agentDir = path.join(home, ".sage-kernel", "agents");
  fs.mkdirSync(agentDir, { recursive: true });

  const backups = [];
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, "utf8");
    if (current !== pack.canonical.text) {
      const backup = path.join(agentDir, `AGENTS.md.${timestamp()}.bak`);
      fs.copyFileSync(target, backup);
      backups.push(backup);
      if (!force) {
        throw new Error(`Global AGENTS.md already exists. Re-run with --force after reviewing backup: ${backup}`);
      }
    }
  }

  fs.writeFileSync(target, pack.canonical.text);
  for (const profile of pack.profiles) {
    const profileTarget = path.join(agentDir, "profiles", `${profile.id}.md`);
    fs.mkdirSync(path.dirname(profileTarget), { recursive: true });
    fs.writeFileSync(profileTarget, profile.text);
  }

  const installManifest = {
    installedAt: new Date().toISOString(),
    source: root,
    target,
    pack: {
      id: pack.id,
      version: pack.version,
      canonicalSha256: pack.canonical.sha256,
      profiles: pack.profiles.map(({ id, sha256 }) => ({ id, sha256 }))
    }
  };
  fs.writeFileSync(path.join(agentDir, "manifest.json"), `${JSON.stringify(installManifest, null, 2)}\n`);

  return {
    status: "installed",
    home,
    target,
    manifest: path.join(agentDir, "manifest.json"),
    profilesDirectory: path.join(agentDir, "profiles"),
    backups
  };
}

export function createAgentsDoctorReport(options = {}) {
  const root = options.root || process.cwd();
  const home = resolveAgentHome(options.home);
  const validation = validateAgentPack({ root });
  const target = path.join(home, "AGENTS.md");
  const manifestPath = path.join(home, ".sage-kernel", "agents", "manifest.json");
  const profilesDir = path.join(home, ".sage-kernel", "agents", "profiles");
  const checks = {
    sourcePack: check(validation.status === "passed", validation.failures),
    globalFile: check(fs.existsSync(target), [`Missing installed global file: ${target}`]),
    manifest: check(fs.existsSync(manifestPath), [`Missing install manifest: ${manifestPath}`]),
    profiles: check(PROFILE_IDS.every((id) => fs.existsSync(path.join(profilesDir, `${id}.md`))), [
      `Missing one or more installed profiles in ${profilesDir}`
    ])
  };
  const failed = Object.values(checks).filter((item) => item.status !== "passed");
  return {
    status: failed.length === 0 ? "passed" : "failed",
    home,
    target,
    checks
  };
}

export function listAgentProfiles(options = {}) {
  return {
    profiles: getAgentPack(options).profiles.map((profile) => ({
      id: profile.id,
      title: firstHeading(profile.text),
      relativePath: profile.relativePath,
      bytes: profile.bytes,
      sha256: profile.sha256
    }))
  };
}

export function formatAgentsText(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.profiles) {
    return `${value.profiles.map((profile) => `${profile.id}\t${profile.title}`).join("\n")}\n`;
  }
  if (value.checks) {
    return `Agent pack ${value.status}\n${Object.entries(value.checks)
      .map(([name, result]) => `${name}: ${result.status}`)
      .join("\n")}\n`;
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readMarkdownFile(root, relativePath, id) {
  const fullPath = path.join(root, relativePath);
  const text = fs.readFileSync(fullPath, "utf8");
  return {
    id,
    relativePath,
    text,
    bytes: Buffer.byteLength(text),
    sha256: hash(text)
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveAgentHome(home) {
  return path.resolve(home || process.env.SAGE_AGENT_HOME || os.homedir());
}

function check(condition, failures = []) {
  return condition ? { status: "passed", failures: [] } : { status: "failed", failures };
}

function firstHeading(markdown) {
  return markdown
    .split("\n")
    .find((line) => line.startsWith("# "))
    ?.slice(2)
    .trim() || "Untitled";
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
