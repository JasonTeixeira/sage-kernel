// Repo cleanup classifier (pure, deterministic, testable). Given the list of
// tracked files it sorts them into four buckets for a PUBLIC OSS release:
//   essential  - ship it; never removable.
//   residual   - internal scratch/planning/proof logs that should not be in a
//                public repo; safe to propose for removal.
//   ambiguous  - unclear; a HUMAN must decide (never auto-removed).
//   blocker    - must be resolved before publishing (committed env/secret-ish).
//
// Design rule: CONSERVATIVE. When in doubt -> ambiguous, never residual. Anything
// essential is protected even if it also matches a residual pattern. This is the
// safety contract the cleanup CLI relies on (it only ever acts on `residual`).

// Whole top-level dirs that are product code/assets — always essential.
const ESSENTIAL_DIRS = new Set(["apps", "packages", "bin", "catalog", "tests", "agents", "assets", "examples", ".github", "providers", "schemas", "scripts"]);

// Exact essential files at the repo root.
const ESSENTIAL_FILES = new Set([
  "package.json", "package-lock.json", "README.md", "LICENSE", ".gitignore",
  ".env.example", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md",
  "CHANGELOG.md", "AGENTS.md", "CLAUDE.md", ".npmignore"
]);

// User-facing docs that belong in a public repo.
const USER_DOCS = new Set([
  "docs/GETTING_STARTED.md", "docs/USING_SAGE_KERNEL.md", "docs/GLOBAL.md",
  "docs/mcp-tools.md", "docs/mcp-resources.md", "docs/mcp-prompts.md",
  "docs/ENGINEERING_LOOP.md", "docs/BRAIN_ACTIVATION.md", "docs/README.md",
  // Standard public-project docs — keep.
  "docs/ARCHITECTURE.md", "docs/INSTALL.md", "docs/USAGE.md", "docs/MCP_CLIENTS.md",
  "docs/MCP_SERVER.md", "docs/PERSISTENCE.md", "docs/SECURITY_MODEL.md",
  "docs/RELEASE_PROCESS.md", "docs/ROADMAP.md", "docs/VISUAL_GUIDE.md",
  "docs/QUALITY_RATCHET.md", "docs/RUNTIME_ENGINE.md", "docs/DEMO_ASSETS.md"
]);

// Internal planning / program-tracking / proof-log patterns (NOT for a public repo).
const RESIDUAL_PATTERNS = [
  /MASTER_PLAN/i, /MASTER_PROGRAM/i, /BLUEPRINT/i, /COMPLETION_PROGRAM/i,
  /COMPANION_LAYER_PROGRAM/i, /WORLD_CLASS/i, /90_?99/i, /_PROGRAM\.txt$/i,
  /AUDIT_REPORT/i, /GAP_AUDIT/i, /_PROOF\.md$/i, /(^|\/)PROGRAM_\d/i,
  /100_SCORE/i, /IMPLEMENTATION_PROGRAM/i
];

// Always-scratch (junk) patterns.
const SCRATCH_PATTERNS = [/\.DS_Store$/, /\.log$/, /\.tmp$/, /(^|\/)tmp\//, /(^|\/)scratch\//, /~$/, /\.orig$/, /\.bak$/];

// Things that must be resolved before publishing.
const BLOCKER_PATTERNS = [/(^|\/)\.env$/, /(^|\/)\.env\.local$/, /(^|\/)\.env\.[a-z]+$/i];

function topDir(file) { return file.includes("/") ? file.split("/")[0] : ""; }

function matchAny(patterns, file) { return patterns.some((re) => re.test(file)); }

export function classifyRepoFiles(files = [], options = {}) {
  const userDocs = options.userDocs || USER_DOCS;
  const essential = [];
  const residual = [];
  const ambiguous = [];
  const blocker = [];

  for (const file of files) {
    // .env.example is essential; other env files are blockers.
    if (file === ".env.example") { essential.push(file); continue; }
    if (matchAny(BLOCKER_PATTERNS, file)) { blocker.push({ path: file, reason: "committed env file may contain secrets — remove before publishing" }); continue; }

    // scratch/junk is removable regardless of which dir it lives in.
    if (matchAny(SCRATCH_PATTERNS, file)) { residual.push({ path: file, reason: "scratch/build/junk artifact" }); continue; }

    if (ESSENTIAL_DIRS.has(topDir(file))) { essential.push(file); continue; }
    if (ESSENTIAL_FILES.has(file)) { essential.push(file); continue; }
    if (userDocs.has(file)) { essential.push(file); continue; }
    if (file.startsWith("docs/adr/")) { essential.push(file); continue; } // ADRs are standard OSS docs
    if (/\.ya?ml$/.test(file) || /Dockerfile/.test(file) || /docker-compose/.test(file)) { essential.push(file); continue; } // infra/config

    // internal planning / proof logs -> residual
    if (matchAny(RESIDUAL_PATTERNS, file)) { residual.push({ path: file, reason: "internal planning/program/proof log — not for a public repo" }); continue; }

    // docs not in the user-doc set, and any other unclassified top-level/file ->
    // ambiguous (human decides). Never auto-removed.
    if (file.startsWith("docs/")) { ambiguous.push({ path: file, reason: "doc not in the known user-facing set — keep, move to a notes/ dir, or remove (human decision)" }); continue; }
    ambiguous.push({ path: file, reason: "unclassified file — human decision" });
  }

  return {
    essential,
    residual,
    ambiguous,
    blocker,
    summary: { total: files.length, essential: essential.length, residual: residual.length, ambiguous: ambiguous.length, blocker: blocker.length }
  };
}

export { ESSENTIAL_DIRS, ESSENTIAL_FILES, USER_DOCS, RESIDUAL_PATTERNS };
