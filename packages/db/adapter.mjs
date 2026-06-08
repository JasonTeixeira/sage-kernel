import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function detectDbProvider(env = process.env) {
  const url = env.DATABASE_URL || "";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres";
  return "sqlite";
}

export function createDbAdapter(options = {}) {
  const provider = options.provider || detectDbProvider(options.env || process.env);
  if (provider === "sqlite") return createSqliteAdapter(options);
  if (provider === "postgres") {
    throw new Error("Postgres runtime adapter is not configured yet; use db:postgres:schema for deployment schema export.");
  }
  throw new Error(`Unknown DB provider: ${provider}`);
}

export function createSqliteAdapter(options = {}) {
  const root = options.root || process.cwd();
  const schemaRoot = options.schemaRoot || root;
  const databasePath = options.databasePath || path.join(root, ".sage-kernel", "kernel.db");

  function run(sql, params = [], mode = null) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const statement = mode ? `${mode}\n${bindSql(sql, params)}` : bindSql(sql, params);
    const result = spawnSync("sqlite3", [databasePath], {
      input: statement,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "sqlite3 failed");
    }
    return result.stdout.trim();
  }

  const adapter = {
    provider: "sqlite",
    path: databasePath,
    init() {
      run(`.read ${path.join(schemaRoot, "packages/db/schema.sql")}`);
      const columns = new Set(adapter.query("PRAGMA table_info(job_queue);").map((column) => column.name));
      const migrations = [
        ["next_run_at", "ALTER TABLE job_queue ADD COLUMN next_run_at TEXT;"],
        ["locked_at", "ALTER TABLE job_queue ADD COLUMN locked_at TEXT;"],
        ["locked_by", "ALTER TABLE job_queue ADD COLUMN locked_by TEXT;"]
      ];
      for (const [column, sql] of migrations) {
        if (!columns.has(column)) run(sql);
      }
    },
    execute(sql, params = []) {
      return run(sql, params);
    },
    query(sql, params = []) {
      const output = run(sql, params, ".mode json");
      return output ? JSON.parse(output) : [];
    },
    scalar(sql, params = []) {
      return run(sql, params);
    }
  };

  return adapter;
}

export function bindSql(sql, params = []) {
  let index = 0;
  return sql.replaceAll("?", () => {
    if (index >= params.length) throw new Error("Missing SQL bind parameter");
    return sqlValue(params[index++]);
  });
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}
