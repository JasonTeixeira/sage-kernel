// Git hook installer for auto-interception. Installs a pre-commit hook that runs
// the operate guard so the SDLC loop runs on its own for every commit.

import fs from "node:fs";
import path from "node:path";

export function generatePreCommitHook() {
  return `#!/bin/sh
# Sage Kernel pre-commit guard — runs impacted tests and risk-coverage gates on
# staged changes. Installed by 'sage install-hooks'. To bypass once: git commit --no-verify
exec node bin/sage.mjs guard
`;
}

export function installGitHooks(options = {}) {
  const root = options.root || process.cwd();
  const gitDir = path.join(root, ".git");
  if (!fs.existsSync(gitDir)) {
    return { status: "skipped", reason: "not a git repository (no .git directory)" };
  }
  const hooksDir = path.join(gitDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const target = path.join(hooksDir, "pre-commit");
  const backup = fs.existsSync(target) ? `${target}.sage-backup-${Date.now()}` : null;
  if (backup) fs.copyFileSync(target, backup);
  fs.writeFileSync(target, generatePreCommitHook());
  fs.chmodSync(target, 0o755);
  return { status: "installed", path: path.relative(root, target), backup: backup ? path.relative(root, backup) : null };
}
