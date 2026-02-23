import { LLMFactory } from '../providers/LLMFactory';
import { broadcastLog } from '../server/WebSocketServer';
import { SwarmTask } from './SwarmBuilder';

export class HiveMind {
    static async executeSubSwarm(task: SwarmTask, sysContext: string): Promise<string> {
        // Find responsive LLM providers
        const available = await LLMFactory.getAvailableProviders();
        if (available.length === 0) {
            throw new Error(`[HiveMind] No LLM providers available for sub-swarm!`);
        }

        const pick = (prefs: string[]) => prefs.find(p => available.includes(p)) || available[0];

        // Evaluate task complexity for intelligent Model Routing
        const lengthScore = task.instructions.length / 100;
        const hasComplexKeywords = /architecture|security|database|optimize|refactor|concurrency|async/i.test(task.instructions);

        let routingTier = 'BASIC';
        if (lengthScore > 10 || hasComplexKeywords) {
            routingTier = 'COMPLEX';
        } else if (lengthScore > 3) {
            routingTier = 'INTERMEDIATE';
        }

        broadcastLog(task.provider, `[HiveMind / QUEEN] Task complexity: ${routingTier}. Routing to optimal model tiers...`);

        // Define specialized worker roles based on complexity routing
        let plannerPrefs: string[], coderPrefs: string[], reviewerPrefs: string[];

        if (routingTier === 'COMPLEX') {
            // Expensive, high-reasoning models for complex tasks
            plannerPrefs = ['DeepSeek', 'Kimi', 'GPT', 'Claude'];
            coderPrefs = ['Claude', 'GPT', 'DeepSeek', 'Claudeson'];
            reviewerPrefs = ['GPT', 'DeepSeek', 'Claude', 'Kimi'];
        } else if (routingTier === 'INTERMEDIATE') {
            // Balanced models
            plannerPrefs = ['Kimi', 'Gemini', 'Mistral', 'GPT'];
            coderPrefs = ['Claudeson', 'Gemini', 'Mistral', 'GPT'];
            reviewerPrefs = ['Mistral', 'Groq', 'Gemini', 'Kimi'];
        } else {
            // BASIC (Fastest/Cheapest for simple tasks)
            plannerPrefs = ['Mistral', 'Groq', 'Ollama', 'Gemini'];
            coderPrefs = ['Mistral', 'Groq', 'Ollama', 'Claudeson'];
            reviewerPrefs = ['Groq', 'Mistral', 'Ollama'];
        }

        const plannerProvider = LLMFactory.getProvider(pick(plannerPrefs));
        const coderProvider = LLMFactory.getProvider(pick(coderPrefs));
        const reviewerProvider = LLMFactory.getProvider(pick(reviewerPrefs));

        broadcastLog(task.provider, `[HiveMind / QUEEN] Spawning Worker Node (Planner) → ${plannerProvider.name}`);
        const planPrompt = `Draft a detailed, step-by-step logic pseudocode for the following task. Focus purely on architecture and algorithms.\n\nTask Name: ${task.name}\nInstructions: ${task.instructions}\nTarget File: ${task.filename}\n\nOutput only the pseudocode/plan.`;
        const plan = await plannerProvider.generateResponse(planPrompt, sysContext);
        broadcastLog(task.provider, `[HiveMind / ${plannerProvider.name}] Architecture Plan drafted. Passing payload to Code Worker...`);

        broadcastLog(task.provider, `[HiveMind / QUEEN] Spawning Worker Node (Coder) → ${coderProvider.name}`);
        const codePrompt = `Implement the following task based ENTIRELY on this pseudocode plan.\n\nTask: ${task.name}\nInstructions: ${task.instructions}\nFile context: ${task.filename}\n\nPlan:\n${plan}\n\nOutput STRICTLY raw code, no markdown fences or formatting. Just raw textual source code.`;
        let code = await coderProvider.generateResponse(codePrompt, sysContext);

        // Coder often includes markdown fences, clean them off
        code = code.replace(/^```[a-z]*\n/, '').replace(/```$/, '').trim();
        broadcastLog(task.provider, `[HiveMind / ${coderProvider.name}] Code implementation drafted. Triggering Review Worker...`);

        broadcastLog(task.provider, `[HiveMind / QUEEN] Spawning Worker Node (Reviewer) → ${reviewerProvider.name}`);
        const reviewPrompt = `Audit this generated code for the specified task. If the code is correct, return the EXACT original code. If there are bugs, logic errors, or syntax issues, fix them and return the full corrected code.\n\nTask: ${task.name}\n\nCode:\n${code}\n\nOutput STRICTLY raw code, no markdown fences.`;
        let finalCode = await reviewerProvider.generateResponse(reviewPrompt, sysContext);
        finalCode = finalCode.replace(/^```[a-z]*\n/, '').replace(/```$/, '').trim();

        broadcastLog(task.provider, `[HiveMind / ${reviewerProvider.name}] Code Review Complete. Consensus Reached.`);
        return finalCode;
    }
}
