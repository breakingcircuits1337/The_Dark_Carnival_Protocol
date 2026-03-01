import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as path from 'path';
import * as fs from 'fs';
import { networkInterfaces } from 'os';
import chalk from 'chalk';
import { initializeOrchestrator, RoundTableOverrides } from '../orchestrator/RoundTable';
import { LLMFactory } from '../providers/LLMFactory';
import { memoryEngine } from '../memory/MemoryEngine';
import { SwarmBuilder, SwarmTask } from '../orchestrator/SwarmBuilder';
import { SelfImprovementEngine } from '../services/SelfImprovementEngine';

let ioInstance: Server | null = null;
let currentPendingPlan: { tasks: SwarmTask[], objective: string, overrides: RoundTableOverrides } | null = null;

function getLocalIp(): string {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal && name !== 'docker0') {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

function registerWithRingmaster(port: number, role: string, ringmasterUrl: string) {
    const ip = getLocalIp();
    const nodeId = process.env.NODE_ID || `LXC-${port}-${role}`;
    const payload = JSON.stringify({ id: nodeId, ip: ip, port: port, role: role });

    console.log(chalk.cyan(`[Daemon] Registering with Ringmaster at ${ringmasterUrl}...`));

    setInterval(async () => {
        try {
            await fetch(`${ringmasterUrl}/api/nodes/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });
        } catch (e) {
            // Silently fail if Ringmaster is offline
        }
    }, 10000); // Heartbeat every 10 seconds

    // Initial ping
    setTimeout(async () => {
        try {
            await fetch(`${ringmasterUrl}/api/nodes/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });
            console.log(chalk.green(`[Daemon] Dispatched initial registration to Ringmaster.`));
        } catch (e) { }
    }, 2000);
}

export function startUIServer(port: number = 8080, role: string = 'CORE', ringmasterUrl: string = 'http://192.168.1.124:8000') {
    const app = express();
    const server = createServer(app);
    const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [`http://localhost:${port}`];
    const io = new Server(server, { cors: { origin: allowedOrigins } });

    ioInstance = io;

    // Auto-Register this Node with the Global Ringmaster Hub
    if (ringmasterUrl) {
        registerWithRingmaster(port, role, ringmasterUrl);
    }

    // Serve the Self-R-UI folder
    const uiPath = path.join(process.cwd(), '../Self-R-UI');
    app.use(express.static(uiPath));
    app.use(express.json()); // enable json body parsing

    // File Management Endpoints for Proxmox UI
    const completionsDir = path.join(process.cwd(), 'completions');

    app.get('/api/completions', (req, res) => {
        try {
            if (!fs.existsSync(completionsDir)) fs.mkdirSync(completionsDir, { recursive: true });
            const files = fs.readdirSync(completionsDir);
            res.json({ files });
        } catch (e: any) { res.status(500).json({ error: e.toString() }); }
    });

    app.get('/api/completions/:filename', (req, res) => {
        try {
            const safe = path.resolve(completionsDir, path.basename(req.params.filename));
            if (!safe.startsWith(path.resolve(completionsDir) + path.sep)) {
                return res.status(400).json({ error: 'Invalid filename' });
            }
            if (fs.existsSync(safe)) res.sendFile(safe);
            else res.status(404).send('Not found');
        } catch (e: any) { res.status(500).json({ error: e.toString() }); }
    });

    app.delete('/api/completions/:filename', (req, res) => {
        try {
            const safe = path.resolve(completionsDir, path.basename(req.params.filename));
            if (!safe.startsWith(path.resolve(completionsDir) + path.sep)) {
                return res.status(400).json({ error: 'Invalid filename' });
            }
            if (fs.existsSync(safe)) fs.unlinkSync(safe);
            res.json({ success: true });
        } catch (e: any) { res.status(500).json({ error: e.toString() }); }
    });

    // Learning / Contemplation Engine
    app.post('/api/learn', async (req, res) => {
        try {
            const { filename, contents } = req.body;
            const analysis = await memoryEngine.absorbCompletion(filename, contents);
            res.json({ analysis });
        } catch (e: any) { res.status(500).json({ error: e.toString() }); }
    });

    // Meta Layer Bridge: LLM-powered code rewrite (called by src/meta/optimizer.py)
    app.post('/api/rewrite', async (req, res) => {
        try {
            const { filename, content, issue, provider = 'Kimi' } = req.body;
            if (!filename || !content || !issue) {
                return res.status(400).json({ error: 'filename, content, and issue are required.' });
            }
            const llm = LLMFactory.getProvider(provider);
            const prompt = `You are a code refactoring expert. The following TypeScript/Python file has a known issue:

ISSUE: ${issue}

FILE: ${filename}
CURRENT CONTENT:
${content}

Provide the complete corrected file, fixing ONLY the described issue. Output ONLY the raw code with no markdown fences.`;
            const proposed_content = await llm.generateResponse(prompt, 'You are an expert code refactoring bot. Output only raw code.');
            broadcastLog('MetaLayer', `Rewrite proposal generated for ${filename} via ${provider}.`);
            res.json({ proposed_content });
        } catch (e: any) { res.status(500).json({ error: e.toString() }); }
    });

    // Meta Layer Bridge: LLM-powered code quality audit
    app.post('/api/analyze', async (req, res) => {
        try {
            const { filename, content, mode = 'quality_audit' } = req.body;
            if (!filename || !content) {
                return res.status(400).json({ error: 'filename and content are required.' });
            }
            const llm = LLMFactory.getProvider('Kimi'); // Use best reasoner for analysis
            const prompt = `Perform a ${mode} on the following source file.

FILE: ${filename}
CONTENT:
${content}

Return a JSON object with these keys: { "score": 0-10, "issues": ["..."], "suggestions": ["..."] }.
Output strictly JSON, no markdown.`;
            const raw = await llm.generateResponse(prompt, 'You are a senior code quality auditor. Output strict JSON only.');
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 0, issues: ['Parse failed'], suggestions: [] };
            res.json(result);
        } catch (e: any) { res.status(500).json({ error: e.toString() }); }
    });

    // Self-Rewrite trigger: initiates a Phase 3 self-analysis cycle
    app.post('/api/self-rewrite', async (req, res) => {
        try {
            const { objective = 'Improve code quality and correctness' } = req.body;
            broadcastLog('MetaLayer', `Self-rewrite cycle triggered: ${objective}`);
            // Trigger the Python meta layer via child process
            const { execFile } = await import('child_process');
            const { promisify } = await import('util');
            const execFileAsync = promisify(execFile);
            const metaScript = path.join(process.cwd(), 'src/meta/core.py');
            const { stdout, stderr } = await execFileAsync(
                'python3',
                [metaScript, '--root', process.cwd(), '--json', '--objective', objective],
                { timeout: 120000 }
            ).catch((e: any) => ({ stdout: '', stderr: e.message }));
            if (stderr && !stdout) return res.status(500).json({ error: stderr });
            const report = JSON.parse(stdout);
            broadcastLog('MetaLayer', `Self-analysis complete: ${report.proposals?.length || 0} proposals generated.`);
            res.json(report);
        } catch (e: any) { res.status(500).json({ error: e.toString() }); }
    });
    // External API trigger for Agent-to-Agent Swarm invocation
    app.post('/api/swarm/execute', async (req, res) => {
        try {
            const { objective, visionary = 'Kimi', critic = 'Mistral', tactician = 'DeepSeek', auto_approve = false } = req.body;
            if (!objective) return res.status(400).json({ error: 'Missing objective' });

            broadcastLog('main', `> API Trigger: Received external objective: ${objective}`);
            const overrides: RoundTableOverrides = { visionary, critic, tactician };

            ioInstance?.emit('debate-phase', { phase: 1, agent: visionary, status: 'DRAFTING...' });
            const planResult = await initializeOrchestrator(objective, overrides);

            if (auto_approve) {
                broadcastLog('main', '> Auto-Approve enabled. Deploying Swarm directly...');
                ioInstance?.emit('swarm-starting');
                const builder = new SwarmBuilder(objective);
                await builder.delegateToSwarm(planResult.tasks);
                ioInstance?.emit('swarm-done', { success: true });
                return res.json({ success: true, plan: planResult, status: 'Swarm executed successfully.' });
            } else {
                currentPendingPlan = { tasks: planResult.tasks, objective, overrides };
                ioInstance?.emit('plan-review-needed', planResult);
                return res.json({ success: true, plan: planResult, status: 'Plan generated and awaiting manual UI approval.' });
            }
        } catch (e: any) {
            console.error(chalk.red('[API Trigger] Execution failed: ' + e));
            res.status(500).json({ error: e.toString() });
        }
    });

    // Self-Improvement Cycle — wired to Ringmaster Hub "IMPROVE" button
    app.post('/api/self-improve', async (req, res) => {
        const nodeServerUrl = `http://localhost:${port}`;
        const engine = new SelfImprovementEngine(process.cwd(), nodeServerUrl);

        broadcastLog('SelfImprove', '🔄 Self-improvement cycle triggered via Ringmaster Hub...');
        ioInstance?.emit('self-improve-started');

        // Fire-and-forget: stream progress via broadcastLog
        engine.runCycle().then(report => {
            ioInstance?.emit('self-improve-done', report);
            broadcastLog('SelfImprove', `✅ Cycle complete — ${report.improved} improved, ${report.skipped} skipped, ${report.failed} failed.`);
        }).catch(err => {
            broadcastLog('SelfImprove', `❌ Cycle error: ${err}`);
            ioInstance?.emit('self-improve-done', { error: String(err) });
        });

        res.json({ status: 'running', message: 'Self-improvement cycle started. Watch the Meta-Cognition Log.' });
    });

    io.on('connection', (socket) => {
        console.log(chalk.cyan(`[UI WebSocket] Connected: ${socket.id}`));

        socket.on('trigger-debate', async (data) => {
            console.log(chalk.yellow(`[UI Trigger] Received Objective: ${data.objective}`));
            const overrides: RoundTableOverrides = {
                visionary: data.visionary,
                critic: data.critic,
                tactician: data.tactician,
            };
            try {
                io.emit('debate-phase', { phase: 1, agent: overrides.visionary || 'auto', status: 'DRAFTING...' });
                const planResult = await initializeOrchestrator(data.objective, overrides, data.feedback);
                currentPendingPlan = { tasks: planResult.tasks, objective: data.objective, overrides };
                io.emit('plan-review-needed', planResult);
                broadcastLog('main', '> Proposed Swarm Plan dispatched to UI for Human verification.');
            } catch (err) {
                console.error(chalk.red('[UI Trigger] Debate generation failed: ' + err));
                io.emit('swarm-done', { success: false, error: String(err) });
            }
        });

        socket.on('approve-plan', async (data) => {
            if (!currentPendingPlan) return;
            try {
                broadcastLog('main', '> Swarm Plan APPROVED. Human Commander override confirmed. Deploying... ');
                io.emit('swarm-starting');
                const builder = new SwarmBuilder(currentPendingPlan.objective);
                await builder.delegateToSwarm(data.tasks || currentPendingPlan.tasks);
                io.emit('swarm-done', { success: true });
            } catch (err) {
                console.error(chalk.red('[SwarmBuilder Trigger] Execution failed: ' + err));
                io.emit('swarm-done', { success: false, error: String(err) });
            }
            currentPendingPlan = null;
        });

        socket.on('reject-plan', () => {
            if (!currentPendingPlan) return;
            broadcastLog('main', '> Swarm Plan REJECTED. Human Commander aborted execution.');
            io.emit('swarm-done', { success: false, error: 'Aborted by human commander.' });
            currentPendingPlan = null;
        });

        socket.on('disconnect', () => {
            console.log(chalk.gray(`[UI WebSocket] Disconnected: ${socket.id}`));
        });
    });

    server.listen(port, () => {
        console.log(chalk.green(`\n[UI Server] Running locally on http://localhost:${port}`));
        console.log(chalk.green(`[UI WebSocket] Socket.io enabled\n`));
    });
}

export function broadcastLog(agent: string, message: string) {
    if (ioInstance) {
        ioInstance.emit('swarm-log', { agent, message });
    }
}
