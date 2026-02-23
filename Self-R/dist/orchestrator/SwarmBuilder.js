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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const WebSocketServer_1 = require("../server/WebSocketServer");
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
            console.log(chalk_1.default.red('No valid swarm tasks generated from the debate. Aborting build.'));
            return;
        }
        console.log(chalk_1.default.blue(`Launching ${tasks.length} parallel modules into the swarm...`));
        await Promise.all(tasks.map(async (task) => {
            const target = task.command ? `[EXEC: ${task.command}]` : `[FILE: ${task.filename}]`;
            console.log(chalk_1.default.yellow(`- [${task.provider}] started task: ${task.name} -> ${target}`));
            try {
                // If it's a shell command task
                if (task.command) {
                    const llm = LLMFactory_1.LLMFactory.getProvider(task.provider);
                    const cmdPrompt = `The overarching objective is: "${this.objective}". 
Task instructions: ${task.instructions}.
Based on this, what is the exact, safe terminal command to execute? Return STRICTLY the command string only.`;
                    let finalCmd = task.command;
                    // If the command is a placeholder or needs AI generation, let the LLM refine it
                    if (task.command === "GENERATE" || task.command === "AUTO") {
                        const generatedCmd = await llm.generateResponse(cmdPrompt, "You are an expert devops terminal bot. Output strictly the command string.");
                        finalCmd = generatedCmd.replace(/`/g, '').trim();
                        console.log(chalk_1.default.dim(`  [${task.provider}] Generated command: ${finalCmd}`));
                    }
                    if (finalCmd.startsWith('[') && finalCmd.includes('Error]')) {
                        throw new Error(`LLM provider failed to generate command: ${finalCmd}`);
                    }
                    // Sandbox Execution: We are natively running ON the Proxmox Container now!
                    const sessionName = `swarm_${task.provider.toLowerCase()}_${Date.now()}`;
                    const safeCmd = finalCmd.replace(/"/g, '\\"');
                    // We run it inside a local tmux session directly
                    const tmuxCommand = `tmux new-session -d -s ${sessionName} "bash -c \\"${safeCmd}\\""`;
                    (0, WebSocketServer_1.broadcastLog)(task.provider, `Deploying tmux session [${sessionName}] natively on Proxmox LXC 160.`);
                    // We don't await the full command since it runs detached, letting long tasks survive 3 months!
                    await execAsync(tmuxCommand);
                    console.log(chalk_1.default.green(`✓ [${task.provider}] deployed local sandboxed shell task ${task.name}.`));
                    return; // Skip file generation
                }
                // If it's a file generation task
                const llm = LLMFactory_1.LLMFactory.getProvider(task.provider);
                const codePrompt = `Write the code for the following task based on the overall objective: "${this.objective}". 
Instructions: ${task.instructions}. 
Return strictly ONLY the raw code string, no markdown fences, backticks, or other formatting.`;
                let sysContext = "You are an expert autonomous code generator snippet bot.";
                // Mount specialized skill contexts dynamically requested for this task
                if (task.skills && task.skills.length > 0) {
                    console.log(chalk_1.default.dim(`  Injecting skills for ${task.name}: ${task.skills.join(', ')}`));
                    for (const s of task.skills) {
                        const skillData = this.skillLoader.loadSkillContext(s);
                        if (skillData) {
                            sysContext += `\n\n--- SKILL CONTEXT: ${s} ---\n${skillData}`;
                        }
                    }
                }
                const codeResult = await llm.generateResponse(codePrompt, sysContext);
                // Write code
                if (task.filename) {
                    // Force the output to the /completions directory
                    const safeFilename = path.basename(task.filename); // Ignore whatever path the LLM generated and just use the filename
                    const outPath = path.join(process.cwd(), 'completions', safeFilename);
                    // ensure dir exists
                    fs.mkdirSync(path.dirname(outPath), { recursive: true });
                    // strip out any potential markdown fences that the LLM stubbornly returns
                    const cleanCode = codeResult.replace(/^```(\w+)?\n/i, '').replace(/```$/i, '');
                    fs.writeFileSync(outPath, cleanCode, 'utf8');
                    (0, WebSocketServer_1.broadcastLog)(task.provider, `Saved completed module to VAULT: /completions/${safeFilename}`);
                    console.log(chalk_1.default.green(`✓ [${task.provider}] completed ${task.name}. Saved to completions/${safeFilename}`));
                }
            }
            catch (err) {
                console.log(chalk_1.default.red(`✗ [${task.provider}] failed task ${task.name}. Error: ${err}`));
            }
        }));
        console.log(chalk_1.default.bold.green('\n[Swarm parallel execution complete. All modules merged into workspace.]'));
    }
}
exports.SwarmBuilder = SwarmBuilder;
