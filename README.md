<div align="center">

# Sage Kernel

### A proof-first, MCP-native engineering operating system for your local machine

**One controlled surface where you — and your AI coding agent — inspect any repo, run the full SDLC, and ship with evidence instead of vibes.**

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-3c873a.svg?style=flat-square)](package.json)
[![Protocol](https://img.shields.io/badge/protocol-MCP%20·%20stdio-6366f1.svg?style=flat-square)](docs/MCP_SERVER.md)
[![MCP tools](https://img.shields.io/badge/MCP%20tools-140-0ea5e9.svg?style=flat-square)](docs/mcp-tools.md)
[![Release gates](https://img.shields.io/badge/release%20gates-78%20green-16a34a.svg?style=flat-square)](docs/RELEASE_PROCESS.md)
[![Runtime deps](https://img.shields.io/badge/runtime%20deps-5-64748b.svg?style=flat-square)](package.json)

[Quick start](#-60-second-quick-start) · [How it works](#-how-it-works) · [Capabilities](#-what-it-does) · [Architecture](#-architecture) · [Language support](#-language-support-honest) · [Docs](#-documentation-map)

</div>

---

> [!NOTE]
> **Honest scope, up front.** The *deep* analysis engines (AST code review, SAST + taint, executed coverage) are **JavaScript / TypeScript / Node-native**. Other languages get profile detection + repository meta-checks with the correct toolchain commands inferred. Sage Kernel is an **MCP stdio server** — it works inside any MCP-capable client (Claude Code, Claude Desktop, Cursor, Windsurf, Cline, Codex). It is *not* usable from a non-MCP chatbot. See the [capability matrix](#-language-support-honest).

---

## ✦ Why Sage Kernel

Modern software work is scattered across a dozen surfaces — terminal commands, agent prompts, QA scripts, templates, security scans, release checks, approval decisions, run history, and docs. Sage Kernel collapses them into **one auditable local control plane** that a human *and* an AI agent can drive through the same protocol.

Its defining principle is **proof-first**: nothing is "done" because a model said so. Every result is backed by a real artifact in a tamper-evident ledger, or it is reported honestly as blocked. No fake green.

```
  Ask the kernel  ─►  it runs real gates  ─►  it records proof  ─►  you (or your agent) trust the result
```

---

## ⚡ 60-second quick start

```bash
git clone https://github.com/JasonTeixeira/sage-kernel.git
cd sage-kernel
npm install                 # Node >= 22, zero heavy deps
npm run mcp:smoke           # real client handshake — prints "passed, 140 tools"

# Point it at ANY of your repos and get a real SDLC assessment (read-only):
npm run onboard -- /path/to/your/project
```

You'll get a one-screen report: detected profile, loop score, review score, security status, required checks, and the top gaps — computed from **your** repo's actual contents. Your code is never modified.

<details>
<summary><strong>Wire it into your AI client (permanent)</strong></summary>

```jsonc
{
  "mcpServers": {
    "sage-kernel": {
      "command": "node",
      "args": ["apps/mcp-server/src/server.mjs"],
      "cwd": "/absolute/path/to/sage-kernel",
      "env": { "SAGE_PROFILE_ALLOWED_ROOTS": "/Users/you/code:/Users/you/work" }
    }
  }
}
```

- `cwd` **must** be the kernel checkout (it resolves its own DB relative to `cwd`).
- `SAGE_PROFILE_ALLOWED_ROOTS` lists the parent dirs the kernel may analyze.
- Full walkthrough: **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**.

</details>

---

## ✦ How it works

Sage Kernel runs the same disciplined loop on every task — the order of operations a senior engineer follows, made mechanical and provable.

```mermaid
flowchart LR
    A["① ORIENT<br/>profile.gaps"] --> B["② DEFINE DONE<br/>done.generate"]
    B --> C["③ LOOP<br/>operate / gates"]
    C --> D{"④ PROVE<br/>enforce.proof_gate"}
    D -- "no fresh proof" --> C
    D -- "diff-matched passing proof" --> E["⑤ SCORE<br/>loop.score"]
    E --> F(("Result<br/>backed by ledger"))
    style A fill:#0ea5e9,color:#fff,stroke:#0369a1
    style C fill:#6366f1,color:#fff,stroke:#4338ca
    style D fill:#f59e0b,color:#111,stroke:#b45309
    style E fill:#16a34a,color:#fff,stroke:#15803d
    style F fill:#111827,color:#fff,stroke:#000
```

The guarantee is **integrity, not a number**: a claim of "done / verified / passing" is only valid when a fresh, diff-matched, passing proof exists in the hash-chained ledger. Otherwise the kernel says `blocked_*` with a next step. A claim-firewall scans the final answer and rejects unproven success language.

---

## ✦ What it does

```mermaid
flowchart TB
    subgraph CLIENT["Your MCP client"]
      H["👤 Human"]
      AI["🤖 AI coding agent"]
    end
    CLIENT -->|"stdio · JSON-RPC"| SRV

    subgraph SRV["Sage Kernel — MCP server (140 tools)"]
      direction TB
      P["Profile & SDLC<br/>profile · done · loop · score"]
      R["Review & Security<br/>AST review · SAST · taint · supply-chain"]
      T["Testing<br/>impact map · coverage · mutation · stress"]
      O["Operate & Autonomy<br/>operate loop · self-heal · drive-goal"]
      G["Generate<br/>templates · scaffolds · blueprints"]
      J["Ops<br/>jobs · approvals · dashboard · audit log"]
    end

    SRV --> ENG[["Engines<br/>acorn AST · dataflow · profiles"]]
    SRV --> LEDGER[["Proof ledger<br/>hash-chained · HMAC-signed"]]
    SRV --> DB[("SQLite default<br/>Postgres optional")]

    style CLIENT fill:#1e293b,color:#fff,stroke:#0f172a
    style SRV fill:#312e81,color:#fff,stroke:#1e1b4b
    style LEDGER fill:#7c2d12,color:#fff,stroke:#431407
    style ENG fill:#155e75,color:#fff,stroke:#083344
    style DB fill:#374151,color:#fff,stroke:#111827
```

| Capability | What you get |
| --- | --- |
| **Inspect any repo** | Detect the project profile, compute a definition-of-done, score health, and surface real gaps — read-only. |
| **Review & harden** | AST-based code review across 5 dimensions; SAST + intra-procedural taint analysis (command injection, eval, path traversal, weak crypto, prototype pollution, SSRF…). |
| **Test deeply** | Impact-mapped test selection, execution-grounded coverage, mutation testing, and stress/chaos matrices. |
| **Operate autonomously** | A self-healing loop that drives a real model to fix failures, *prove-or-discard*, and re-verify — with typed stop conditions. |
| **Generate** | Production app templates and scaffolds from a machine-readable catalog. |
| **Govern** | Signed approvals, permission boundaries, a tamper-evident audit log, and a local ops dashboard. |

---

## ✦ Architecture

```mermaid
flowchart TD
    subgraph APPS["apps/"]
      MCP["mcp-server<br/>stdio · 140 tools · contracts"]
      DASH["dashboard<br/>local ops cockpit"]
      WRK["worker<br/>jobs · queue · runs"]
    end
    subgraph PKGS["packages/"]
      CORE["core<br/>runtime · policy · error envelope"]
      AST["ast<br/>acorn parse + walk"]
      REV["review · security<br/>SAST · taint · supply-chain"]
      TEST["testing<br/>impact · coverage · mutation"]
      PROF["profiles<br/>detection · toolchain"]
      COMP["companion<br/>operate · decompose · drive-goal"]
      PROOF["proof<br/>ledger · graph · claim-firewall"]
      DBP["db<br/>sqlite · postgres adapters"]
    end
    CAT["catalog/<br/>repos · templates · phases"]

    MCP --> CORE --> AST
    CORE --> REV & TEST & PROF & COMP
    REV & TEST & PROF & COMP --> PROOF
    CORE --> DBP
    MCP --> CAT
    DASH --> CORE
    WRK --> CORE

    style APPS fill:#1e3a8a,color:#fff,stroke:#1e1b4b
    style PKGS fill:#0f766e,color:#fff,stroke:#134e4a
    style PROOF fill:#7c2d12,color:#fff,stroke:#431407
```

| Layer | Path | Responsibility |
| --- | --- | --- |
| MCP server | `apps/mcp-server/` | stdio server, 140-tool manifest, resources, prompts, contracts, smoke tests |
| Runtime | `packages/core/` | tool dispatch, policy/approval checks, uniform `{ok,data}`/`{ok,error}` envelope |
| Analysis engines | `packages/{ast,review,security,testing,profiles}/` | acorn AST, SAST + taint, coverage, profile detection |
| Companion loop | `packages/companion/` | operate loop, goal decomposition, autonomous driver, capability registry |
| Proof spine | `packages/proof/` | hash-chained + HMAC-signed ledger, proof graph, claim-firewall |
| Persistence | `packages/db/` | SQLite (default) and Postgres adapters, migrate/backup/restore |
| Catalog | `catalog/` | machine-readable registry of repos, templates, integrations, phases |

Full detail: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** · **[docs/RUNTIME_ENGINE.md](docs/RUNTIME_ENGINE.md)**

---

## ✦ A real interaction

```mermaid
sequenceDiagram
    participant U as You / AI agent
    participant K as Sage Kernel
    participant L as Proof ledger
    U->>K: kernel.profile.gaps { projectPath }
    K-->>U: { ok, profile, confidence, gaps[] }
    U->>K: kernel.operate.run { goal, acceptanceCriteria, files }
    K->>K: run gates concurrently · diagnose · repair · re-verify
    K->>L: record a proof per gate (diff-hashed)
    K-->>U: { ok, status, score, evidenceIds[] }
    U->>K: kernel.enforce.proof_gate
    K->>L: is the current diff backed by a passing proof?
    K-->>U: { allowed: true, proofId }  ← only then is it "done"
```

Every tool returns a uniform envelope — success is `{ ok: true, data }`, failure is `{ ok: false, error: { code, kind, message } }`. The server never crashes on a bad call; it returns a typed error.

---

## ✦ Language support (honest)

Sage Kernel detects and scores **any** project, but analysis depth is JS/TS-native. This matrix sets expectations precisely:

| Capability | JS / TS / Node | Python | Go · Rust · Java · Ruby · PHP · Swift |
| --- | :---: | :---: | :---: |
| Profile detection + definition-of-done | ✅ deep | ✅ | ✅ |
| Loop score · gaps · required checks | ✅ | ✅ meta | ✅ meta |
| AST code review (`review.quality_score`) | ✅ structural | ⚠️ heuristic | ⚠️ meta |
| SAST + taint (`security.proof`) | ✅ AST dataflow | ⚠️ regex rules | ❌ meta only |
| Executed coverage / test run | ✅ `node --test` | ➖ inferred | ➖ inferred |
| Toolchain commands | `npm` | `pytest` | `go test` · `cargo` · `mvn` … |

**Trust the full SDLC depth on Node/TS repos. Treat non-Node output as profile + meta guidance** (the kernel labels it honestly via a `toolchainNote`).

---

## ✦ Quality, proven

Sage Kernel holds itself to the bar it enforces on others. The proof is reproducible:

```bash
npm test                 # full unit suite
npm run release:check    # 78 hard gates, must exit 0
npm run mcp:smoke        # real MCP client handshake
npm run security:scan    # secret scan
npm run publish:ready    # OSS publish-readiness gate
```

- **140 MCP tools**, every one covered by a source-extracted conformance test.
- **78 release gates** run on every change (lint, types, contracts, security, coverage, stress, drift, docs).
- **Execution-grounded coverage** — "tested" means *executed*, not import-reachable.
- **Tamper-evident proof ledger** — hash-chained, HMAC-signable, fail-closed verification.
- **Adversarially measured security** — held-out + freshly-generated corpora, not a tuned 1.0.

Details: **[docs/QUALITY_RATCHET.md](docs/QUALITY_RATCHET.md)** · **[docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md)**

---

## ✦ Daily commands

```bash
sage daily                         # health, tools, jobs, approvals, next actions
sage audit .                       # repo audit workflow
npm run onboard -- <repo>          # one-shot SDLC report for any project
npm run engineer:measure           # proof-backed capability scorecard
npm run stress:verify -- --passes 5  # stability / flake detection
sage mcp config cursor --json      # generate client config
```

Full reference: **[docs/USAGE.md](docs/USAGE.md)**

---

## ✦ Documentation map

| Start here | Reference | Operate |
| --- | --- | --- |
| [Getting Started](docs/GETTING_STARTED.md) | [Architecture](docs/ARCHITECTURE.md) | [Usage Guide](docs/USAGE.md) |
| [Install](docs/INSTALL.md) | [MCP Server](docs/MCP_SERVER.md) · [Clients](docs/MCP_CLIENTS.md) | [Security Model](docs/SECURITY_MODEL.md) |
| [Using the Kernel](docs/USING_SAGE_KERNEL.md) | [MCP Tools](docs/mcp-tools.md) · [Resources](docs/mcp-resources.md) · [Prompts](docs/mcp-prompts.md) | [Persistence](docs/PERSISTENCE.md) |
| [Engineering Loop](docs/ENGINEERING_LOOP.md) | [Runtime Engine](docs/RUNTIME_ENGINE.md) | [Release Process](docs/RELEASE_PROCESS.md) |

Also: [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Security Policy](SECURITY.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Changelog](CHANGELOG.md)

---

## ✦ Development

```bash
npm install
npm run catalog:validate
npm run mcp:contracts      # regenerate tool contracts from the manifest
npm run release:check      # the full gate suite
```

Optional Postgres path:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres
SAGE_RUN_POSTGRES_TESTS=1 DATABASE_URL=postgresql://sage:sage@127.0.0.1:55432/sage_kernel npm run postgres:integration
```

---

## ✦ Status & philosophy

Sage Kernel is **production-grade for local, MCP-native engineering workflows** on JS/TS/Node projects, and a genuinely useful profile/meta layer for everything else. It is local-first by default; treat public network exposure as a separate hardening project.

It is built on one non-negotiable doctrine: **nothing stated, everything proven.** No fake green, no scaffolding, no scores that aren't earned.

<div align="center">

**[Get started →](docs/GETTING_STARTED.md)**  ·  Licensed under [MIT](LICENSE)

</div>
