// Cloud deploy adapters (P31) — Vercel / Supabase. Wired but CREDENTIAL-GATED:
// without the required token in the environment they return blocked_not_available
// (an honest not-applicable, never a fake deploy). Real deploys run a CLI when
// credentials are present (opt-in, local-only).

import { spawnSync } from "node:child_process";

export function createVercelProvider(env = process.env) {
  const token = env.VERCEL_TOKEN || env.VERCEL_API_TOKEN;
  return {
    name: "vercel",
    deploy: (version) => {
      if (!token) return { status: "blocked_not_available", reason: "VERCEL_TOKEN not set" };
      const result = spawnSync("vercel", ["deploy", "--yes", "--token", token], { encoding: "utf8" });
      return { version: version?.id, status: result.status === 0 ? "deployed" : "failed", output: (result.stdout || "").slice(0, 500) };
    },
    rollback: () => ({ status: "blocked_not_available", reason: "vercel rollback requires a prior deployment id (opt-in)" })
  };
}

export function createSupabaseProvider(env = process.env) {
  const ref = env.SUPABASE_PROJECT_REF;
  const token = env.SUPABASE_ACCESS_TOKEN;
  return {
    name: "supabase",
    deploy: (version) => {
      if (!ref || !token) return { status: "blocked_not_available", reason: "SUPABASE_PROJECT_REF/ACCESS_TOKEN not set" };
      const result = spawnSync("supabase", ["db", "push"], { encoding: "utf8", env: { ...env } });
      return { version: version?.id, status: result.status === 0 ? "deployed" : "failed", output: (result.stdout || "").slice(0, 500) };
    },
    rollback: () => ({ status: "blocked_not_available", reason: "supabase rollback is a manual migration revert (opt-in)" })
  };
}
