import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTsconfigAliases, resolveAlias } from "../packages/ast/tsconfig-resolve.mjs";

function fixture(tsconfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sage-tsc-"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), tsconfig);
  return root;
}

test("reads baseUrl + paths from JSONC tsconfig (comments + trailing commas)", () => {
  const root = fixture(`{
    // project config
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@giggl/types": ["packages/types/src/index.ts"],
        "@giggl/ui/*": ["packages/ui/src/*"],
      },
    },
  }`);
  const cfg = readTsconfigAliases(root);
  assert.equal(cfg.aliases.length, 2);
  assert.ok(cfg.aliases.some((a) => a.pattern === "@giggl/types"));
});

test("resolves exact and wildcard aliases to real files", () => {
  // Real projects declare both the exact and the wildcard pattern (giggl does).
  const cfg = {
    baseUrl: ".",
    aliases: [
      { pattern: "@giggl/ui", targets: ["packages/ui/src/index.ts"] },
      { pattern: "@giggl/ui/*", targets: ["packages/ui/src/*"] },
      { pattern: "@giggl/types", targets: ["packages/types/src/index.ts"] }
    ]
  };
  const files = new Set(["packages/types/src/index.ts", "packages/ui/src/Button.tsx", "packages/ui/src/index.ts"]);
  assert.equal(resolveAlias("@giggl/types", cfg, files), "packages/types/src/index.ts");
  assert.equal(resolveAlias("@giggl/ui/Button", cfg, files), "packages/ui/src/Button.tsx");
  assert.equal(resolveAlias("@giggl/ui", cfg, files), "packages/ui/src/index.ts");
  assert.equal(resolveAlias("react", cfg, files), null); // genuine external
});

test("honors baseUrl and tolerates a missing tsconfig", () => {
  const cfg = { baseUrl: "src", aliases: [{ pattern: "@app/*", targets: ["*"] }] };
  const files = new Set(["src/lib/util.ts"]);
  assert.equal(resolveAlias("@app/lib/util", cfg, files), "src/lib/util.ts");
  const empty = readTsconfigAliases(fs.mkdtempSync(path.join(os.tmpdir(), "sage-noTsc-")));
  assert.deepEqual(empty.aliases, []);
});
