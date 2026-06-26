// Plugin registry (cat 8 extensibility). Languages, engines, and profiles are
// registered as data-driven plugins so adding one is configuration, not a core
// edit. The core only knows the plugin interface; concrete capabilities register
// themselves. Built-ins (js/ts language parsers) are registered here.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseModule, parseTypeScript, safeParse } from "../ast/parse.mjs";

const KINDS = new Set(["language", "engine", "profile"]);
const registry = { language: new Map(), engine: new Map(), profile: new Map() };

// Validate a plugin spec without registering it (throws on a malformed plugin).
export function definePlugin(spec = {}) {
  if (!spec || typeof spec !== "object") throw new Error("plugin must be an object");
  if (!KINDS.has(spec.kind)) throw new Error(`plugin.kind must be one of: ${[...KINDS].join(", ")}`);
  if (!spec.id || typeof spec.id !== "string") throw new Error("plugin.id must be a non-empty string");
  if (spec.kind === "language") {
    if (!Array.isArray(spec.extensions) || spec.extensions.length === 0) throw new Error(`language plugin ${spec.id} needs extensions[]`);
    if (typeof spec.parse !== "function") throw new Error(`language plugin ${spec.id} needs a parse(source) function`);
  }
  if (spec.kind === "engine" && typeof spec.run !== "function") throw new Error(`engine plugin ${spec.id} needs a run() function`);
  return spec;
}

export function registerPlugin(spec) {
  const validated = definePlugin(spec);
  registry[validated.kind].set(validated.id, validated);
  return validated;
}

export function getPlugin(kind, id) {
  return registry[kind]?.get(id) || null;
}

export function listPlugins(kind) {
  return kind ? [...(registry[kind]?.values() || [])] : Object.fromEntries([...KINDS].map((k) => [k, [...registry[k].values()]]));
}

// Test/host hook to reset a kind to only its built-ins.
export function resetPlugins(kind) {
  if (kind) registry[kind] = new Map();
  else for (const k of KINDS) registry[k] = new Map();
  registerBuiltins();
}

// Resolve the language plugin that handles a file extension (e.g. "tsx").
export function languageForExtension(ext) {
  const normalized = String(ext || "").replace(/^\./, "").toLowerCase();
  return listPlugins("language").find((plugin) => plugin.extensions.includes(normalized)) || null;
}

// Parse a source by extension via the registered language plugins; a plugin that
// returns null (couldn't parse) falls back to the polyglot safeParse, and an
// unknown extension uses safeParse directly. So a registered plugin EXTENDS
// coverage to new languages without ever regressing built-in JS/TS/JSX handling.
export function parseByExtension(ext, source) {
  const plugin = languageForExtension(ext);
  if (plugin) {
    const ast = plugin.parse(source);
    if (ast) return ast;
  }
  return safeParse(source);
}

// Convenience: route by a file path's extension.
export function parseByPath(filePath, source) {
  const ext = String(filePath || "").split(".").pop();
  return parseByExtension(ext, source);
}

// Load project plugins from .sage-kernel/plugins/*.mjs (each default-exports a
// plugin spec, or an array of specs). This makes "add a language/engine/profile"
// genuinely config-not-core: drop a file, it's registered at startup. Errors in
// one plugin are isolated (logged + skipped), never crashing the host.
export async function loadProjectPlugins(options = {}) {
  const root = options.root || process.cwd();
  const dir = path.join(root, ".sage-kernel/plugins");
  const loaded = [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((name) => name.endsWith(".mjs"));
  } catch {
    return loaded; // no project plugins — fine
  }
  for (const name of files) {
    try {
      const mod = await import(pathToFileURL(path.join(dir, name)).href);
      const specs = Array.isArray(mod.default) ? mod.default : [mod.default];
      for (const spec of specs) {
        if (spec) loaded.push(registerPlugin(spec));
      }
    } catch (error) {
      (options.onError || ((message) => process.stderr.write(`[plugins] skipped ${name}: ${message}\n`)))(error.message || String(error));
    }
  }
  return loaded;
}

function registerBuiltins() {
  registerPlugin({
    kind: "language",
    id: "javascript",
    extensions: ["mjs", "cjs", "js", "jsx"],
    parse: (source) => {
      try {
        return parseModule(source);
      } catch {
        return null;
      }
    }
  });
  registerPlugin({
    kind: "language",
    id: "typescript",
    extensions: ["ts", "tsx", "mts", "cts"],
    parse: (source) => {
      try {
        return parseTypeScript(source);
      } catch {
        return null;
      }
    }
  });
}

registerBuiltins();
