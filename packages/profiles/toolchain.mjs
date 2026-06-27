// Language-aware command honesty. The SDLC profiles prescribe npm commands (the
// deep engines are JS/TS-native). For a NON-Node project, recommending `npm test`
// is wrong and erodes trust. localizeCommands maps the intent (test / coverage /
// lint) to the detected language's real toolchain, and attaches an honest note that
// sage-kernel's deep analysis (AST/SAST/taint/coverage) is JS/TS-native — other
// languages get profile + meta checks, with toolchain commands inferred, not run.

const TOOLCHAINS = {
  python: { test: "pytest", coverage: "pytest --cov", lint: "ruff check . && bandit -r .", install: "pip install -e ." },
  go: { test: "go test ./...", coverage: "go test -cover ./...", lint: "go vet ./...", install: "go mod download" },
  rust: { test: "cargo test", coverage: "cargo tarpaulin", lint: "cargo clippy -- -D warnings", install: "cargo fetch" },
  java: { test: "mvn test", coverage: "mvn verify", lint: "mvn checkstyle:check", install: "mvn install -DskipTests" },
  ruby: { test: "bundle exec rspec", coverage: "bundle exec rspec", lint: "bundle exec rubocop", install: "bundle install" },
  php: { test: "vendor/bin/phpunit", coverage: "vendor/bin/phpunit --coverage-text", lint: "vendor/bin/phpstan analyse", install: "composer install" },
  dotnet: { test: "dotnet test", coverage: "dotnet test --collect:\"XPlat Code Coverage\"", lint: "dotnet format --verify-no-changes", install: "dotnet restore" },
  swift: { test: "swift test", coverage: "swift test --enable-code-coverage", lint: "swiftlint", install: "swift package resolve" },
  terraform: { test: "terraform validate", coverage: "n/a", lint: "tflint", install: "terraform init" }
};

// Map an npm command to its intent so we can translate it per language.
function intentOf(cmd) {
  const c = String(cmd).toLowerCase();
  if (c.includes("coverage")) return "coverage";
  if (c.includes("lint") || c.includes("typecheck")) return "lint";
  if (c.includes("install")) return "install";
  if (c.includes("test")) return "test";
  return null;
}

// Pick the dominant language whose REAL toolchain we should recommend. A repo is
// "Node" only if it has a package.json — stray .js/.ts files with no package.json
// (common in Python/Go repos with a build script) do NOT make it a Node project.
function dominantLanguage(languages = [], hasPackageJson = false) {
  if (hasPackageJson) return null; // genuine Node project — npm commands are correct
  for (const lang of ["python", "go", "rust", "java", "ruby", "php", "dotnet", "swift", "terraform"]) {
    if (languages.includes(lang)) return lang;
  }
  return null; // only js/ts/shell but no manifest — keep generic, don't guess
}

// Returns { commands, toolchain, note }. For Node projects, commands pass through.
export function localizeCommands(commands = [], options = {}) {
  const languages = options.languages || [];
  const hasPackageJson = Boolean(options.hasPackageJson);
  const lang = dominantLanguage(languages, hasPackageJson);
  if (hasPackageJson || !lang) {
    return { commands, toolchain: hasPackageJson ? "node" : "unknown", note: null };
  }
  const map = TOOLCHAINS[lang];
  const localized = [];
  for (const cmd of commands) {
    const intent = intentOf(cmd);
    if (intent && map[intent] && map[intent] !== "n/a") localized.push(map[intent]);
  }
  const deduped = [...new Set(localized.length ? localized : [map.test].filter(Boolean))];
  return {
    commands: deduped,
    toolchain: lang,
    note: `Detected a ${lang} project. sage-kernel's deep analysis (AST review, SAST, taint, executed coverage) is JS/TS-native; for ${lang} you get profile + repository meta-checks, and these toolchain commands are INFERRED (verify before relying on them).`
  };
}

export { TOOLCHAINS };
