import { runTemplatesE2E } from "./templates-e2e.mjs";

export function runTemplatesBenchmark() {
  const proof = runTemplatesE2E();
  return {
    status: proof.status,
    generatedAt: new Date().toISOString(),
    summary: proof.summary,
    templates: proof.templates.map((item) => ({
      template: item.template,
      status: item.status,
      durationMs: item.durationMs,
      scaffoldStatus: item.steps.scaffold.status,
      installStatus: item.steps.install.status,
      qaStatus: item.steps.qa.status,
      missing: item.missing
    }))
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const report = runTemplatesBenchmark();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
