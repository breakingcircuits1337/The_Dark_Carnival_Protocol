# CLAUDE.md — The Dark Carnival Protocol

AI assistant guide for the **The Dark Carnival Protocol** codebase. Read this before making any changes.

---

## Project Overview

A distributed, Hub-and-Spoke autonomous AI agent swarm designed for bare-metal and Proxmox LXC containerized environments. A central **Ringmaster** hub routes objectives to specialized edge nodes (**Wagons**), each of which runs a multi-agent adversarial debate pipeline (Visionary → Critic → Tactician) before executing tasks in parallel.

**Authors:** Antigravity & B.E.C.A
**Tech Stack:** Node.js/TypeScript (edge nodes) + Python/FastAPI (hub) + Redis (STM) + Socket.IO (real-time UI)

---

## Repository Structure

```
The_Dark_Carnival_Protocol/
├── Ringmaster/                  # Central Hub — Python/FastAPI server
│   ├── main.py                  # All API routes + WebSocket + stale-node pruner
│   ├── public/
│   │   ├── index.html           # Hub GUI (holographic cyberpunk dashboard)
│   │   └── app.js               # All frontend JS — Socket.IO client logic
│   └── requirements.txt         # fastapi, uvicorn, httpx, pydantic, websockets
│
├── Self-R/                      # Edge Node runtime — Node.js/TypeScript
│   ├── src/
│   │   ├── index.ts             # CLI entry point (Commander.js)
│   │   ├── orchestrator/
│   │   │   ├── RoundTable.ts    # 3-phase adversarial debate engine
│   │   │   ├── SwarmBuilder.ts  # Parallel task execution + code generation
│   │   │   └── HiveMind.ts      # Sub-swarm micro-orchestrator (3-tier workers)
│   │   ├── providers/
│   │   │   └── LLMFactory.ts    # LLM provider abstraction (8+ providers)
│   │   ├── server/
│   │   │   └── WebSocketServer.ts  # Express + Socket.IO + all REST endpoints
│   │   ├── services/
│   │   │   └── SelfImprovementEngine.ts  # Automated quality audit + rewrite loop
│   │   ├── memory/
│   │   │   └── MemoryEngine.ts  # Redis-backed short-term memory (STM)
│   │   ├── skills/
│   │   │   └── SkillLoader.ts   # Dynamic skill context injection for LLM prompts
│   │   └── meta/                # Python self-analysis layer (called via subprocess)
│   │       ├── core.py          # Source scanner + static analyzer
│   │       ├── optimizer.py     # LLM-powered code optimizer
│   │       └── validation.py    # 5-gate safety validator for rewrites
│   ├── bin/
│   │   └── replacater.js        # CommonJS entry point for CLI
│   ├── dist/                    # TypeScript compile output (gitignored)
│   ├── completions/             # Generated code artifacts from swarm tasks
│   ├── package.json
│   └── tsconfig.json
│
├── Self-R-UI/                   # Edge Node local web UI (served by Self-R on its port)
│   ├── index.html
│   ├── app.js
│   └── style.css
│
├── docs/                        # Screenshots and design assets
├── launch_ringmaster.sh         # Start the Hub (creates venv, installs deps, runs uvicorn)
├── launch_node.sh               # Start an Edge Node: ./launch_node.sh <PORT> <ROLE>
├── proxmox_swarm_boot.sh        # Proxmox LXC automation (boots CORE, OSINT, MEDIA nodes)
└── README.md
```

---

## Architecture

```
              [ RINGMASTER HUB :8000 ]
               Python / FastAPI / WS
                       |
    ┌──────────────────┼──────────────────┐
    │   API Routes     │   WebSocket /ws  │
    │  /api/nodes/*    │   broadcasts to  │
    │  /api/swarm/*    │   all UI clients │
    │  /api/vault/*    │                  │
    │  /api/self-improve/*               │
    └──────────────────┬──────────────────┘
                       │ HTTP dispatch
    ┌──────────────────┼──────────────────┐
    │          EDGE NODES (Wagons)         │
    │  LXC-CORE   :8080  Node.js/TS       │
    │  LXC-OSINT  :8081  Node.js/TS       │
    │  LXC-MEDIA  :8082  Node.js/TS       │
    └──────────────────────────────────────┘
```

**Ringmaster** is stateless — zero AI logic. It tracks nodes in memory, routes directives, proxies vault operations, and broadcasts real-time events to the GUI via WebSocket.

**Edge Nodes (Wagons)** run the full debate + execution + self-improvement pipeline. They heartbeat to the Ringmaster every 10 seconds. Stale nodes are evicted after 35 seconds of no heartbeat.

---

## Core Workflow: Debate → Execute → Self-Improve

### 1. Adversarial Debate (RoundTable.ts)

Every objective triggers a 3-phase debate before any code is written:

1. **Visionary** — Drafts expansive, unconstrained architecture (default: Kimi)
2. **Critic** — Tears it apart: security flaws, bottlenecks, missing error handling (default: Mistral)
3. **Tactician** — Synthesizes the debate into a strict JSON task list for parallel execution (default: DeepSeek)

The Tactician must output **valid JSON only** — no markdown, no backticks — in this exact schema:
```json
{
  "suggestions": ["Proactive Idea 1"],
  "tasks": [
    {
      "name": "Task Title",
      "provider": "PROVIDER_NAME",
      "instructions": "Detailed prompt",
      "filename": "src/example.ts"
    }
  ]
}
```

Execution is **gated by human approval** — the Hub enters `AWAITING HUMAN` state and shows the `[ 👁 INTERVENE ]` button.

### 2. Parallel Task Execution (SwarmBuilder.ts)

After human approval, tasks run concurrently via `Promise.all`. Each task is dispatched to its assigned LLM provider. Generated code files land in `Self-R/completions/`.

### 3. Self-Improvement Loop (SelfImprovementEngine.ts + meta/)

```
completions/module_1234.ts
        ↓
[Audit via /api/analyze — LLM scores 0-10]
        ↓ score < 7?
[Rewrite proposal via /api/rewrite (Kimi)]
        ↓
[Python safety validation — 5 gates:]
  1. Non-empty content check
  2. Size sanity (reject >80% shrinkage)
  3. Dangerous pattern scan (rm -rf, eval, DROP TABLE, etc.)
  4. Python AST syntax check
  5. TypeScript tsc --noEmit compile check
        ↓ all pass?
[Apply patch → backup original as .bak → update file]
        ↓
[broadcastLog → Meta-Cognition Log in Hub UI]
```

Triggered automatically after successful task batches, or manually via "IMPROVE ALL WAGONS" button.

---

## Development Setup

### Ringmaster (Hub)

```bash
./launch_ringmaster.sh
# Creates Ringmaster/venv/, installs requirements.txt, starts uvicorn on :8000
```

Manual equivalent:
```bash
cd Ringmaster
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Edge Node (Wagon)

```bash
./launch_node.sh <PORT> <ROLE>
# Example:
./launch_node.sh 8080 CORE
./launch_node.sh 8081 OSINT
./launch_node.sh 8082 MEDIA
```

Manual equivalent:
```bash
cd Self-R
npm install
npm run build         # tsc: src/ → dist/
node ./bin/replacater.js serve -p 8080 --role CORE --ringmaster http://192.168.1.116:8000
```

**Development mode** (ts-node, no build step):
```bash
cd Self-R
npm run dev           # ts-node ./bin/replacater.js
```

### Proxmox Automation

```bash
./proxmox_swarm_boot.sh   # Boots 3 LXC containers: CORE, OSINT, MEDIA
```

---

## Environment Variables

Place a `.env` file in `Self-R/` (copy from `.env.example`):

```env
NODE_ID="LXC-DarkCarnival"      # Unique Wagon ID

# Azure AI Foundry (primary)
AZURE_API_KEY="..."
KIMI_ENDPOINT="..."
MISTRAL_ENDPOINT="..."
DEEPSEEK_ENDPOINT="..."
AZURE_GPT4O_ENDPOINT="..."
AZURE_GPT4O_KEY="..."
AZURE_GPT41_ENDPOINT="..."

# Optional providers
ANTHROPIC_API_KEY="..."
GEMINI_API_KEY="..."
OPENAI_API_KEY="..."
GROQ_API_KEY="..."
OLLAMA_HOST="http://localhost:11434"
CLAUDESON_URL="http://..."
```

Providers are **health-checked on boot** — unreachable providers are silently excluded from the available pool. The debate role fallback order is defined in `RoundTable.ts`.

---

## API Reference

### Ringmaster Hub (port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/nodes/register` | Wagon heartbeat + self-registration |
| `POST` | `/api/swarm/dispatch` | Route objective to a Wagon |
| `GET` | `/api/vault` | Aggregate completions from all Wagons |
| `GET` | `/api/vault/{node_id}` | Completions from specific Wagon |
| `DELETE` | `/api/vault/{node_id}/{filename}` | Delete a completion file |
| `POST` | `/api/vault/{node_id}/learn` | LLM ingest on a completion (Redis STM) |
| `POST` | `/api/self-improve/{node_id}` | Trigger self-improvement on one Wagon |
| `POST` | `/api/self-improve/all` | Fan-out self-improvement to all Wagons |
| `WS` | `/ws` | WebSocket for real-time UI updates |

### Edge Node (Wagon, port 8080+)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/completions` | List vault files |
| `GET` | `/api/completions/:filename` | Download a completion |
| `DELETE` | `/api/completions/:filename` | Delete a completion |
| `POST` | `/api/learn` | LLM ingest + Redis STM |
| `POST` | `/api/rewrite` | LLM-powered code rewrite |
| `POST` | `/api/analyze` | LLM code quality audit (score 0-10) |
| `POST` | `/api/self-improve` | Run self-improvement cycle |
| `POST` | `/api/self-rewrite` | Trigger Python meta-layer cycle |
| `POST` | `/api/swarm/execute` | Execute debate + swarm task plan |

---

## LLM Providers

| Provider | Name in Code | Route |
|----------|-------------|-------|
| Kimi | `Kimi` | Azure AI Foundry (Moonshot) |
| Mistral | `Mistral` | Azure AI Foundry / Mistral Cloud |
| DeepSeek | `DeepSeek` | Azure AI Foundry |
| GPT-4o | `GPT` | Azure AI Foundry or OpenAI API |
| Claude | `Claude` | Anthropic API |
| Gemini | `Gemini` | Google AI (gemini-2.0-flash) |
| Groq | `Groq` | Groq Cloud (llama-3.3-70b) |
| Ollama | `Ollama` | Local inference |
| Claudeson | `Claudeson` | Local bridge API on port 8000 |

Provider names in task JSON (`"provider"` field) **must exactly match** one of the names in the "Name in Code" column above. The Tactician prompt dynamically injects the available provider list to enforce this.

All providers implement the `LLMProvider` interface in `LLMFactory.ts`:
```typescript
interface LLMProvider {
    name: string;
    generateResponse(prompt: string, context?: string): Promise<string>;
}
```

---

## Key Conventions

### TypeScript (Self-R)

- **Strict mode enabled** — `tsconfig.json` has `"strict": true`
- **Target:** ES2022, **Module:** CommonJS
- **Source:** `src/` → compiled to `dist/` (gitignored)
- `broadcastLog(channel, message)` from `WebSocketServer.ts` is the standard way to send real-time events to the UI — use it for any operation the operator should see
- The `completions/` directory is where all swarm-generated code artifacts are written
- Backup files use `.bak` extension (gitignored)

### Python (Ringmaster + meta/)

- **Ringmaster:** Single-file FastAPI app (`main.py`). Keep all routes in this file.
- **Critical:** `app.mount("/", StaticFiles(...))` **must remain last** in `main.py`. Mounting static files before routes causes StaticFiles to intercept WebSocket upgrades and API requests.
- **meta/ layer:** Called as subprocess from Node.js for code analysis and validation
- Python venv lives in `Ringmaster/venv/` (gitignored)

### State Management

- **Node state** is in-memory in `active_nodes` dict in `main.py` — **not persisted**. Restarting the Ringmaster clears all node registrations (they re-register within 10 seconds).
- **Redis STM** keys use prefix `stm:` with 1-hour TTL. Redis is **optional** — the system degrades gracefully if unavailable.
- Node status lifecycle: `IDLE` → `DRAFTING` → `AWAITING HUMAN` → `IDLE` (or `ERROR`)

### Safety Validation (validation.py)

All LLM-generated code rewrites must pass **all 5 gates** before being applied:
1. Non-empty content
2. Size sanity (rejects if new version is >80% smaller than original)
3. Dangerous pattern scan (`rm -rf`, `eval(`, `DROP TABLE`, `subprocess.call`, `os.system`, `exec(`, `__import__`)
4. Python AST parse check (for `.py` files)
5. TypeScript `tsc --noEmit` compile check (for `.ts` files)

Do not weaken or remove these gates.

### WebSocket Broadcasting

The Ringmaster broadcasts two event types to UI clients:
- `{ "type": "node_update", "nodes": [...] }` — full node list refresh
- `{ "type": "terminal_log", "node_id": "...", "log": "..." }` — log line for the Faygo Shower feed

---

## Testing

There are **no automated test suites** (no Jest, Mocha, or Pytest). Validation is handled at runtime via the 5-gate safety validator in `meta/validation.py`.

Manual testing approach:
1. Boot Ringmaster: `./launch_ringmaster.sh`
2. Boot at least one Wagon: `./launch_node.sh 8080 CORE`
3. Open hub UI at `http://192.168.1.116:8000`
4. Issue an objective via "The Neural Carnival" panel
5. Approve the generated plan via the `[ 👁 INTERVENE ]` button
6. Observe outputs in `Self-R/completions/`

TypeScript changes should be validated with:
```bash
cd Self-R && npm run build
```

---

## CI/CD

No CI/CD pipelines. Deployment is entirely manual via the bash scripts. There is no `.github/workflows/` directory.

---

## What to Avoid

- **Do not add AI logic to the Ringmaster.** It is intentionally a dumb router. All intelligence lives in the edge nodes.
- **Do not mount static files before API routes in `main.py`.** This is a known footgun — StaticFiles will intercept everything.
- **Do not remove or weaken the 5-gate safety validator** in `meta/validation.py`. These gates prevent unsafe code from being applied to the codebase.
- **Do not persist node state to disk** in the Ringmaster. Stateless design is intentional — nodes re-register automatically.
- **Do not change provider names** in `LLMFactory.ts` without updating all downstream references in `RoundTable.ts` and the Tactician prompt's provider list injection.
- **Do not commit `.env` files** or API keys. The `.gitignore` covers `*.env` but double-check before committing.
- **Do not commit `Self-R/dist/`** — it is gitignored and rebuilt from source.
