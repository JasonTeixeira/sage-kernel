import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModuleGraph as buildGraph, dependentsOf } from "../packages/testing/module-graph.mjs";
import { buildModuleGraph as buildDeadGraph, findOrphanFiles, defaultEntrypoints } from "../packages/refactor/dead-code.mjs";

// A mini TS monorepo: alias import + an app-router route file. Mirrors the giggl
// shape so alias resolution + framework entrypoints are regression-proof in CI.
function tsMonorepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-p15-"));
  fs.mkdirSync(path.join(root, "packages"), { recursive: true });
  fs.mkdirSync(path.join(root, "apps/web/app"), { recursive: true });
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { baseUrl: ".", paths: { "@app/*": ["packages/*"] } }
  }));
  fs.writeFileSync(path.join(root, "packages/util.ts"), "export const u: number = 1;\n");
  fs.writeFileSync(path.join(root, "apps/web/app/page.tsx"), "import { u } from '@app/util';\nexport default function Page() { return u; }\n");
  return root;
}

test("module graph resolves a tsconfig alias import to the real file", () => {
  const root = tsMonorepo();
  const graph = buildGraph(root);
  assert.ok(graph.importsByFile["apps/web/app/page.tsx"].includes("packages/util.ts"), "@app/util should resolve to packages/util.ts");
  assert.equal(dependentsOf(graph, "packages/util.ts").has("apps/web/app/page.tsx"), true);
});

test("dead-code treats app-router routes as entrypoints and resolves aliases (no false orphan)", () => {
  const root = tsMonorepo();
  const graph = buildDeadGraph(root);
  const orphans = findOrphanFiles(graph, defaultEntrypoints(root, graph));
  // page.tsx is a route entrypoint; util.ts is reachable via the @app alias.
  assert.equal(orphans.includes("packages/util.ts"), false, "aliased dependency must not be a false orphan");
  assert.equal(orphans.includes("apps/web/app/page.tsx"), false, "route file is an entrypoint");
});

test("framework/tooling convention files are entrypoints (pages, middleware, config)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-p15b-"));
  fs.mkdirSync(path.join(root, "apps/web/pages"), { recursive: true });
  fs.writeFileSync(path.join(root, "apps/web/pages/about.tsx"), "export default function About() { return 1; }\n");
  fs.writeFileSync(path.join(root, "apps/web/middleware.ts"), "export function middleware() { return 1; }\n");
  fs.writeFileSync(path.join(root, "apps/web/next.config.js"), "export default { reactStrictMode: true };\n");
  fs.writeFileSync(path.join(root, "apps/web/instrumentation.ts"), "export function register() {}\n");
  const graph = buildDeadGraph(root);
  const orphans = findOrphanFiles(graph, defaultEntrypoints(root, graph));
  for (const file of ["apps/web/pages/about.tsx", "apps/web/middleware.ts", "apps/web/next.config.js", "apps/web/instrumentation.ts"]) {
    assert.equal(orphans.includes(file), false, `${file} should be a convention entrypoint`);
  }
});
