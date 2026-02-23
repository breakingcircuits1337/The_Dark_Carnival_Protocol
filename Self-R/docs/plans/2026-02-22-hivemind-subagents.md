# HiveMind Sub-Agent Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a "HiveMind" decentralized AI agent orchestration framework where individual swarm tasks automatically spin up a localized sub-swarm (Queen-Worker coordination) to plan, code, and review complex file generation recursively.

**Architecture:** We will transition `SwarmBuilder` from a monolithic "one LLM per task" executor into a true "HiveMind" orchestrator. Instead of a single model generating code in one shot, `SwarmBuilder` will instantiate a `HiveMind` sub-orchestrator for file tasks. The `HiveMind` will spin up three specialized worker sub-agents: a Planner (to draft pseudocode), a Coder (to implement), and a Reviewer (to validate/audit). This ensures collective intelligence and robust task execution at the edge.

**Tech Stack:** TypeScript, OpenAI/LLM SDKs, Node.js (within the Self-R Proxmox environment)

---

### Task 1: Create the HiveMind Sub-Orchestrator

**Files:**
- Create: `/home/bc/Desktop/agent_body_parts/Self-R/src/orchestrator/HiveMind.ts`

**Step 1: Write the failing test**
We will skip formal unit tests and write the core runtime implementation directly due to the project's real-time LLM integration nature.

**Step 2: Write minimal implementation**
We will implement the `HiveMind` class that coordinates the Planner -> Coder -> Reviewer workflow.

```typescript
import chalk from 'chalk';
import { LLMFactory } from '../providers/LLMFactory';
import { broadcastLog } from '../server/WebSocketServer';
import { SwarmTask } from './SwarmBuilder';

export class HiveMind {
    static async executeSubSwarm(task: SwarmTask, sysContext: string): Promise<string> {
        // Fallback providers mapping for Queen/Worker tasks
        const available = await LLMFactory.getAvailableProviders();
        const pick = (prefs: string[]) => prefs.find(p => available.includes(p)) || available[0];
        
        const plannerProvider = LLMFactory.getProvider(pick(['Kimi', 'GPT', 'DeepSeek', 'Mistral']));
        const coderProvider = LLMFactory.getProvider(pick(['Claudeson', 'Claude', 'GPT', 'Gemini', 'Mistral']));
        const reviewerProvider = LLMFactory.getProvider(pick(['Mistral', 'Groq', 'GPT', 'Claudeson', 'Kimi']));

        const taskDesc = `Task: ${task.name}\nInstructions: ${task.instructions}\nTarget: ${task.filename}`;
        
        // 1. Planner Worker
        broadcastLog(task.provider, `[HiveMind] Spawning Planner Worker (${plannerProvider.name})...`);
        const planPrompt = `Draft a detailed, step-by-step logic pseudocode for the following task:\n\n${taskDesc}. Focus on pure logic and data structures. Output only the plan.`;
        const plan = await plannerProvider.generateResponse(planPrompt, sysContext);
        
        // 2. Coder Worker
        broadcastLog(task.provider, `[HiveMind] Spawning Coder Worker (${coderProvider.name})...`);
        const codePrompt = `Implement the following task based entirely on this pseudocode plan.\n\nTask:\n${taskDesc}\n\nPlan:\n${plan}\n\nOutput STRICTLY raw code, no markdown fences.`;
        const code = await coderProvider.generateResponse(codePrompt, sysContext);

        // 3. Reviewer Worker
        broadcastLog(task.provider, `[HiveMind] Spawning Reviewer Worker (${reviewerProvider.name})...`);
        const reviewPrompt = `Audit this generated code for the specified task. If the code is correct, return the exact original code. If there are bugs, fix them and return the full corrected code. Output STRICTLY raw code, no markdown fences.\n\nTask:\n${taskDesc}\n\nCode:\n${code}`;
        const finalCode = await reviewerProvider.generateResponse(reviewPrompt, sysContext);

        broadcastLog(task.provider, `[HiveMind] Sub-swarm consensus reached for ${task.name}.`);
        return finalCode;
    }
}
```

### Task 2: Integrate HiveMind into SwarmBuilder

**Files:**
- Modify: `/home/bc/Desktop/agent_body_parts/Self-R/src/orchestrator/SwarmBuilder.ts`

**Step 1: Write the minimal implementation**
We need to replace the single `llm.generateResponse` call inside the File Generation Task logic (`task.filename`) to delegate to the new `HiveMind.executeSubSwarm`.

1. Import `HiveMind`:
```typescript
import { HiveMind } from './HiveMind';
```

2. Inside `delegateToSwarm`, locate the code generation step inside `if (task.filename)`:
Change this:
```typescript
const codePrompt = \`Overall objective: "\${this.objective}"
Task: \${task.name}
Instructions: \${task.instructions}
Output file: \${task.filename || 'output'}

Return STRICTLY the raw code string. No markdown fences, no backticks, no explanation.\`;

const codeResult = await llm.generateResponse(codePrompt, sysContext);
```

To this:
```typescript
// Delegate code generation to the HiveMind Sub-Agent Swarm
broadcastLog(task.provider, \`Deploying HiveMind Sub-Swarm for \${task.filename}\`);
const codeResult = await HiveMind.executeSubSwarm(task, sysContext);
```

### Task 3: Transfer to Proxmox Container and Verify

**Files:**
- Bash Commands on Container 160

**Step 1: Write the minimal implementation**
Write the new files from desktop into the `160` container using SSH `pct exec`. Update the local UI to let it know HiveMind is active.

```bash
cat /home/bc/Desktop/agent_body_parts/Self-R/src/orchestrator/HiveMind.ts | sshpass -p '987654321' ssh root@192.168.1.115 "pct exec 160 -- bash -c 'cat > /root/Self-R/src/orchestrator/HiveMind.ts'"
cat /home/bc/Desktop/agent_body_parts/Self-R/src/orchestrator/SwarmBuilder.ts | sshpass -p '987654321' ssh root@192.168.1.115 "pct exec 160 -- bash -c 'cat > /root/Self-R/src/orchestrator/SwarmBuilder.ts'"
sshpass -p '987654321' ssh root@192.168.1.115 "pct exec 160 -- bash -c 'cd /root/Self-R && npm run build'"
sshpass -p '987654321' ssh root@192.168.1.115 "pct exec 160 -- bash -c 'fuser -k 8080/tcp; nohup node ./bin/replacater.js serve > /tmp/selfr-serve.log 2>&1 &'"
```

**Step 2: Run a Swarm**
In the browser UI, initiate a debate and observe the `[HiveMind]` broadcast logs appearing in the per-agent tmux sub-panes.
