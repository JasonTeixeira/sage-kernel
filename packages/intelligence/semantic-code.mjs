import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md"]);
const EXCLUDED_DIRS = new Set([".git", "node_modules", ".sage-kernel", "dist", "coverage", ".next", ".turbo"]);

export function createSemanticCode(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const adapter = options.adapter || readLocalAdapter(root);

  return {
    adapter,
    indexProject(input = {}) {
      const projectPath = resolveInsideRoot(root, input.projectPath || ".");
      const files = collectFiles(projectPath, {
        root,
        limit: clampNumber(input.limit, 1, 1000, 250),
        extensions: input.extensions ? new Set(input.extensions.map((item) => `.${String(item).replace(/^\./, "")}`)) : DEFAULT_EXTENSIONS
      });
      const modules = files.map((file) => analyzeFile(file, root));
      const symbols = modules.flatMap((module) => module.symbols);
      return {
        adapter,
        projectPath,
        generatedAt: new Date().toISOString(),
        totals: {
          files: modules.length,
          symbols: symbols.length,
          referencesIndexed: modules.reduce((sum, module) => sum + module.referenceTerms.length, 0)
        },
        modules,
        symbols
      };
    },
    searchSymbol(input = {}) {
      if (!input.query) throw new Error("semantic.searchSymbol requires input.query");
      const index = this.indexProject(indexInput(input));
      const q = String(input.query).toLowerCase();
      const limit = clampNumber(input.limit, 1, 100, 20);
      return {
        query: input.query,
        count: index.symbols.filter((symbol) => symbol.searchText.includes(q)).length,
        results: index.symbols
          .filter((symbol) => symbol.searchText.includes(q))
          .slice(0, limit)
          .map(stripSearchText)
      };
    },
    findReferences(input = {}) {
      if (!input.query) throw new Error("semantic.findReferences requires input.query");
      const index = this.indexProject(indexInput(input));
      const q = String(input.query).toLowerCase();
      const limit = clampNumber(input.limit, 1, 100, 20);
      const references = [];
      for (const module of index.modules) {
        for (const hit of module.references) {
          if (hit.text.toLowerCase().includes(q)) {
            references.push({ file: module.file, line: hit.line, text: hit.text });
          }
        }
      }
      return { query: input.query, count: references.length, results: references.slice(0, limit) };
    },
    summarizeModule(input = {}) {
      if (!input.file) throw new Error("semantic.summarizeModule requires input.file");
      const absolute = resolveInsideRoot(root, input.file);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        throw new Error(`Module file not found: ${input.file}`);
      }
      const module = analyzeFile(absolute, root);
      return {
        file: module.file,
        language: module.language,
        lines: module.lines,
        symbolCount: module.symbols.length,
        symbols: module.symbols.map(stripSearchText),
        imports: module.imports,
        exports: module.exports,
        summary: summarize(module)
      };
    }
  };
}

export function semanticSmoke(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const semantic = createSemanticCode({ root });
  const index = semantic.indexProject({ projectPath: ".", limit: 300 });
  const search = semantic.searchSymbol({ query: "createSemanticCode", limit: 5 });
  const module = semantic.summarizeModule({ file: "packages/intelligence/semantic-code.mjs" });
  const references = semantic.findReferences({ query: "semantic", limit: 5 });
  return {
    status: index.totals.files > 0 && search.results.length > 0 && module.symbolCount > 0 ? "passed" : "failed",
    adapter: semantic.adapter,
    totals: index.totals,
    searchCount: search.results.length,
    referenceCount: references.results.length,
    module
  };
}

function readLocalAdapter(root) {
  const fixture = path.join(root, "packages/intelligence/fixtures/valid/semantic-adapter.json");
  if (!fs.existsSync(fixture)) {
    return {
      id: "semantic_local_baseline",
      name: "Local semantic baseline",
      mode: "local",
      status: "available",
      capabilities: ["index_project", "search_symbol", "find_references", "summarize_module"],
      mutationPolicy: "read_only"
    };
  }
  return JSON.parse(fs.readFileSync(fixture, "utf8"));
}

function indexInput(input) {
  return {
    projectPath: input.projectPath,
    extensions: input.extensions,
    limit: input.indexLimit
  };
}

function collectFiles(start, options) {
  const files = [];
  walk(start);
  return files.sort();

  function walk(current) {
    if (files.length >= options.limit) return;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const name = path.basename(current);
      if (EXCLUDED_DIRS.has(name)) return;
      for (const entry of fs.readdirSync(current).sort()) {
        walk(path.join(current, entry));
        if (files.length >= options.limit) return;
      }
      return;
    }
    if (!stat.isFile()) return;
    if (!options.extensions.has(path.extname(current))) return;
    if (!isInside(options.root, current)) return;
    files.push(current);
  }
}

function analyzeFile(file, root) {
  const relative = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const extension = path.extname(file);
  const language = languageFor(extension);
  const symbols = extractSymbols({ relative, lines, language, extension });
  const references = lines
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((item) => item.text && !item.text.startsWith("//") && !item.text.startsWith("#"))
    .slice(0, 300);
  const imports = lines
    .map((line) => line.trim())
    .filter((line) => /^import\s|^const\s.+require\(|^export\s.+from\s/.test(line))
    .slice(0, 50);
  const exports = symbols.filter((symbol) => symbol.exported).map((symbol) => symbol.name);
  return {
    file: relative,
    language,
    lines: lines.length,
    symbols,
    imports,
    exports,
    references,
    referenceTerms: references.map((item) => item.text.toLowerCase())
  };
}

function extractSymbols({ relative, lines, language, extension }) {
  if (extension === ".json") return extractJsonSymbols(relative, lines);
  if (extension === ".md") return extractMarkdownSymbols(relative, lines);
  return extractCodeSymbols(relative, lines, language);
}

function extractCodeSymbols(file, lines, language) {
  const symbols = [];
  const patterns = [
    { kind: "function", regex: /^\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
    { kind: "class", regex: /^\s*(export\s+)?class\s+([A-Za-z_$][\w$]*)/ },
    { kind: "const", regex: /^\s*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/ },
    { kind: "let", regex: /^\s*(export\s+)?let\s+([A-Za-z_$][\w$]*)\s*=/ },
    { kind: "var", regex: /^\s*(export\s+)?var\s+([A-Za-z_$][\w$]*)\s*=/ }
  ];
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) continue;
      const exported = Boolean(match[1]) || line.trim().startsWith("export ");
      symbols.push(createSymbol({ file, line: index + 1, name: match[2], kind: pattern.kind, language, exported, signature: line.trim() }));
      break;
    }
  });
  return symbols;
}

function extractMarkdownSymbols(file, lines) {
  return lines
    .map((line, index) => ({ line, index }))
    .filter((item) => /^#{1,6}\s+\S/.test(item.line))
    .map((item) => {
      const depth = item.line.match(/^#+/)?.[0].length || 1;
      const name = item.line.replace(/^#+\s+/, "").trim();
      return createSymbol({ file, line: item.index + 1, name, kind: `heading-${depth}`, language: "markdown", exported: false, signature: item.line.trim() });
    });
}

function extractJsonSymbols(file, lines) {
  try {
    const value = JSON.parse(lines.join("\n"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.keys(value).map((name) => createSymbol({
      file,
      line: findJsonKeyLine(lines, name),
      name,
      kind: "json-key",
      language: "json",
      exported: false,
      signature: `"${name}"`
    }));
  } catch {
    return [];
  }
}

function createSymbol({ file, line, name, kind, language, exported, signature }) {
  return {
    id: `${file}:${line}:${name}`,
    name,
    kind,
    file,
    line,
    language,
    exported,
    signature,
    searchText: `${name} ${kind} ${file} ${signature}`.toLowerCase()
  };
}

function stripSearchText(symbol) {
  const { searchText, ...publicSymbol } = symbol;
  return publicSymbol;
}

function summarize(module) {
  const exported = module.exports.length ? `Exports ${module.exports.join(", ")}.` : "No exported symbols detected.";
  return `${module.file} is a ${module.language} module with ${module.lines} lines and ${module.symbols.length} detected symbols. ${exported}`;
}

function resolveInsideRoot(root, target) {
  const absolute = path.resolve(root, target);
  if (!isInside(root, absolute)) {
    throw new Error(`Path is outside the semantic project root: ${target}`);
  }
  return absolute;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function languageFor(extension) {
  return {
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript-react",
    ".jsx": "javascript-react",
    ".json": "json",
    ".md": "markdown"
  }[extension] || "text";
}

function findJsonKeyLine(lines, key) {
  const pattern = new RegExp(`^\\s*"${escapeRegExp(key)}"\\s*:`);
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : 1;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(number, max));
}
