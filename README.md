# 🎪 The Dark Carnival Protocol

> *"Every Clown Has A Purpose. Every Node Has A Role."*

**The Dark Carnival Protocol** is a highly scalable, Hub-and-Spoke autonomous AI agent swarm designed for bare-metal and containerized environments (Proxmox). It replaces a single monolithic AI agent with a decentralized, adversarial debate swarm — routing objectives to specialized edge nodes across your entire infrastructure grid.

---

## 🃏 V1 Showcase — The Ringmaster Hub

![Ringmaster Hub V1](docs/ringmaster_hub_v1.png)
*The live command center: 3 Wagons online, Neural Carnival debate agents loaded, and the Faygo Shower global log running in real-time.*

---

## ✨ Hub Features (Ringmaster UI)

| Feature | Description |
|---|---|
| **Holographic Joker's Cards** | 4 animated 3D hologram avatars — Cyber Joker, Ringmaster, Wraith, Milenko |
| **CCTV Wagon Wall** | Live grid of all Wagons with real-time status. Click any card to open that node's UI |
| **The Neural Carnival** | Select LLM model per debate role (Visionary/Critic/Tactician) and fire a coordinated swarm |
| **Swarm Commerce** | Live task list of active global swarm execution progress |
| **Dark Carnival Comm-Link** | Central tmux-style command terminal with `INITIATE GLOBAL EVENT` |
| **Completions & Cognition Vault** | Browse, analyze, and delete completed swarm payloads from all Wagons |
| **🔄 IMPROVE ALL WAGONS** | One-click global self-improvement cycle across the entire swarm |
| **Meta-Cognition Log** | Live stream of per-file quality scores, rewrite results, and improvement events |
| **The Faygo Shower** | Real-time global log feed scrolling all broadcast events from all nodes |
| **Ambient Static Audio** | Web Audio API powered dark carnival atmosphere (activates on first click) |
| **`[ 👁 INTERVENE ]`** | Human-in-the-loop override button when a Wagon reaches `AWAITING HUMAN` |

---

## 🧠 How The Swarm Thinks

Unlike a standard GPT wrapper, every `Objective` triggers a **Multi-Agent Adversarial Debate** on the target Edge Node:

1. **The Visionary** — Drafts the expansive, unconstrained architecture. Default: `Kimi`
2. **The Critic** — Tears it apart: security flaws, bottlenecks, missing error handling. Default: `Mistral`
3. **The Tactician** — Synthesizes debate wreckage into a strict JSON task list for parallel execution. Default: `DeepSeek`

The result is a structured swarm plan. Execution is **gated by a human** — the Hub flashes `AWAITING HUMAN` and the **`[ 👁 INTERVENE ]`** button appears for Approve / Inject Feedback / Abort.

---

## ♻️ Recursive Self-Improvement System

After every swarm task batch completes, the system **automatically improves its own outputs**:

```
[Swarm Generates /completions/module_1234.ts]
            ↓
[SelfImprovementEngine: Quality Audit via /api/analyze]
  Score 0-10 per file (LLM-powered)
            ↓ score < 7?
[LLM Rewrite Proposal via /api/rewrite (Kimi)]
            ↓
[Python Safety Validation — 5 gates:]
  1. Non-empty check
  2. Size sanity (reject >80% shrinkage)
  3. Dangerous pattern scan (rm -rf, eval, DROP TABLE, etc.)
  4. Python AST syntax check
  5. TypeScript tsc --noEmit compile check
            ↓ all pass?
[Apply patch → backup original → update file]
            ↓
[broadcastLog → Meta-Cognition Log in Hub UI]
```

**Two trigger modes:**
- **Auto** — fires after every successful swarm task completion
- **Manual** — `🔄 IMPROVE ALL WAGONS` button in the Hub fans out to all Wagons concurrently

---

## 🏗️ Architecture

```
                    [ RINGMASTER HUB :8000 ]
                     Python / FastAPI / WS
                             |
          ┌──────────────────┼──────────────────┐
          │   API Routes     │   WebSocket /ws  │
          │                  │   broadcasts to  │
          │  /api/nodes/*    │   all UI clients │
          │  /api/swarm/*    │                  │
          │  /api/vault/*    │                  │
          │  /api/self-improve/*               │
          └──────────────────┬──────────────────┘
                             │ HTTP dispatch
          ┌──────────────────┼──────────────────┐
          │          EDGE NODES (Wagons)         │
          │  LXC-CORE   :8080  Node.js/TS       │
          │  LXC-OSINT  :8081  Node.js/TS       │
          │  LXC-MEDIA  :8082  Node.js/TS       │
          │                                      │
          │  Each Wagon runs:                    │
          │  • RoundTable.ts (debate engine)     │
          │  • SwarmBuilder.ts (code gen)        │
          │  • SelfImprovementEngine.ts          │
          │  • MemoryEngine.ts (Redis STM)       │
          │  • Python meta/ layer (analyze/fix)  │
          └──────────────────────────────────────┘
```

### The Ringmaster (Hub)
Lightweight FastAPI + WebSocket server. Zero AI logic. Tracks nodes, routes directives, proxies vault, and broadcasts real-time state to the GUI. Runs a **stale node pruner** — dead nodes evicted after 35s of no heartbeat (checked every 15s).

### Edge Nodes (Wagons / Spokes)
Node.js/TypeScript deployed in Proxmox LXC containers. Auto-register to the Ringmaster on boot every 10 seconds (heartbeat). Run the full **Visionary → Critic → Tactician → self-improve** pipeline.

---

## 🤖 Supported LLM Providers

| Provider | Route |
|---|---|
| **Kimi** | Azure AI Foundry (Moonshot) |
| **Mistral** | Azure AI Foundry / Mistral Cloud API |
| **DeepSeek** | Azure AI Foundry |
| **GPT-4o / GPT-4.1** | Azure AI Foundry or OpenAI API |
| **Claude** | Anthropic API |
| **Gemini** | Google AI (gemini-2.0-flash) |
| **Groq** | Groq Cloud (llama-3.3-70b) |
| **Ollama** | Local inference (any model) |
| **Claudeson** | Local bridge API (custom) |

Providers are **health-checked on boot** and auto-excluded if unreachable. The debate role fallback order is configurable per seat.

---

## 🔌 Ringmaster API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/nodes/register` | Node heartbeat + self-registration |
| `POST` | `/api/swarm/dispatch` | Route objective to a Wagon node |
| `GET` | `/api/vault` | Aggregate completions from all Wagons |
| `GET` | `/api/vault/{node_id}` | Completions from specific Wagon |
| `DELETE` | `/api/vault/{node_id}/{filename}` | Delete a completion from a Wagon |
| `POST` | `/api/vault/{node_id}/learn` | Run LLM ingest on a completion (Redis STM) |
| `POST` | `/api/self-improve/{node_id}` | Trigger self-improvement on one Wagon |
| `POST` | `/api/self-improve/all` | Fan-out self-improvement to ALL Wagons |
| `WS` | `/ws` | WebSocket for real-time UI updates |

### Edge Node API (Self-R)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/completions` | List vault files |
| `GET` | `/api/completions/:filename` | Download a completion file |
| `DELETE` | `/api/completions/:filename` | Delete a completion |
| `POST` | `/api/learn` | LLM ingest + Redis short-term memory |
| `POST` | `/api/rewrite` | LLM-powered code rewrite (meta layer) |
| `POST` | `/api/analyze` | LLM code quality audit (score 0-10) |
| `POST` | `/api/self-improve` | Run self-improvement cycle on this Wagon |
| `POST` | `/api/self-rewrite` | Trigger Phase 3 Python meta-layer cycle |
| `POST` | `/api/swarm/execute` | Execute a debate + swarm task plan |

---

## 🚀 Quick Start

### Boot The Hub
```bash
./launch_ringmaster.sh
```
*Visit `http://192.168.1.116:8000` to open the Ringmaster Command Center.*

### Boot An Edge Node (Local)
```bash
# Usage: ./launch_node.sh <PORT> <ROLE>
./launch_node.sh 8081 OSINT
```

### Proxmox Swarm Automation
```bash
./proxmox_swarm_boot.sh
```
*Deploy into your Proxmox Golden Image Template — all clones auto-register to the Hub on boot.*

---

## 🔒 Environment Variables

Place a `.env` file in the `Self-R/` directory:

```env
NODE_ID="LXC-DarkCarnival"      # Unique Wagon ID (auto-set by Proxmox template)

# Azure AI Foundry (primary LLM provider)
AZURE_API_KEY="..."
KIMI_ENDPOINT="..."             # Moonshot/Kimi K2 endpoint
MISTRAL_ENDPOINT="..."          # Mistral Large endpoint
DEEPSEEK_ENDPOINT="..."         # DeepSeek endpoint
AZURE_GPT4O_ENDPOINT="..."      # GPT-4o endpoint
AZURE_GPT4O_KEY="..."           # GPT-4o resource key
AZURE_GPT41_ENDPOINT="..."      # GPT-4.1 endpoint

# Optional providers
ANTHROPIC_API_KEY="..."         # Claude
GEMINI_API_KEY="..."            # Gemini
OPENAI_API_KEY="..."            # OpenAI direct
GROQ_API_KEY="..."              # Groq
OLLAMA_HOST="http://localhost:11434"  # Local Ollama
CLAUDESON_URL="http://..."      # Local Claudeson bridge
```

---

## 🗂️ Project Structure

```
The_Dark_Carnival_Protocol/
├── Ringmaster/                 # Hub server
│   ├── main.py                 # FastAPI app, all API + WS routes
│   ├── public/
│   │   ├── index.html          # Hub GUI
│   │   └── app.js              # All frontend JS logic
│   └── requirements.txt
├── Self-R/                     # Edge Node runtime
│   └── src/
│       ├── orchestrator/
│       │   ├── RoundTable.ts   # Adversarial debate engine
│       │   ├── SwarmBuilder.ts # Code generation + task execution
│       │   └── HiveMind.ts     # Sub-swarm coordination
│       ├── services/
│       │   └── SelfImprovementEngine.ts  # Auto self-improvement loop
│       ├── server/
│       │   └── WebSocketServer.ts         # Express + Socket.io server
│       ├── providers/
│       │   └── LLMFactory.ts   # All LLM provider implementations
│       ├── memory/
│       │   └── MemoryEngine.ts # Redis short-term memory
│       ├── meta/               # Python self-analysis layer
│       │   ├── core.py         # Source scanner + static analyzer
│       │   ├── optimizer.py    # LLM-powered code optimizer
│       │   └── validation.py   # 5-gate safety validator
│       └── skills/
│           └── SkillLoader.ts  # Skill context injector
├── Self-R-UI/                  # Edge Node local UI (served by Self-R)
├── docs/                       # Screenshots and documentation assets
├── launch_ringmaster.sh        # Start the Hub
├── launch_node.sh              # Start an Edge Node
└── proxmox_swarm_boot.sh       # Proxmox automation bootstrap
```

---

*Built with FastAPI · Node.js · TypeScript · WebSockets · Socket.io · Web Audio API · Redis · Proxmox LXC · Azure AI Foundry*
