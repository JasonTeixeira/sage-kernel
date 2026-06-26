// Incremental SAST: the same findings as a full scan, but warm runs only
// re-analyze changed files via the content-hash cache. Proves the incremental
// engine produces identical results to a cold scan while doing less work.

import fs from "node:fs";
import path from "node:path";
import { scanSastFile, collectScanFiles } from "../security/sast.mjs";
import { incrementalMap, loadCache, saveCache } from "./cache.mjs";

const NAMESPACE = "sast";

export function scanSastIncremental(options = {}) {
  const root = options.root || process.cwd();
  const files = options.files ? collectScanFiles(root, { files: options.files }) : collectScanFiles(root);
  const items = [];
  for (const rel of files) {
    let content;
    try {
      content = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    items.push({ key: rel, content });
  }
  const cache = options.cache !== undefined ? options.cache : loadCache(root, NAMESPACE);
  const run = incrementalMap(items, { cache, analyze: (item) => scanSastFile(item.key, item.content) });
  if (options.persist !== false && options.cache === undefined) saveCache(root, NAMESPACE, run.cache);
  const findings = run.results.flatMap((r) => r.value);
  const high = findings.filter((f) => f.severity === "high" || f.severity === "critical").length;
  return {
    status: high > 0 ? "failed" : "passed",
    filesScanned: items.length,
    high,
    findings,
    cache: run.cache,
    perf: { hits: run.hits, misses: run.misses, total: run.total, hitRate: run.hitRate, missRate: run.missRate }
  };
}
