import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { createQaReport, parseMode, runQaCli, staticChecks } from "../packages/qa/scripts/qa-runner.mjs";
import { createDogfoodReport, inspectRepo, sourceRootForCatalog } from "../scripts/dogfood-production-audit.mjs";
import { createDashboardStressReport, parseDashboardStressArgs } from "../scripts/stress-dashboard.mjs";
import { createQueueStressReport, parseQueueStressArgs } from "../scripts/stress-queue.mjs";
import { createSoakReport, parseSoakArgs, runMcpSmoke } from "../scripts/soak-runner.mjs";
import { createWarehouseSummary } from "../packages/ai-warehouse/scripts/warehouse-summary.mjs";
import { validateIntelligence } from "../packages/intelligence/scripts/validate-intelligence.mjs";
import { validateMarkdownLinks, validatePublicSurface } from "../scripts/validate-public-surface.mjs";
import { validateReleaseProvenance } from "../scripts/validate-release-provenance.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("public surface validator catches package and markdown regressions", () => {
  const passing = validatePublicSurface({ root });
  assert.equal(passing.status, "passed");
  assert.equal(passing.failures.length, 0);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-public-surface-"));
  fs.mkdirSync(path.join(workspace, "docs"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  fs.mkdirSync(path.join(workspace, ".github/ISSUE_TEMPLATE"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "README.md"), "[Broken](docs/missing.md)\n");
  fs.writeFileSync(path.join(workspace, "docs/INSTALL.md"), "# Install\n");
  fs.writeFileSync(path.join(workspace, "docs/USAGE.md"), "# Usage\n");
  fs.writeFileSync(path.join(workspace, "docs/ARCHITECTURE.md"), "# Architecture\n");
  fs.writeFileSync(path.join(workspace, "docs/VISUAL_GUIDE.md"), "![Missing](../assets/missing.svg)\n");
  fs.writeFileSync(path.join(workspace, "docs/MCP_SERVER.md"), "# MCP\n");
  fs.writeFileSync(path.join(workspace, "docs/MCP_CLIENTS.md"), "# Clients\n");
  fs.writeFileSync(path.join(workspace, "docs/SECURITY_MODEL.md"), "# Security\n");
  fs.writeFileSync(path.join(workspace, "docs/RELEASE_PROCESS.md"), "# Release\n");
  fs.writeFileSync(path.join(workspace, "assets/sage-kernel-architecture.svg"), "<svg />\n");
  fs.writeFileSync(path.join(workspace, "assets/sage-kernel-workflow.svg"), "<svg />\n");
  fs.writeFileSync(path.join(workspace, "LICENSE"), "MIT\n");
  fs.writeFileSync(path.join(workspace, "SECURITY.md"), "# Security\n");
  fs.writeFileSync(path.join(workspace, "CONTRIBUTING.md"), "# Contributing\n");
  fs.writeFileSync(path.join(workspace, "CODE_OF_CONDUCT.md"), "# Code\n");
  fs.writeFileSync(path.join(workspace, "CHANGELOG.md"), "# Changelog\n");
  fs.mkdirSync(path.join(workspace, ".github/workflows"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".github/workflows/ci.yml"), "name: CI\n");
  fs.writeFileSync(path.join(workspace, ".github/workflows/release.yml"), "name: Release\n");
  fs.writeFileSync(path.join(workspace, ".github/PULL_REQUEST_TEMPLATE.md"), "- [ ] test\n");
  fs.writeFileSync(path.join(workspace, ".github/ISSUE_TEMPLATE/bug_report.md"), "# Bug\n");
  fs.writeFileSync(path.join(workspace, ".github/ISSUE_TEMPLATE/feature_request.md"), "# Feature\n");
  fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({
    name: "fixture",
    license: "MIT",
    repository: { url: "git+https://example.com/fixture.git" },
    bin: { sage: "bin/sage.mjs" },
    files: ["README.md", "LICENSE"]
  }));

  const failures = validatePublicSurface({ root: workspace }).failures.join("\n");
  assert.match(failures, /package.json files allowlist missing: assets/);
  assert.match(failures, /README.md links to missing file: docs\/missing.md/);
  assert.match(failures, /docs\/VISUAL_GUIDE.md links to missing file/);
  assert.deepEqual(validateMarkdownLinks(workspace, "docs/INSTALL.md"), []);

  fs.writeFileSync(path.join(workspace, "docs/LINKS.md"), [
    "[External](https://example.com)",
    "[Anchor](#local)",
    "[Absolute](/docs/INSTALL.md)",
    "[Outside](../../outside.md)",
    "[Encoded](docs%2Fmissing.md)"
  ].join("\n"));
  const linkFailures = validateMarkdownLinks(workspace, "docs/LINKS.md");
  assert.equal(linkFailures.length, 2);
  assert.match(linkFailures.join("\n"), /links outside workspace/);
  assert.match(linkFailures.join("\n"), /links to missing file: docs%2Fmissing.md/);

  fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({
    license: "Apache-2.0",
    repository: {},
    bin: {},
    files: "not-an-array",
    private: true
  }));
  const metadataFailures = validatePublicSurface({ root: workspace }).failures.join("\n");
  assert.match(metadataFailures, /must not set private/);
  assert.match(metadataFailures, /license must be MIT/);
  assert.match(metadataFailures, /repository.url is required/);
  assert.match(metadataFailures, /must expose the sage binary/);
  assert.match(metadataFailures, /files allowlist is required/);

  fs.writeFileSync(path.join(workspace, "package.json"), "{");
  assert.match(validatePublicSurface({ root: workspace }).failures.join("\n"), /Invalid package.json/);
});
