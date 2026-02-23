"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmBuilder = void 0;
const chalk_1 = __importDefault(require("chalk"));
const LLMFactory_1 = require("../providers/LLMFactory");
const SkillLoader_1 = require("../skills/SkillLoader");
const MemoryEngine_1 = require("../memory/MemoryEngine");
const WebSocketServer_1 = require("../server/WebSocketServer");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const HiveMind_1 = require("./HiveMind");
const SelfImprovementEngine_1 = require("../services/SelfImprovementEngine");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class SwarmBuilder {
    objective;
    skillLoader;
    constructor(objective) {
        this.objective = objective;
        this.skillLoader = new SkillLoader_1.SkillLoader();
        console.log(chalk_1.default.magenta(`\nSwarm instantiated for objective: ${objective}`));
    }
    async delegateToSwarm(tasks) {
        if (!tasks || tasks.length === 0) {
            console.log(chalk_1.default.red('No valid swarm tasks generated from the debate. Aborting.'));
            (0, WebSocketServer_1.broadcastLog)('SwarmBuilder', 'No tasks generated — swarm aborted.');
            return;
        }
        console.log(chalk_1.default.blue(`\nLaunching ${tasks.length} parallel modules into the swarm...`));
        (0, WebSocketServer_1.broadcastLog)('SwarmBuilder', `Launching ${tasks.length} parallel swarm tasks...`);
        const results = await Promise.all(tasks.map(async (task) => {
            const target = task.command ? `[EXEC: ${task.command}]` : `[FILE: ${task.filename || '(no file)'}]`;
            console.log(chalk_1.default.yellow(`- [${task.provider}] started: ${task.name} -> ${target}`));
            (0, WebSocketServer_1.broadcastLog)(task.provider, `Started: ${task.name} → ${target}`);
            try {
                // ── Shell Command Task ──────────────────────────────────────────────────
                if (task.command) {
                    const llm = LLMFactory_1.LLMFactory.getProvider(task.provider);
                    let finalCmd = task.command;
                    if (task.command === 'GENERATE' || task.command === 'AUTO') {
                        const cmdPrompt = `Objective: "${this.objective}". Task: ${task.instructions}. Return ONLY the exact safe shell command string to execute. No explanation.`;
                        const generatedCmd = await llm.generateResponse(cmdPrompt, 'You are an expert DevOps terminal bot. Output ONLY the command string.');
                        finalCmd = generatedCmd.replace(/`/g, '').trim();
                        console.log(chalk_1.default.dim(`  [${task.provider}] Generated command: ${finalCmd}`));
                        (0, WebSocketServer_1.broadcastLog)(task.provider, `Generated command: ${finalCmd}`);
                    }
                    // Safety: detect LLM error strings that leaked through
                    if (finalCmd.startsWith('\u001b[31m') || finalCmd.toLowerCase().includes('error')) {
                        throw new Error(`LLM returned an error instead of a command: ${finalCmd.substring(0, 100)}`);
                    }
                    const sessionName = `swarm_${task.provider.toLowerCase()}_${Date.now()}`;
                    const safeCmd = finalCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    const tmuxCmd = `tmux new-session -d -s ${sessionName} "bash -c \\"${safeCmd}\\""`;
                    (0, WebSocketServer_1.broadcastLog)(task.provider, `Deploying tmux session [${sessionName}]`);
                    await execAsync(tmuxCmd);
                    console.log(chalk_1.default.green(`✓ [${task.provider}] Shell task deployed: ${task.name}`));
                    (0, WebSocketServer_1.broadcastLog)(task.provider, `✓ Shell task complete: ${task.name}`);
                    return { task: task.name, success: true, type: 'command' };
                }
                // ── File Generation Task ────────────────────────────────────────────────
                const llm = LLMFactory_1.LLMFactory.getProvider(task.provider);
                let sysContext = 'You are an expert autonomous code generator. Output ONLY raw code, no markdown fences, no backticks, no explanatory text.';
                // Inject specialized skill contexts
                if (task.skills && task.skills.length > 0) {
                    console.log(chalk_1.default.dim(`  Injecting skills for ${task.name}: ${task.skills.join(', ')}`));
                    for (const s of task.skills) {
                        const skillData = this.skillLoader.loadSkillContext(s);
                        if (skillData) {
                            sysContext += `\n\n--- SKILL CONTEXT: ${s} ---\n${skillData}`;
                        }
                    }
                }
                (0, WebSocketServer_1.broadcastLog)(task.provider, `Deploying HiveMind Sub-Swarm for ${task.filename || task.name}...`);
                const codeResult = await HiveMind_1.HiveMind.executeSubSwarm(task, sysContext);
                // Detect LLM error string
                if (codeResult.startsWith('\u001b[31m') || codeResult.toLowerCase().startsWith('[') && codeResult.toLowerCase().includes('error')) {
                    throw new Error(`LLM returned an error instead of code: ${codeResult.substring(0, 150)}`);
                }
                if (task.filename) {
                    // Force output into /completions/ with collision-safe naming
                    const baseName = path.basename(task.filename);
                    const nameWithoutExt = baseName.replace(/\.[^.]+$/, '');
                    const ext = path.extname(baseName);
                    const safeFilename = `${nameWithoutExt}_${Date.now()}${ext}`;
                    const outPath = path.join(process.cwd(), 'completions', safeFilename);
                    fs.mkdirSync(path.dirname(outPath), { recursive: true });
                    // Strip any stubborn markdown fences
                    const cleanCode = codeResult
                        .replace(/^```[\w]*\n?/gim, '')
                        .replace(/```$/gim, '')
                        .trim();
                    fs.writeFileSync(outPath, cleanCode, 'utf8');
                    console.log(chalk_1.default.green(`✓ [${task.provider}] ${task.name} saved → completions/${safeFilename}`));
                    (0, WebSocketServer_1.broadcastLog)(task.provider, `✓ Saved module to VAULT: /completions/${safeFilename}`);
                    // FIXED: Auto-absorb completed module into MemoryEngine's short-term memory
                    try {
                        await MemoryEngine_1.memoryEngine.absorbCompletion(safeFilename, cleanCode);
                        (0, WebSocketServer_1.broadcastLog)('MemoryEngine', `Absorbed ${safeFilename} into short-term memory.`);
                    }
                    catch (memErr) {
                        console.log(chalk_1.default.dim(`  [MemoryEngine] Absorption skipped (Redis unavailable): ${memErr}`));
                    }
                    return { task: task.name, success: true, type: 'file', filename: safeFilename };
                }
                return { task: task.name, success: true, type: 'instructions-only' };
            }
            catch (err) {
                const errMsg = `${err}`;
                console.log(chalk_1.default.red(`✗ [${task.provider}] failed: ${task.name} — ${errMsg}`));
                (0, WebSocketServer_1.broadcastLog)(task.provider, `✗ FAILED: ${task.name} — ${errMsg.substring(0, 200)}`);
                return { task: task.name, success: false, error: errMsg };
            }
        }));
        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(chalk_1.default.bold.green(`\n[Swarm Complete] ${succeeded}/${tasks.length} tasks succeeded. ${failed} failed.`));
        (0, WebSocketServer_1.broadcastLog)('SwarmBuilder', `Swarm complete: ${succeeded}/${tasks.length} succeeded, ${failed} failed.`);
        // ── Auto Self-Improvement ─────────────────────────────────────────────────
        // After tasks complete, automatically run a quality-check-and-improve cycle
        // on all generated completions. Closes the Generate → Improve → Apply loop.
        if (succeeded > 0) {
            (0, WebSocketServer_1.broadcastLog)('SelfImprove', '🔄 Auto-triggering self-improvement cycle on new completions...');
            const engine = new SelfImprovementEngine_1.SelfImprovementEngine(process.cwd());
            engine.runCycle().then(report => {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `✅ Auto-improve done — ${report.improved} improved, ${report.skipped} skipped.`);
            }).catch(err => {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `⚠ Auto-improve skipped: ${err}`);
            });
        }
        return results;
    }
}
exports.SwarmBuilder = SwarmBuilder;
