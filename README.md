# 🎪 The Dark Carnival Protocol

![Ringmaster Command Center](../Gemini_Generated_Image_6m9fhm6m9fhm6m9f.png)
*(The Hub-and-Spoke Swarm Dashboard routing a live intelligence payload to the Proxmox Grid)*

**The Dark Carnival Protocol** is a highly scalable, Hub-and-Spoke autonomous agent architecture designed for bare-metal and containerized environments (like Proxmox). 

It separates the concept of a single large "Omni-Agent" into a decentralized Swarm. 

## 🧠 How The Swarm Thinks
Unlike a traditional GPT wrapper that spits out a single zero-shot response, every `Objective` dispatched through this protocol triggers a **Multi-Agent Debate**.

On the Edge Nodes (the Spokes), Three LLM Personas sequentially synthesize the action plan:
1. **The Visionary (`Kimi`/`Azure GPT-4o`)**: Drafts the massive, unconstrained architectural approach to the objective.
2. **The Critic (`Mistral`)**: Rips the Visionary's draft apart, explicitly searching for security flaws, scalability bottlenecks, and architectural risks.
3. **The Tactician (`DeepSeek`)**: Reads the Critic's destruction, synthesizes the survivors, and breaks the final verified plan into heavily-scoped Sub-Tasks.

Once the debate is complete, the Edge Node flashes `AWAITING HUMAN` to the Ringmaster Hub, rendering an `[ 👁 INTERVENE ]` button for the human overlord to Inject, Approve, or Abort.

## 🏗️ Architecture

The Protocol is split into two halves:

### 1. The Ringmaster (The Hub)
A lightweight FastAPI/Python websocket server. It acts as the immutable Source of Truth. It holds zero AI logic. Its only job is to track thousands of nodes, accept user input via the command bar, and accurately Round-Robin route the `Objective` payload to an `IDLE` container.

### 2. Replacater Edge Nodes (The Spokes)
A heavy Node.js/TypeScript runtime. These nodes boot up dynamically across your Proxmox containers. As soon as they boot, they silently execute an IPv4 internal daemon that pings the Ringmaster every 10 seconds: `"Hello, I am node OSINT-8081 at 192.168.1.124"`. 
They house the LLM API Keys, the Tool Execution framework, and the `RoundTable` debate orchestrator.

## 🚀 Quick Start Guide

### Step 1: Boot The Hub
Inside the root directory, simply run the launch script to build the Python Virtual Environment and start the server exactly on port `8000`.
```bash
./launch_ringmaster.sh
```
*Visit `http://localhost:8000` to view the (empty) Matrix Grid.*

### Step 2: Boot The Edge Nodes
On another machine, or inside a Proxmox LXC Container, fire up an Edge node and assign it a specific role (e.g., `CORE`, `MEDIA`, `OSINT`, `DEV`).

```bash
# General Usage
./launch_node.sh <PORT> <ROLE>

# Example: Spawning an Open-Source Intelligence Node
./launch_node.sh 8081 OSINT
```

### Proxmox Automation
If you are deploying this instantly across an army of Proxmox LXC containers, drop the provided helper script into your `/root` directory inside your Golden Image Template.
```bash
./proxmox_swarm_boot.sh
```

## 🔒 Environment Requirements
The Edge Nodes require standard API keys to function. Place an `.env` file inside the `Self-R` directory.
A template is provided at `Self-R/.env.example`.

```env
# Required for the Hub Connection
NODE_ID="LXC-DarkCarnival"

# The LLM Configs for the Three Personas
AZURE_API_KEY="..."
KIMI_ENDPOINT="..."
MISTRAL_ENDPOINT="..."
# ... (See .env.example for full list)
```
