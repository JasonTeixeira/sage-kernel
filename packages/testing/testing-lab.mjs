import { detectProjectProfile, generateDefinitionOfDone } from "../profiles/project-detector.mjs";

const PROFILE_LAYERS = {
  "web-app": ["unit", "integration", "browser-e2e", "accessibility", "visual-state", "security", "performance"],
  "mobile-app": ["unit", "component", "device-smoke", "permissions", "offline-state", "performance"],
  "backend-api": ["unit", "integration", "contract", "database", "security", "load"],
  "mcp-server": ["manifest", "contract", "smoke", "permissions", "approval-boundary", "client-config"],
  "cli-tool": ["unit", "command-matrix", "error-paths", "package-install"],
  library: ["unit", "api-contract", "types", "docs"],
  "ai-agent-app": ["tool-boundaries", "evals", "memory-policy", "redaction", "regression"],
  infrastructure: ["plan", "policy", "drift", "rollback"],
  monorepo: ["workspace-install", "affected-tests", "package-boundaries", "ci-matrix"],
  "data-pipeline": ["fixtures", "schema", "idempotency", "backfill", "observability"]
};

const PERFORMANCE_BUDGETS = {
  "web-app": { http: { p95Ms: 500, maxFailureRate: 0 }, memory: { maxHeapGrowthMb: 128 }, throughput: { minRps: 20 } },
  "backend-api": { http: { p95Ms: 300, maxFailureRate: 0 }, memory: { maxHeapGrowthMb: 128 }, throughput: { minRps: 100 } },
  "mcp-server": { mcp: { smokeP95Ms: 1000 }, memory: { maxHeapGrowthMb: 96 }, throughput: { minToolCallsPerSecond: 10 } },
  default: { http: { p95Ms: 750, maxFailureRate: 0 }, memory: { maxHeapGrowthMb: 128 }, throughput: { minRps: 10 } }
};

export function generateTestStrategy(options = {}) {
  const root = options.root || process.cwd();
  const detected = detectProjectProfile({ root, projectPath: options.projectPath || "." });
  const done = generateDefinitionOfDone({
    projectPath: options.projectPath || ".",
    risk: options.risk || "medium",
    objective: options.objective || "Create profile-aware test strategy."
  }, { root });
  const layerIds = PROFILE_LAYERS[detected.profile.id] || PROFILE_LAYERS.library;
  const layers = layerIds.map((id) => testLayer(id, detected.profile.id));
  const missing = layers.filter((layer) => !hasEvidenceForLayer(layer, detected));
  return {
    status: "passed",
    project: detected.project,
    profile: detected.profile.id,
    risk: done.risk,
    layers,
    missingLayers: missing.map((layer) => layer.id),
    requiredCommands: [...new Set([...detected.profile.commands, ...done.recommendedCommands, ...commandsForLayers(layers)])],
    evidenceRequired: [...new Set([...detected.profile.evidence, ...done.evidenceRequired, "performance budget", "soak report"])],
    definitionOfDone: done
  };
}

export function createPlaywrightTemplate(options = {}) {
  const root = options.root || process.cwd();
  const detected = detectProjectProfile({ root, projectPath: options.projectPath || "." });
  const webLike = detected.profile.id === "web-app" || detected.frameworks.some((framework) => ["nextjs", "react", "vite"].includes(framework));
  const files = {
    "playwright.config.ts": playwrightConfig(),
    "tests/e2e/smoke.spec.ts": smokeSpec(webLike),
    "tests/e2e/page-objects/AppPage.ts": pageObject()
  };
  return {
    status: "passed",
    project: detected.project,
    profile: detected.profile.id,
    files,
    instructions: [
      "Install @playwright/test when the target project does not already include it.",
      "Run npx playwright install before browser E2E in a clean environment.",
      "Keep selectors stable and assert visible states instead of waiting on timeouts."
    ]
  };
}

export function createPerformanceBudget(options = {}) {
  const root = options.root || process.cwd();
  const detected = options.profile
    ? { profile: { id: options.profile }, project: null }
    : detectProjectProfile({ root, projectPath: options.projectPath || "." });
  const budgets = PERFORMANCE_BUDGETS[detected.profile.id] || PERFORMANCE_BUDGETS.default;
  return {
    status: "passed",
    profile: detected.profile.id,
    budgets,
    stressProfiles: [
      { id: "queue-10k", command: "npm run stress:queue -- --count=10000", count: 10000 },
      { id: "queue-100k", command: "npm run stress:queue -- --count=100000", count: 100000 },
      { id: "dashboard-1k", command: "npm run stress:dashboard -- --count=1000 --concurrency=50", count: 1000, concurrency: 50 },
      { id: "release-soak", command: "npm run soak:run -- --profile=extended", profile: "extended" }
    ],
    releaseEvidence: ["latency summary", "throughput summary", "failure count", "memory delta", "soak cycles"]
  };
}

export function createTestingLabProof(options = {}) {
  const strategy = generateTestStrategy(options);
  const playwright = createPlaywrightTemplate(options);
  const performance = createPerformanceBudget(options);
  return {
    status: [strategy, playwright, performance].every((item) => item.status === "passed") ? "passed" : "needs_work",
    strategy,
    playwright,
    performance,
    longSoak: {
      profile: "release",
      command: "npm run soak:run -- --profile=extended",
      queueCount: 100000,
      dashboardCount: 1000,
      memoryGrowthReport: true
    }
  };
}

export function formatTestingLabOutput(value, options = {}) {
  if (options.json) return `${JSON.stringify(value, null, 2)}\n`;
  if (value.strategy && value.performance) return `Testing lab ${value.status}: ${value.strategy.profile} with ${value.strategy.layers.length} layer(s)\n`;
  if (value.files) return `Playwright template ${value.status}: ${Object.keys(value.files).length} file(s)\n`;
  if (value.budgets) return `Performance budget ${value.status}: ${value.profile}\n`;
  if (value.layers) return `Test strategy ${value.status}: ${value.profile}\n`;
  return `${JSON.stringify(value, null, 2)}\n`;
}

function testLayer(id, profile) {
  return {
    id,
    profile,
    required: !["visual-state", "offline-state"].includes(id),
    proof: proofForLayer(id)
  };
}

function proofForLayer(id) {
  return {
    "browser-e2e": "Playwright route/form/mobile viewport proof",
    accessibility: "Automated accessibility smoke plus keyboard path",
    performance: "Stress report with latency, throughput, failures, and memory delta",
    "memory-policy": "Approved memory writes and drift audit",
    evals: "Deterministic eval report",
    contract: "Machine-readable contract tests"
  }[id] || `${id} automated proof`;
}

function hasEvidenceForLayer(layer, detected) {
  if (layer.id.includes("e2e")) return detected.scripts.some((script) => script.includes("e2e"));
  if (layer.id === "unit") return detected.tests.length > 0 || detected.scripts.includes("test");
  if (layer.id === "security") return detected.scripts.some((script) => script.includes("security"));
  return true;
}

function commandsForLayers(layers) {
  const commands = [];
  if (layers.some((layer) => layer.id.includes("e2e"))) commands.push("npm run dashboard:e2e");
  if (layers.some((layer) => layer.id === "performance" || layer.id === "load")) commands.push("npm run soak:quick");
  if (layers.some((layer) => layer.id === "security")) commands.push("npm run security:scan");
  return commands;
}

function playwrightConfig() {
  return `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['json', { outputFile: 'playwright-results.json' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } }
  ]
});
`;
}

function smokeSpec(webLike) {
  const expectation = webLike ? "await expect(page).toHaveURL(/./);" : "await expect(page.locator('body')).toBeVisible();";
  return `import { test, expect } from '@playwright/test';
import { AppPage } from './page-objects/AppPage';

test('desktop smoke renders primary route', async ({ page }) => {
  const app = new AppPage(page);
  await app.goto('/');
  ${expectation}
});

test('mobile smoke renders without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = new AppPage(page);
  await app.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
`;
}

function pageObject() {
  return `import { Page, expect } from '@playwright/test';

export class AppPage {
  constructor(readonly page: Page) {}

  async goto(path = '/') {
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.locator('body')).toBeVisible();
  }
}
`;
}
