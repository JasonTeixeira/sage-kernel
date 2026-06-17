import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);

export function detectDbProvider(env = process.env) {
  if (env.SAGE_DB_PROVIDER === "sqlite" || env.SAGE_DB_PROVIDER === "postgres") return env.SAGE_DB_PROVIDER;
  const url = env.DATABASE_URL || "";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres";
  return "sqlite";
}

export function createDbAdapter(options = {}) {
  const provider = options.provider || detectDbProvider(options.env || process.env);
  if (provider === "sqlite") return createSqliteAdapter(options);
  if (provider === "postgres") return createPostgresAdapter(options);
  throw new Error(`Unknown DB provider: ${provider}`);
}

export function createPostgresAdapter(options = {}) {
  const root = options.root || process.cwd();
  const schemaRoot = options.schemaRoot || root;
  const env = options.env || process.env;
  const ClientClass = options.ClientClass || pg.Client;
  const connectionString = options.connectionString || env.DATABASE_URL;
  if (!connectionString) throw new Error("Postgres adapter requires DATABASE_URL");

  let client = null;
  async function getClient() {
    if (client) return client;
    client = new ClientClass({ connectionString });
    await client.connect();
    return client;
  }

  return {
    provider: "postgres",
    async init() {
      const active = await getClient();
      const schema = fs.readFileSync(path.join(schemaRoot, "packages/db/postgres.schema.sql"), "utf8");
      await active.query(schema);
    },
    async execute(sql, params = []) {
      const active = await getClient();
      await active.query(sql, params);
      return "";
    },
    async executeBatch(statements = []) {
      const active = await getClient();
      await active.query("BEGIN");
      try {
        for (const statement of statements) {
          if (typeof statement === "string") {
            await active.query(statement);
          } else {
            await active.query(statement.sql, statement.params || []);
          }
        }
        await active.query("COMMIT");
      } catch (error) {
        await active.query("ROLLBACK");
        throw error;
      }
      return "";
    },
    async query(sql, params = []) {
      const active = await getClient();
      const result = await active.query(sql, params);
      return result.rows || [];
    },
    async scalar(sql, params = []) {
      const rows = await this.query(sql, params);
      const first = rows[0] || {};
      const [value] = Object.values(first);
      return value ?? "";
    },
    async close() {
      if (!client) return;
      await client.end();
      client = null;
    }
  };
}

export function createSqliteAdapter(options = {}) {
  const env = options.env || process.env;
  if (options.driver === "persistent" || env.SAGE_SQLITE_DRIVER === "persistent") {
    return createPersistentSqliteAdapter(options);
  }
  if (options.driver !== "cli" && env.SAGE_SQLITE_DRIVER !== "cli") {
    const adapter = createPersistentSqliteAdapter(options, { optional: true });
    if (adapter) return adapter;
  }
  return createCliSqliteAdapter(options);
}

export function createCliSqliteAdapter(options = {}) {
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
    driver: "cli",
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
      const approvalColumns = new Set(adapter.query("PRAGMA table_info(approvals);").map((column) => column.name));
      const approvalMigrations = [
        ["signature", "ALTER TABLE approvals ADD COLUMN signature TEXT;"],
        ["decided_by", "ALTER TABLE approvals ADD COLUMN decided_by TEXT;"]
      ];
      for (const [column, sql] of approvalMigrations) {
        if (!approvalColumns.has(column)) run(sql);
      }
    },
    execute(sql, params = []) {
      return run(sql, params);
    },
    executeBatch(statements = []) {
      const sql = statements
        .map((statement) => {
          const bound = typeof statement === "string" ? statement : bindSql(statement.sql, statement.params || []);
          return bound.trim().endsWith(";") ? bound.trim() : `${bound.trim()};`;
        })
        .join("\n");
      return run(`.bail on\nBEGIN IMMEDIATE;\n${sql}\nCOMMIT;`);
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

export function createPersistentSqliteAdapter(options = {}, meta = {}) {
  const sqlite = loadNodeSqlite(meta.optional);
  if (!sqlite) return null;

  const root = options.root || process.cwd();
  const schemaRoot = options.schemaRoot || root;
  const databasePath = options.databasePath || path.join(root, ".sage-kernel", "kernel.db");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new sqlite.DatabaseSync(databasePath);

  function normalizeRows(rows) {
    return rows.map((row) => Object.fromEntries(Object.entries(row)));
  }

  function executeSql(sql, params = []) {
    const trimmed = String(sql).trim();
    if (trimmed.startsWith(".read ")) {
      const file = trimmed.slice(".read ".length).trim();
      const fullPath = path.isAbsolute(file) ? file : path.join(schemaRoot, file);
      db.exec(fs.readFileSync(fullPath, "utf8"));
      return "";
    }
    if (params.length === 0) {
      db.exec(sql);
      return "";
    }
    db.prepare(sql).run(...params);
    return "";
  }

  const adapter = {
    provider: "sqlite",
    driver: "persistent",
    path: databasePath,
    init() {
      executeSql(`.read ${path.join(schemaRoot, "packages/db/schema.sql")}`);
      const columns = new Set(adapter.query("PRAGMA table_info(job_queue);").map((column) => column.name));
      const migrations = [
        ["next_run_at", "ALTER TABLE job_queue ADD COLUMN next_run_at TEXT;"],
        ["locked_at", "ALTER TABLE job_queue ADD COLUMN locked_at TEXT;"],
        ["locked_by", "ALTER TABLE job_queue ADD COLUMN locked_by TEXT;"]
      ];
      for (const [column, sql] of migrations) {
        if (!columns.has(column)) executeSql(sql);
      }
      const approvalColumns = new Set(adapter.query("PRAGMA table_info(approvals);").map((column) => column.name));
      const approvalMigrations = [
        ["signature", "ALTER TABLE approvals ADD COLUMN signature TEXT;"],
        ["decided_by", "ALTER TABLE approvals ADD COLUMN decided_by TEXT;"]
      ];
      for (const [column, sql] of approvalMigrations) {
        if (!approvalColumns.has(column)) executeSql(sql);
      }
    },
    execute(sql, params = []) {
      return executeSql(sql, params);
    },
    executeBatch(statements = []) {
      db.exec("BEGIN IMMEDIATE;");
      try {
        for (const statement of statements) {
          if (typeof statement === "string") executeSql(statement);
          else executeSql(statement.sql, statement.params || []);
        }
        db.exec("COMMIT;");
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
      return "";
    },
    query(sql, params = []) {
      return normalizeRows(db.prepare(sql).all(...params));
    },
    scalar(sql, params = []) {
      const row = db.prepare(sql).get(...params) || {};
      const [value] = Object.values(row);
      return value ?? "";
    },
    close() {
      db.close();
    }
  };

  return adapter;
}

function loadNodeSqlite(optional = false) {
  try {
    return require("node:sqlite");
  } catch (error) {
    if (optional) return null;
    throw new Error(`Persistent SQLite driver requires Node's node:sqlite module: ${error.message}`);
  }
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
