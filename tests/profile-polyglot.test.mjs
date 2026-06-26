import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectProjectProfile } from "../packages/profiles/project-detector.mjs";

function mkRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-poly-"));
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(dir, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

// Before hardening, non-JS repos were penalized for lacking package.json and
// flagged low-confidence (<70). They now earn confidence from their own
// ecosystem's manifest + tests + language, which is what they actually are.
const POLYGLOT = {
  python: { "pyproject.toml": "[project]\nname='x'\n", "src/app.py": "def f():\n  return 1\n", "tests/test_app.py": "def test_f():\n  assert True\n", "README.md": "# x\n" },
  go: { "go.mod": "module x\n", "main.go": "package main\n", "main_test.go": "package main\n", "README.md": "# x\n" },
  terraform: { "main.tf": "resource \"aws_s3_bucket\" \"b\" {}\n", "variables.tf": "variable \"r\" {}\n", "README.md": "# infra\n" },
  java: { "pom.xml": "<project></project>\n", "src/main/java/A.java": "class A {}\n", "src/test/java/ATest.java": "class ATest {}\n", "README.md": "# j\n" }
};

for (const [lang, files] of Object.entries(POLYGLOT)) {
  test(`${lang} repo is detected with confidence >= 70 (no JS-manifest penalty)`, () => {
    const dir = mkRepo(files);
    try {
      const r = detectProjectProfile({ root: dir, projectPath: "." });
      assert.ok(r.confidence >= 70, `${lang} confidence ${r.confidence} still low`);
      assert.ok(r.languages.includes(lang === "java" ? "java" : lang), `language not detected: ${r.languages.join(",")}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

test("a genuinely thin repo (no manifest, no tests) stays honestly low-confidence", () => {
  const dir = mkRepo({ "deploy.sh": "echo hi\n" });
  try {
    const r = detectProjectProfile({ root: dir, projectPath: "." });
    assert.ok(r.confidence < 70, `thin repo should not be inflated, got ${r.confidence}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
