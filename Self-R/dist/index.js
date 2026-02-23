"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const RoundTable_1 = require("./orchestrator/RoundTable");
const LLMFactory_1 = require("./providers/LLMFactory");
const WebSocketServer_1 = require("./server/WebSocketServer");
const program = new commander_1.Command();
program
    .name('self-replacater')
    .description('Autonomous CLI swarm orchestrator using multiple LLMs as a "Round Table"')
    .version('1.0.0');
program
    .command('serve')
    .description('Only start the local web dashboard and websocket bridge (Proxmox Swarm API)')
    .action(() => {
    (0, WebSocketServer_1.startUIServer)(8080);
});
program
    .command('init')
    .description('Initialize a new round table swarm for a specific task and start the web dashboard')
    .argument('<task>', 'The task or project to build')
    .action(async (task) => {
    (0, WebSocketServer_1.startUIServer)(8080);
    console.log(chalk_1.default.bold.magenta('\n🏰 Assembling the Round Table...\n'));
    console.log(chalk_1.default.gray(`Objective: "${task}"\n`));
    await (0, RoundTable_1.initializeOrchestrator)(task);
});
program
    .command('health')
    .description('Check the API connection health of all configured LLMs')
    .action(async () => {
    console.log(chalk_1.default.blue('Checking Swarm API endpoints...\n'));
    const providers = ['Gemini', 'Claude', 'Ollama', 'Mistral', 'GPT', 'Groq'];
    for (const name of providers) {
        console.log(chalk_1.default.dim(`Pinging ${name}...`));
        try {
            const provider = LLMFactory_1.LLMFactory.getProvider(name);
            const res = await provider.generateResponse('Please reply with the single word: PONG.', 'You are a health ping bot.');
            console.log(chalk_1.default.green(`[${name} OK]: ${res.trim()}`));
        }
        catch (e) {
            console.log(chalk_1.default.red(`[${name} FAILED]: ${e}`));
        }
    }
});
program.parse(process.argv);
