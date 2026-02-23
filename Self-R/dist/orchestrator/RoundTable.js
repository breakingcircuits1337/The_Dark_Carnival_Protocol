"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeOrchestrator = initializeOrchestrator;
const chalk_1 = __importDefault(require("chalk"));
const LLMFactory_1 = require("../providers/LLMFactory");
const SwarmBuilder_1 = require("./SwarmBuilder");
const SkillLoader_1 = require("../skills/SkillLoader");
async function initializeOrchestrator(objective) {
    console.log(chalk_1.default.bold.yellow('The Orchestrator has received the objective: ') + objective);
    // Mount the Agent Skills memory
    const skillLoader = new SkillLoader_1.SkillLoader();
    const availableSkills = skillLoader.getAvailableSkills();
    console.log(chalk_1.default.dim(`Loaded ${availableSkills.length} skills into the Orchestrator's memory.`));
    const availableProviders = LLMFactory_1.LLMFactory.getAvailableProviders();
    console.log(chalk_1.default.dim(`Found configured LLM providers: ${availableProviders.join(', ')}`));
    // Fallback logic to assign the best available model to each seat
    const pickProvider = (preferences) => {
        const found = preferences.find(p => availableProviders.includes(p));
        return found || availableProviders[0] || 'Ollama';
    };
    const visionaryName = pickProvider(['Kimi', 'GPT', 'Claudeson', 'Claude', 'Mistral', 'Gemini', 'Groq', 'Ollama']);
    const criticName = pickProvider(['GPT', 'Kimi', 'Claudeson', 'Groq', 'Claude', 'Gemini', 'Mistral', 'Ollama']);
    const tacticianName = pickProvider(['DeepSeek', 'Mistral', 'Claudeson', 'GPT', 'Claude', 'Gemini', 'Groq', 'Ollama']);
    const visionary = LLMFactory_1.LLMFactory.getProvider(visionaryName);
    const critic = LLMFactory_1.LLMFactory.getProvider(criticName);
    const tactician = LLMFactory_1.LLMFactory.getProvider(tacticianName);
    console.log(chalk_1.default.blue('Calling the participants to the table:'));
    console.log(chalk_1.default.dim(`- ${visionary.name} is seated as the Visionary.`));
    console.log(chalk_1.default.dim(`- ${critic.name} is seated as the Critic.`));
    console.log(chalk_1.default.dim(`- ${tactician.name} is seated as the Tactician.`));
    console.log(chalk_1.default.bold.green('\n[Round Table Debate Commencing...]\n'));
    // 1. Draft Phase
    console.log(chalk_1.default.cyan(`[1/3] Asking ${visionary.name} for the initial architectural draft...`));
    const draftPrompt = `You are a visionary software architect. The user wants to build: "${objective}". Provide a high-level component breakdown. Focus on speed and modern practices.`;
    const draftResponse = await visionary.generateResponse(draftPrompt, "You are an expert software architect.");
    console.log(chalk_1.default.gray(`\n${visionary.name} output:\n${draftResponse.substring(0, 500)}...\n`));
    // 2. Critique Phase
    console.log(chalk_1.default.cyan(`[2/3] Passing the draft to ${critic.name} for critical review...`));
    const critiquePrompt = `Review the following architectural draft critically. Point out any security flaws, potential bottlenecks, or missing error handling boundaries.\n\nDraft:\n${draftResponse}`;
    const critiqueResponse = await critic.generateResponse(critiquePrompt, "You are a meticulous, pedantic senior software reviewer focused on security and scale.");
    console.log(chalk_1.default.gray(`\n${critic.name} output:\n${critiqueResponse.substring(0, 500)}...\n`));
    // 3. Synthesis Phase
    console.log(chalk_1.default.cyan(`[3/3] Passing critique to ${tactician.name} for actionable tactical delegation...`));
    const synthesisPrompt = `You are a tactical manager. Take the original draft and its critique, and synthesize them into distinct, actionable parallel tasks for a swarm of developers to execute. 
    You MUST output valid JSON ONLY, using this schema:
    { "tasks": [ { "name": "Task Title", "provider": "${availableProviders.join('|')}", "instructions": "Detailed prompt", "filename": "src/example.ts" (optional), "command": "npm install" (optional - use for shell execution), "skills": ["skill_name"] (optional) } ] }
    If a task requires executing a shell command (like npm install, git init, rm, etc), provide the command string using the 'command' key instead of 'filename'. If you want the worker bot to figure out the command dynamically based on instructions, set "command": "AUTO".
    Do not output any markdown formatting or backticks around the JSON.
    Available skills you can assign to assist the workers: ${availableSkills.join(', ')}
    \n\nDraft:\n${draftResponse}\n\nCritique:\n${critiqueResponse}`;
    const synthesisResponse = await tactician.generateResponse(synthesisPrompt, "You are a technical project manager specializing in JSON API schemas. Output strict JSON only.");
    let parsedTasks = { tasks: [] };
    try {
        // Extract strictly the JSON block to avoid conversational prefix/suffix errors
        const jsonMatch = synthesisResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON structure found in output');
        }
        const cleanJson = jsonMatch[0];
        parsedTasks = JSON.parse(cleanJson);
        console.log(chalk_1.default.green(`Tactician successfully broke down objective into ${parsedTasks.tasks.length} tasks.`));
    }
    catch (e) {
        console.log(chalk_1.default.red(`Failed to parse Swarm logic from Tactician. Falling back to default tasks. Error: ${e}`));
    }
    console.log(chalk_1.default.bold.magenta('\nDebate Concluded. Task delegated to SwarmBuilder for execution...'));
    const builder = new SwarmBuilder_1.SwarmBuilder(objective);
    builder.delegateToSwarm(parsedTasks.tasks);
}
