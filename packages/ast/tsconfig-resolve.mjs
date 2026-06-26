// TypeScript path-alias resolution. Modern TS apps/monorepos import via aliases
// (e.g. "@giggl/types" -> "packages/types/src/index.ts") declared in tsconfig
// `compilerOptions.paths`. Without resolving these, the module graph treats
// alias imports as external and over-reports orphans (giggl: 307 false orphans).
// This reads tsconfig (JSONC-tolerant), and resolves an alias spec to a real
// repo-relative file using the project's own path map.

import fs from "node:fs";
import path from "node:path";

const CODE_EXTS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const INDEX_EXTS = ["/index.ts", "/index.tsx", "/index.js", "/index.mjs"];

// Read compilerOptions.baseUrl + paths from tsconfig.json (tolerates // and /* */
// comments and trailing commas). Returns { baseUrl, aliases:[{pattern,targets}] }.
export function readTsconfigAliases(root) {
  const file = path.join(root, "tsconfig.json");
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { baseUrl: ".", aliases: [] };
  }
  const parsed = parseJsonc(raw);
  const options = parsed?.compilerOptions || {};
  const baseUrl = options.baseUrl || ".";
  const aliases = Object.entries(options.paths || {}).map(([pattern, targets]) => ({
    pattern,
    targets: Array.isArray(targets) ? targets : [targets]
  }));
  // Most specific (longest, non-wildcard) patterns first.
  aliases.sort((a, b) => b.pattern.length - a.pattern.length);
  return { baseUrl, aliases };
}

// Resolve a bare import spec via the alias map to a repo-relative file in fileSet.
export function resolveAlias(spec, config, fileSet) {
  if (!config || !Array.isArray(config.aliases)) return null;
  const base = config.baseUrl && config.baseUrl !== "." ? config.baseUrl.replace(/\/$/, "") : "";
  for (const { pattern, targets } of config.aliases) {
    const matched = matchPattern(spec, pattern);
    if (matched === null) continue;
    for (const target of targets) {
      const resolvedTarget = target.replace(/\*/, matched);
      const rel = toPosix(base ? path.posix.join(base, resolvedTarget) : resolvedTarget);
      const hit = firstExisting(rel, fileSet);
      if (hit) return hit;
    }
  }
  return null;
}

// "@x/*" matches "@x/foo" -> "foo"; "@x" matches "@x" -> "". null = no match.
function matchPattern(spec, pattern) {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1); // keep trailing slash
    return spec.startsWith(prefix) ? spec.slice(prefix.length) : null;
  }
  return spec === pattern ? "" : null;
}

function firstExisting(rel, fileSet) {
  const cleaned = rel.replace(/\/$/, "");
  for (const ext of CODE_EXTS) {
    const candidate = `${cleaned}${ext}`;
    if (fileSet.has(candidate)) return candidate;
  }
  for (const ext of INDEX_EXTS) {
    const candidate = `${cleaned}${ext}`;
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

// JSONC parse: strip // and /* */ comments OUTSIDE strings (so wildcard alias
// values like "@x/*" are not mistaken for comment starts), drop trailing commas.
function parseJsonc(text) {
  try {
    return JSON.parse(stripTrailingCommas(stripComments(String(text))));
  } catch {
    return null;
  }
}

function stripComments(text) {
  let out = "";
  let inString = false;
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") { out += next ?? ""; i += 1; continue; }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; out += ch; continue; }
    if (ch === "/" && next === "/") { while (i < text.length && text[i] !== "\n") i += 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1; i += 1; continue; }
    out += ch;
  }
  return out;
}

function stripTrailingCommas(text) {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

const toPosix = (p) => String(p).replace(/\\/g, "/");
