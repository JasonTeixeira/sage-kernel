import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { dashboardSnapshot, renderDashboardHtml } from "../apps/dashboard/server.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("dashboard snapshot exposes operational command-center panels", () => {
  const snapshot = dashboardSnapshot({ root });

  assert.equal(snapshot.version, "0.3.0");
  assert.equal(Array.isArray(snapshot.approvals.inbox), true);
  assert.equal(Array.isArray(snapshot.jobs.timeline), true);
  assert.equal(Array.isArray(snapshot.repos.health), true);
  assert.equal(Array.isArray(snapshot.templates.readiness), true);
  assert.equal(Array.isArray(snapshot.artifacts.recent), true);
  assert.equal(snapshot.system.health.status, "operational");
  assert.equal(snapshot.system.coverage.line >= 80, true);
});

test("dashboard HTML renders premium operations sections", () => {
  const html = renderDashboardHtml(dashboardSnapshot({ root }));

  for (const label of [
    "Approval Inbox",
    "Job Timeline",
    "Repo Health",
    "Template Readiness",
    "System Health",
    "Artifact Ledger"
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /data-panel="approval-inbox"/);
});

test("dashboard build emits static command center with operational panels", () => {
  const result = spawnSync("node", ["apps/dashboard/scripts/build-dashboard.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const htmlPath = path.join(root, "apps/dashboard/dist/index.html");
  assert.equal(fs.existsSync(htmlPath), true);
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.match(html, /Approval Inbox/);
  assert.match(html, /Job Timeline/);
  assert.match(html, /System Health/);
});
