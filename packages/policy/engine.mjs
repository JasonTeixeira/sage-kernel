// Central policy engine — capability gating beyond the action-name allowlist.
// Evaluates write paths, command execution, and network egress against a
// declarative policy. Default-deny for writes outside the repo, command
// executables outside the allowlist, and all network egress. Destructive
// commands and sensitive operations (publish/force-push/sudo) require approval.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Unambiguous destructive command patterns. Narrow on purpose: this set is also
// scanned over arbitrary tool payloads by the guard, so it must not false-fire
// on ordinary text.
export const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-[a-z]*r[a-z]*f\b/i,
  /\brm\s+-[a-z]*f[a-z]*r\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bdiskutil\s+(erase|reformat)\b/i,
  /\b(shutdown|reboot|halt)\b/i,
  /:\(\)\s*\{[^}]*:\s*\|\s*:[^}]*\}/, // fork bomb
  /\bchmod\s+-?R?\s*777\b/i,
  /\b(curl|wget)\b[^|]*\|\s*(sh|bash)\b/i,
  />\s*\/dev\/sd[a-z]/i
];

// Operations that are allowed but require explicit approval.
const APPROVAL_PATTERNS = [/\bnpm\s+publish\b/i, /\bgit\s+push\b[^\n]*(--force|\s-f\b)/i, /\bsudo\b/i];

export const DEFAULT_POLICY = {
  version: 1,
  writePaths: {
    denySensitive: [".ssh", ".aws", ".gnupg", ".npmrc", "id_rsa", "id_ed25519"]
  },
  commands: {
    allowExecutables: [
      "node", "npm", "npx", "pnpm", "yarn", "git", "tsc", "eslint", "prettier",
      "sh", "bash", "echo", "cat", "ls", "mkdir", "cp", "mv", "rm", "grep",
      "find", "jq", "test", "true", "shasum", "wc", "sort", "diff"
    ]
  },
  network: { allowHosts: [], default: "deny" },
  approvalRequired: ["publish", "deploy", "destructive", "external_mutation"]
};

export function isDestructiveCommand(text) {
  const value = String(text ?? "");
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(value));
}

export function evaluateWritePath(target, options = {}) {
  const root = options.root || process.cwd();
  const policy = options.policy || DEFAULT_POLICY;
  const abs = path.resolve(root, target);
  for (const sensitive of policy.writePaths.denySensitive) {
    if (abs.includes(`/${sensitive}/`) || abs.endsWith(`/${sensitive}`) || path.basename(abs) === sensitive) {
      return { allowed: false, requiresApproval: true, reasons: [`writes to a sensitive path (${sensitive})`] };
    }
  }
  const inRoot = abs === root || abs.startsWith(root + path.sep);
  const inTmp = abs.startsWith(os.tmpdir() + path.sep);
  if (inRoot || inTmp) return { allowed: true, requiresApproval: false, reasons: ["within the repository or the temp directory"] };
  return { allowed: false, requiresApproval: true, reasons: [`write path escapes the repository root: ${abs}`] };
}

export function evaluateCommand(command, options = {}) {
  const policy = options.policy || DEFAULT_POLICY;
  const text = String(command ?? "").trim();
  if (isDestructiveCommand(text)) {
    return { allowed: false, requiresApproval: true, destructive: true, reasons: ["matches a destructive command pattern"] };
  }
  const executable = (text.split(/\s+/)[0] || "").split("/").pop();
  if (executable && !policy.commands.allowExecutables.includes(executable)) {
    return { allowed: false, requiresApproval: true, destructive: false, reasons: [`executable not allowlisted: ${executable}`] };
  }
  if (APPROVAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return { allowed: true, requiresApproval: true, destructive: false, reasons: ["sensitive operation requires approval"] };
  }
  return { allowed: true, requiresApproval: false, destructive: false, reasons: ["allowed"] };
}

export function evaluateNetwork(host, options = {}) {
  const policy = options.policy || DEFAULT_POLICY;
  if ((policy.network.allowHosts || []).includes(host)) {
    return { allowed: true, requiresApproval: false, reasons: [`host is allowlisted: ${host}`] };
  }
  return { allowed: false, requiresApproval: true, reasons: [`network egress denied by default: ${host}`] };
}

export function evaluatePolicy(request = {}) {
  const { kind, value } = request;
  switch (kind) {
    case "write_path":
      return { kind, value, ...evaluateWritePath(value, request) };
    case "command":
      return { kind, value, ...evaluateCommand(value, request) };
    case "network":
      return { kind, value, ...evaluateNetwork(value, request) };
    default:
      return { kind, value, allowed: false, requiresApproval: true, reasons: [`unknown capability kind: ${kind}`] };
  }
}

export function explainPolicy(request = {}) {
  const decision = evaluatePolicy(request);
  return {
    decision,
    policy: {
      writePathRule: "Writes must stay within the repository or a temp directory; sensitive paths are denied.",
      commandRule: "Executables must be allowlisted; destructive commands are blocked; publish/force-push/sudo require approval.",
      networkRule: "Network egress is denied unless the host is allowlisted."
    }
  };
}

export function validatePolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== "object") return { valid: false, errors: ["policy must be an object"] };
  if (!policy.writePaths || !Array.isArray(policy.writePaths.denySensitive)) errors.push("writePaths.denySensitive must be an array");
  if (!policy.commands || !Array.isArray(policy.commands.allowExecutables)) errors.push("commands.allowExecutables must be an array");
  if (!policy.network || !Array.isArray(policy.network.allowHosts)) errors.push("network.allowHosts must be an array");
  return { valid: errors.length === 0, errors };
}

export function loadPolicy(root = process.cwd()) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_POLICY));
  for (const file of [path.join(root, "packages/policy/policies/default.json"), path.join(root, ".sage-kernel/policy.json")]) {
    try {
      const override = JSON.parse(fs.readFileSync(file, "utf8"));
      if (override.writePaths?.denySensitive) merged.writePaths.denySensitive = override.writePaths.denySensitive;
      if (override.commands?.allowExecutables) merged.commands.allowExecutables = override.commands.allowExecutables;
      if (override.network?.allowHosts) merged.network.allowHosts = override.network.allowHosts;
    } catch {
      /* no override */
    }
  }
  return merged;
}
