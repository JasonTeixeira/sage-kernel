import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};

const template = arg("template");
const target = arg("target") || "docker-compose";
const rawName = arg("name") || `${template || "app"}-infra`;
const out = arg("out") || "generated/infra";
if (!template) {
  console.error("Usage: npm run infra:emit -- --template <template> --target <docker-compose|github-actions|vercel|supabase|neon|aws-terraform> [--name app] [--out generated/infra]");
  process.exit(1);
}

const root = process.cwd();
const name = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const dir = path.resolve(root, out, `${name}-${target}`);
if (fs.existsSync(dir)) throw new Error(`Refusing to overwrite existing infra output: ${dir}`);
fs.mkdirSync(dir, { recursive: true });

const planResult = spawnSync("node", ["packages/infra/scripts/infra-plan.mjs", "--template", template, "--target", targetMap(target)], { cwd: root, encoding: "utf8" });
const plan = planResult.status === 0 ? JSON.parse(planResult.stdout) : { template, target };
writeJson("sage-infra-plan.json", plan);

switch (target) {
  case "docker-compose":
    emitDockerCompose();
    break;
  case "github-actions":
    emitGithubActions();
    break;
  case "vercel":
    emitVercel();
    break;
  case "supabase":
    emitSupabase();
    break;
  case "neon":
    emitNeon();
    break;
  case "aws-terraform":
    emitAwsTerraform();
    break;
  default:
    throw new Error(`Unknown infra emit target: ${target}`);
}

console.log(dir);

function targetMap(value) {
  if (value === "docker-compose") return "docker";
  if (value === "aws-terraform") return "aws-starter";
  if (value === "neon") return "docker";
  return value;
}

function write(rel, content) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(rel, value) {
  write(rel, `${JSON.stringify(value, null, 2)}\n`);
}

function emitDockerCompose() {
  write("docker-compose.yml", `services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
volumes:
  postgres-data:
`);
  write(".env.example", "APP_ENV=local\nAPP_URL=http://localhost:3000\nDATABASE_URL=postgres://postgres:postgres@localhost:5432/app\nREDIS_URL=redis://localhost:6379\n");
}

function emitGithubActions() {
  write(".github/workflows/ci.yml", fs.readFileSync(path.join(root, "packages/infra/templates/github-actions/quality-gate.yml"), "utf8"));
}

function emitVercel() {
  write("vercel.json", JSON.stringify({ framework: "nextjs", buildCommand: "npm run build", devCommand: "npm run dev" }, null, 2) + "\n");
  write("README.md", "Import this project into Vercel. Set environment variables from `.env.example`. Production domain and secret changes require approval.\n");
}

function emitSupabase() {
  write("supabase/config.toml", "project_id = \"local\"\n\n[api]\nenabled = true\n\n[db]\nmajor_version = 16\n");
  write("supabase/migrations/0001_initial.sql", "create table if not exists app_health (id text primary key, created_at timestamptz default now());\n");
  write("README.md", "Run `supabase start` locally. Production migrations require approval and backup confirmation.\n");
}

function emitNeon() {
  write("README.md", "Create a Neon branch per environment. Store `DATABASE_URL` in the environment provider. Never commit connection strings.\n");
  write(".env.example", "DATABASE_URL=\n");
}

function emitAwsTerraform() {
  write("main.tf", `terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "artifacts" {
  bucket_prefix = "${name}-artifacts-"
}
`);
  write("variables.tf", "variable \"aws_region\" { type = string default = \"us-east-1\" }\n");
  write("README.md", "Plan first with `terraform plan`. `terraform apply` requires explicit approval.\n");
}
