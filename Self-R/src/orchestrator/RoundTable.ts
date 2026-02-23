import chalk from 'chalk';
import { LLMFactory } from '../providers/LLMFactory';
import { SwarmBuilder, SwarmTask } from './SwarmBuilder';
import { SkillLoader } from '../skills/SkillLoader';
import { broadcastLog } from '../server/WebSocketServer';

export interface RoundTableOverrides {
    visionary?: string;
    critic?: string;
    tactician?: string;
}

export async function initializeOrchestrator(objective: string, overrides?: RoundTableOverrides, userFeedback?: string) {
    console.log(chalk.bold.yellow('The Orchestrator has received the objective: ') + objective);

    // Mount the Agent Skills memory
    const skillLoader = new SkillLoader();
    const availableSkills = skillLoader.getAvailableSkills();
    console.log(chalk.dim(`Loaded ${availableSkills.length} skills into the Orchestrator memory.`));

    // Health-checked provider list — Claudeson/Ollama only appear if reachable
    const availableProviders = await LLMFactory.getAvailableProviders();
    console.log(chalk.dim(`Found configured LLM providers: ${availableProviders.join(', ')}`));

    // Fallback logic to assign the best available model to each seat
    const pickProvider = (preferences: string[]) => {
        const found = preferences.find(p => availableProviders.includes(p));
        return found || availableProviders[0] || 'Mistral';
    };

    // Use UI-selected providers if provided, otherwise auto-pick from preference list
    const visionaryName = (overrides?.visionary && availableProviders.includes(overrides.visionary))
        ? overrides.visionary
        : pickProvider(['Kimi', 'GPT', 'Claudeson', 'Claude', 'Mistral', 'Gemini', 'Groq', 'Ollama']);
    const criticName = (overrides?.critic && availableProviders.includes(overrides.critic))
        ? overrides.critic
        : pickProvider(['Mistral', 'GPT', 'Kimi', 'Claudeson', 'Groq', 'Claude', 'Gemini', 'Ollama']);
    const tacticianName = (overrides?.tactician && availableProviders.includes(overrides.tactician))
        ? overrides.tactician
        : pickProvider(['DeepSeek', 'Mistral', 'Claudeson', 'GPT', 'Claude', 'Gemini', 'Groq', 'Ollama']);

    const visionary = LLMFactory.getProvider(visionaryName);
    const critic = LLMFactory.getProvider(criticName);
    const tactician = LLMFactory.getProvider(tacticianName);

    console.log(chalk.blue('Calling the participants to the table:'));
    console.log(chalk.dim(`- ${visionary.name} is seated as the Visionary.`));
    console.log(chalk.dim(`- ${critic.name} is seated as the Critic.`));
    console.log(chalk.dim(`- ${tactician.name} is seated as the Tactician.`));

    console.log(chalk.bold.green('\n[Round Table Debate Commencing...]\n'));
    broadcastLog('main', `[Round Table] Visionary: ${visionary.name} | Critic: ${critic.name} | Tactician: ${tactician.name}`);
    broadcastLog('main', `[Round Table] Debate Commencing...`);

    // 1. Draft Phase
    console.log(chalk.cyan(`[1/3] Asking ${visionary.name} for the initial architectural draft...`));
    broadcastLog('main', `[1/3] Asking ${visionary.name} for initial architectural draft...`);
    let draftPrompt = `You are a visionary software architect. The user wants to build: "${objective}". Provide a high-level component breakdown. Focus on speed and modern practices. Important: You must also proactively suggest 1 or 2 advanced architectural improvements, features, or patterns the user might not have thought of that would fundamentally elevate the system.`;
    if (userFeedback) {
        draftPrompt += `\n\nCRITICAL FEEDBACK FROM HUMAN COMMANDER ON PREVIOUS PLAN:\n"${userFeedback}"\n\nYou MUST address this feedback and revise your architectural approach accordingly.`;
    }
    const draftResponse = await visionary.generateResponse(draftPrompt, 'You are an expert software architect.');
    console.log(chalk.gray(`\n${visionary.name} output:\n${draftResponse.substring(0, 600)}...\n`));
    broadcastLog('main', `[Visionary / ${visionary.name}] Draft received (${draftResponse.length} chars).`);

    // 2. Critique Phase
    console.log(chalk.cyan(`[2/3] Passing the draft to ${critic.name} for critical review...`));
    broadcastLog('main', `[2/3] Passing draft to ${critic.name} for critical review...`);
    const critiquePrompt = `Review the following architectural draft critically. Point out security flaws, potential bottlenecks, and missing error handling.\n\nDraft:\n${draftResponse}`;
    const critiqueResponse = await critic.generateResponse(critiquePrompt, 'You are a meticulous senior software reviewer focused on security and scale.');
    console.log(chalk.gray(`\n${critic.name} output:\n${critiqueResponse.substring(0, 600)}...\n`));
    broadcastLog('main', `[Critic / ${critic.name}] Critique received (${critiqueResponse.length} chars).`);

    // 3. Synthesis Phase — Tactician synthesizes into strict JSON task list
    console.log(chalk.cyan(`[3/3] Asking ${tactician.name} to synthesize into parallel swarm tasks...`));
    broadcastLog('main', `[3/3] Asking ${tactician.name} to synthesize into JSON task list...`);
    const synthesisPrompt = `You are a tactical project manager. Synthesize the draft and critique into a strict JSON task list for a parallel developer swarm.

Output ONLY valid JSON with this exact schema — no markdown, no backticks, no extra text:
{ "suggestions": ["Proactive Idea 1", "Proactive Idea 2"], "tasks": [ { "name": "Task Title", "provider": "PROVIDER_NAME", "instructions": "Detailed prompt", "filename": "src/example.ts" } ] }

Rules:
- "provider" MUST be exactly one of: ${availableProviders.join(', ')}
- Each task MUST have "name", "provider", and "instructions"
- Use "filename" for code file generation tasks
- Use "command" instead of "filename" for shell execution tasks (set to "AUTO" for AI-generated)
- "skills" is an optional array. Available skills: ${availableSkills.slice(0, 20).join(', ')}
- Generate 3-8 parallel tasks maximum for efficiency

Draft:
${draftResponse}

Critique:
${critiqueResponse}`;

    const synthesisResponse = await tactician.generateResponse(
        synthesisPrompt,
        'You are a technical project manager. Output strict JSON only. No markdown fences.'
    );

    let parsedData: { suggestions?: string[], tasks: SwarmTask[] } = { suggestions: [], tasks: [] };
    try {
        const jsonMatch = synthesisResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON structure found in Tactician output');

        parsedData = JSON.parse(jsonMatch[0]);

        // Validate & remap unknown provider names to a safe fallback
        parsedData.tasks = parsedData.tasks.map(t => ({
            ...t,
            provider: availableProviders.includes(t.provider) ? t.provider : (availableProviders[0] || 'Mistral')
        }));

        console.log(chalk.green(`✓ Tactician broke objective into ${parsedData.tasks.length} parallel tasks.`));
        broadcastLog('main', `✓ Tactician broke objective into ${parsedData.tasks.length} parallel tasks.`);
        parsedData.tasks.forEach((t, i) => {
            console.log(chalk.dim(`  ${i + 1}. [${t.provider}] ${t.name} → ${t.filename || t.command || '(instructions only)'}`));
            broadcastLog('main', `  ${i + 1}. [${t.provider}] ${t.name} → ${t.filename || t.command}`);
        });
    } catch (e) {
        console.log(chalk.red(`✗ Failed to parse Tactician output. Error: ${e}`));
        broadcastLog('main', `✗ Failed to parse Tactician output: ${e}`);
        console.log(chalk.dim('Raw Tactician response:\n' + synthesisResponse.substring(0, 1000)));
    }

    console.log(chalk.bold.magenta('\nDebate Complete. Waiting for human approval...\n'));
    broadcastLog('main', `\nDebate Complete. Plan generated. Waiting for human commander to review...`);

    return {
        tasks: parsedData.tasks,
        suggestions: parsedData.suggestions || [],
        objective,
        visionary: visionary.name,
        critic: critic.name,
        tactician: tactician.name
    };
}
