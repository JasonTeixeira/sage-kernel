// Single source of truth for directories every repo-walker must skip. Previously
// four walkers (project-detector, review-engine, sast, supply-chain) each kept their
// own list, which drifted and caused false positives on framework build artifacts
// and vendored deps (the audit found sast/supply-chain missing .next/venv/etc).
// Import this everywhere instead of redefining.
export const IGNORED_DIRS = new Set([
  ".git", "node_modules", ".sage-kernel",
  "dist", "build", "out", "coverage", "generated",
  ".next", ".nuxt", ".turbo", ".cache",
  "venv", ".venv", "env", "__pycache__", ".pytest_cache",
  "vendor", "target", ".gradle", "Pods", ".terraform",
  ".idea", ".vscode"
]);
