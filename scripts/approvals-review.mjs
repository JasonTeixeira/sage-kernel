#!/usr/bin/env node
// Human approval gate for autonomous improvement patches. The loop never commits;
// you review here and apply only what you approve.
//
//   npm run approvals -- list            # show pending patches
//   npm run approvals -- show <id>       # print a patch
//   npm run approvals -- apply <id>      # git apply the patch to the working tree
//   npm run approvals -- reject <id>     # mark rejected (tree already clean)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const queue = path.join(root, ".sage-kernel/autonomy/pending-approval.jsonl");
const [cmd, id] = process.argv.slice(2);

function entries() {
  try { return fs.readFileSync(queue, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
function rewrite(all) { fs.writeFileSync(queue, all.map((e) => JSON.stringify(e)).join("\n") + (all.length ? "\n" : "")); }

const all = entries();
if (cmd === "list" || !cmd) {
  const pending = all.filter((e) => e.status === "pending_approval");
  if (!pending.length) { console.log("no pending patches."); process.exit(0); }
  for (const e of pending) console.log(`${e.id}  ${e.targetId}  ${e.targetBefore}->${e.targetAfter}  files=${(e.touched || []).join(",")}`);
  process.exit(0);
}
const entry = all.find((e) => e.id === id);
if (!entry) { console.error(`unknown patch id: ${id}`); process.exit(2); }

if (cmd === "show") {
  console.log(fs.readFileSync(entry.patchFile, "utf8"));
} else if (cmd === "apply") {
  const r = spawnSync("git", ["apply", entry.patchFile], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) { console.error(`git apply failed: ${r.stderr}`); process.exit(1); }
  entry.status = "applied"; rewrite(all);
  console.log(`applied ${id} to working tree. Review with 'git diff', then commit.`);
} else if (cmd === "reject") {
  entry.status = "rejected"; rewrite(all);
  console.log(`rejected ${id} (tree was already clean; patch retained at ${entry.patchFile}).`);
} else {
  console.error("usage: approvals list | show <id> | apply <id> | reject <id>");
  process.exit(2);
}
