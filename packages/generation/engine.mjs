// Scaffold engine (P29). HONEST SCOPE: this is a deterministic SCAFFOLDER, not a
// code generator — generate() emits structurally-valid placeholder stubs (each
// component function returns { ok: true }), NOT working behavior. There is no
// model lane. Its real value is the pairing with proveGenerated() (gate.mjs): a
// prove-or-discard guard that rejects any scaffold with a high SAST finding or a
// parse error before it can touch a target. Treat output as a starting skeleton a
// human/agent then fills in — never as finished code.

import { validateGenerationSpec } from "../intake/spec.mjs";

function kebab(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "component";
}

function moduleSource(component, spec) {
  const fn = camel(component.name);
  const reqLines = spec.requirements.map((r) => ` *   - ${r.requiredCheck || r.id}: ${r.label}`).join("\n");
  return `// Component: ${component.name} — ${component.responsibility || "core concern"}.
/* Requirements this surface must satisfy:
${reqLines}
 */
export function ${fn}(input = {}) {
  return { ok: true, component: ${JSON.stringify(component.name)}, input };
}
`;
}

function camel(value) {
  const parts = String(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join("") || "run";
}

export function generate(spec) {
  const validity = validateGenerationSpec(spec);
  if (!validity.valid) throw new Error(`invalid generation spec: ${validity.errors.join("; ")}`);
  const components = spec.components.length ? spec.components : [{ name: "core", responsibility: "core concern" }];
  const files = components.map((component) => ({
    path: `src/${kebab(component.name)}.mjs`,
    content: moduleSource(component, spec)
  }));
  const indexExports = components
    .map((c) => `export { ${camel(c.name)} } from "./${kebab(c.name)}.mjs";`)
    .join("\n");
  files.push({ path: "src/index.mjs", content: `${indexExports}\n` });
  files.push({
    path: "README.md",
    content: `# ${spec.name}\n\n${spec.idea}\n\n## Requirements\n${spec.requirements.map((r) => `- ${r.label}`).join("\n")}\n`
  });
  return { name: spec.name, profileId: spec.profileId, files };
}
