import chalk from 'chalk';
import { LLMFactory } from '../providers/LLMFactory';
import { SkillLoader } from '../skills/SkillLoader';
import { memoryEngine } from '../memory/MemoryEngine';
import { broadcastLog } from '../server/WebSocketServer';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { HiveMind } from './HiveMind';

const execAsync = promisify(exec);

export interface SwarmTask {
    name: string;
    provider: string;
    instructions: string;
    filename?: string;
    command?: string;
    skills?: string[];
}
export class SwarmBuilder {
    private objective: string;
    private skillLoader: SkillLoader;

    constructor(objective: string) {
        this.objective = objective;
        this.skillLoader = new SkillLoader();
        console.log(chalk.magenta(`\nSwarm instantiated for objective: ${objective}`));
    }

    public async delegateToSwarm(tasks: SwarmTask[]) {
        if (!tasks || tasks.length === 0) {
            console.log(chalk.red('No valid swarm tasks generated from the debate. Aborting.'));
            broadcastLog('SwarmBuilder', 'No tasks generated — swarm aborted.');
            return;
        }

        console.log(chalk.blue(`\nLaunching ${tasks.length} parallel modules into the swarm...`));
        broadcastLog('SwarmBuilder', `Launching ${tasks.length} parallel swarm tasks...`);

        const results = await Promise.all(tasks.map(async (task) => {
            const target = task.command ? `[EXEC: ${task.command}]` : `[FILE: ${task.filename || '(no file)'}]`;
            console.log(chalk.yellow(`- [${task.provider}] started: ${task.name} -> ${target}`));
            broadcastLog(task.provider, `Started: ${task.name} → ${target}`);

            try {
                // ── Shell Command Task ──────────────────────────────────────────────────
                if (task.command) {
                    const llm = LLMFactory.getProvider(task.provider);
                    let finalCmd = task.command;

                    if (task.command === 'GENERATE' || task.command === 'AUTO') {
                        const cmdPrompt = `Objective: "${this.objective}". Task: ${task.instructions}. Return ONLY the exact safe shell command string to execute. No explanation.`;
                        const generatedCmd = await llm.generateResponse(cmdPrompt, 'You are an expert DevOps terminal bot. Output ONLY the command string.');
                        finalCmd = generatedCmd.replace(/`/g, '').trim();
                        console.log(chalk.dim(`  [${task.provider}] Generated command: ${finalCmd}`));
                        broadcastLog(task.provider, `Generated command: ${finalCmd}`);
                    }

                    // Safety: detect LLM error strings that leaked through
                    if (finalCmd.startsWith('\u001b[31m') || finalCmd.toLowerCase().includes('error')) {
                        throw new Error(`LLM returned an error instead of a command: ${finalCmd.substring(0, 100)}`);
                    }

                    const sessionName = `swarm_${task.provider.toLowerCase()}_${Date.now()}`;
                    const safeCmd = finalCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    const tmuxCmd = `tmux new-session -d -s ${sessionName} "bash -c \\"${safeCmd}\\""`;

                    broadcastLog(task.provider, `Deploying tmux session [${sessionName}]`);
                    await execAsync(tmuxCmd);

                    console.log(chalk.green(`✓ [${task.provider}] Shell task deployed: ${task.name}`));
                    broadcastLog(task.provider, `✓ Shell task complete: ${task.name}`);
                    return { task: task.name, success: true, type: 'command' };
                }

                // ── File Generation Task ────────────────────────────────────────────────
                const llm = LLMFactory.getProvider(task.provider);

                let sysContext = 'You are an expert autonomous code generator. Output ONLY raw code, no markdown fences, no backticks, no explanatory text.';

                // Inject specialized skill contexts
                if (task.skills && task.skills.length > 0) {
                    console.log(chalk.dim(`  Injecting skills for ${task.name}: ${task.skills.join(', ')}`));
                    for (const s of task.skills) {
                        const skillData = this.skillLoader.loadSkillContext(s);
                        if (skillData) {
                            sysContext += `\n\n--- SKILL CONTEXT: ${s} ---\n${skillData}`;
                        }
                    }
                }

                broadcastLog(task.provider, `Deploying HiveMind Sub-Swarm for ${task.filename || task.name}...`);
                const codeResult = await HiveMind.executeSubSwarm(task, sysContext);

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

                    console.log(chalk.green(`✓ [${task.provider}] ${task.name} saved → completions/${safeFilename}`));
                    broadcastLog(task.provider, `✓ Saved module to VAULT: /completions/${safeFilename}`);

                    // FIXED: Auto-absorb completed module into MemoryEngine's short-term memory
                    try {
                        await memoryEngine.absorbCompletion(safeFilename, cleanCode);
                        broadcastLog('MemoryEngine', `Absorbed ${safeFilename} into short-term memory.`);
                    } catch (memErr) {
                        console.log(chalk.dim(`  [MemoryEngine] Absorption skipped (Redis unavailable): ${memErr}`));
                    }

                    return { task: task.name, success: true, type: 'file', filename: safeFilename };
                }

                return { task: task.name, success: true, type: 'instructions-only' };

            } catch (err) {
                const errMsg = `${err}`;
                console.log(chalk.red(`✗ [${task.provider}] failed: ${task.name} — ${errMsg}`));
                broadcastLog(task.provider, `✗ FAILED: ${task.name} — ${errMsg.substring(0, 200)}`);
                return { task: task.name, success: false, error: errMsg };
            }
        }));

        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(chalk.bold.green(`\n[Swarm Complete] ${succeeded}/${tasks.length} tasks succeeded. ${failed} failed.`));
        broadcastLog('SwarmBuilder', `Swarm complete: ${succeeded}/${tasks.length} succeeded, ${failed} failed.`);

        return results;
    }
}
