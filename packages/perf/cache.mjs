// Content-hash incremental cache (cat 17: performance/scalability). Analysis
// engines re-run on every loop iteration; most files are unchanged between runs.
// This caches per-file results keyed by a content hash, so a warm run only
// re-analyzes the files whose content actually changed. The cache is persisted
// under .sage-kernel/cache so it survives across processes.
//
// Correctness invariant: a cache hit is only ever returned when the content hash
// is identical, so cached results can never diverge from a fresh analysis of the
// same input. Changing one byte invalidates exactly that file's entry.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function hashContent(source) {
  return crypto.createHash("sha256").update(String(source ?? "")).digest("hex");
}

function cacheFile(root, namespace) {
  const safe = String(namespace).replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path.join(root, ".sage-kernel/cache", `${safe}.json`);
}

export function loadCache(root, namespace) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(root, namespace), "utf8"));
  } catch {
    return {};
  }
}

export function saveCache(root, namespace, cache) {
  const file = cacheFile(root, namespace);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cache)}\n`);
  return file;
}

// Generic incremental map: each item is { key, content }. `analyze(item)` runs on
// a miss; a hit reuses the cached value when the content hash is unchanged.
// Returns the merged results plus hit/miss accounting and the updated cache.
export function incrementalMap(items, options = {}) {
  const prior = options.cache || {};
  const next = {};
  const results = [];
  let hits = 0;
  let misses = 0;
  for (const item of items) {
    const hash = hashContent(item.content);
    const cached = prior[item.key];
    if (cached && cached.hash === hash) {
      hits += 1;
      next[item.key] = cached;
      results.push({ key: item.key, hit: true, value: cached.value });
    } else {
      misses += 1;
      const value = options.analyze(item);
      next[item.key] = { hash, value };
      results.push({ key: item.key, hit: false, value });
    }
  }
  const total = items.length;
  return {
    results,
    cache: next,
    hits,
    misses,
    total,
    hitRate: total ? Number((hits / total).toFixed(4)) : 0,
    missRate: total ? Number((misses / total).toFixed(4)) : 0
  };
}
