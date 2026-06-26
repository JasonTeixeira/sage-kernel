// Fresh, GROUND-TRUTH profile/SDLC corpus. Unlike the real-repo matrix (which can
// only report confidence, since the "right" profile is unknown), these repos are
// SYNTHESIZED with a known-correct expected profile by construction — so we can
// measure real DETECTION ACCURACY, not just confidence. A different seed varies the
// surface (dep versions, file/dir names, extra noise) so each round is novel and
// the detector can't overfit to fixed fixtures.
//
// Templates are deliberately UNAMBIGUOUS (clear-cut signals) and each declares the
// set of ACCEPTABLE primary profiles (a repo can legitimately map to >1).

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const ver = (r) => `^${1 + Math.floor(r() * 5)}.${Math.floor(r() * 9)}.${Math.floor(r() * 9)}`;
const noise = (r) => ({ [`README.md`]: `# ${pick(r, ["app", "svc", "tool", "lib"])}\n`, [`.gitignore`]: "node_modules\n" });

// Each template: expected acceptable profiles + a files map (varied by rng).
export const REPO_TEMPLATES = [
  {
    key: "express-api", accept: ["backend-api", "saas-app", "worker-service"],
    files: (r) => ({
      "package.json": JSON.stringify({ name: "api", type: "module", dependencies: { express: ver(r), pg: ver(r) }, scripts: { test: "node --test", start: "node server.mjs" } }),
      "src/routes/users.mjs": "export const list = (req, res) => res.json([]);\n",
      "src/server.mjs": "import express from 'express';\nconst app = express();\napp.listen(3000);\n",
      "test/api.test.mjs": "import test from 'node:test';\ntest('x', () => {});\n", ...noise(r)
    })
  },
  {
    key: "react-library", accept: ["library", "frontend-app", "web-app"],
    files: (r) => ({
      "package.json": JSON.stringify({ name: "lib", version: "1.0.0", main: "dist/index.js", module: "dist/index.mjs", exports: { ".": "./dist/index.mjs" }, peerDependencies: { react: ver(r) }, scripts: { test: "node --test", build: "tsup" } }),
      "src/index.mjs": "export const useThing = () => 42;\n",
      "test/index.test.mjs": "import test from 'node:test';\ntest('x', () => {});\n", ...noise(r)
    })
  },
  {
    key: "cli-tool", accept: ["cli-tool", "library"],
    files: (r) => ({
      "package.json": JSON.stringify({ name: "mycli", type: "module", bin: { mycli: "bin/cli.mjs" }, dependencies: { commander: ver(r) }, scripts: { test: "node --test" } }),
      "bin/cli.mjs": "#!/usr/bin/env node\nimport { program } from 'commander';\nprogram.parse();\n", ...noise(r)
    })
  },
  {
    key: "python-service", accept: ["backend-api", "library", "ml-training", "data-pipeline", "worker-service"],
    files: (r) => ({
      "pyproject.toml": `[project]\nname = "svc"\nversion = "0.1.0"\ndependencies = ["fastapi", "uvicorn"]\n`,
      "app/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      "tests/test_main.py": "def test_x():\n    assert True\n", ...noise(r)
    })
  },
  {
    key: "go-service", accept: ["backend-api", "worker-service", "library", "cli-tool"],
    files: (r) => ({
      "go.mod": "module example.com/svc\n\ngo 1.22\n",
      "main.go": "package main\n\nfunc main() {}\n",
      "main_test.go": "package main\n\nimport \"testing\"\n\nfunc TestX(t *testing.T) {}\n", ...noise(r)
    })
  },
  {
    key: "nextjs-app", accept: ["saas-app", "web-app", "frontend-app", "payments-system"],
    files: (r) => ({
      "package.json": JSON.stringify({ name: "web", dependencies: { next: ver(r), react: ver(r), "react-dom": ver(r) }, scripts: { dev: "next dev", build: "next build", test: "node --test" } }),
      "app/page.tsx": "export default function Page() { return null; }\n",
      "app/layout.tsx": "export default function Layout({ children }) { return children; }\n", ...noise(r)
    })
  }
];

// Generate specs for one seed: each template once, surface-varied.
export function generateRepoSpecs(seed = 1) {
  const r = rng(seed);
  return REPO_TEMPLATES.map((tpl, i) => ({ id: `${tpl.key}-${seed}-${i}`, key: tpl.key, accept: tpl.accept, files: tpl.files(r) }));
}

export function templateCount() { return REPO_TEMPLATES.length; }
