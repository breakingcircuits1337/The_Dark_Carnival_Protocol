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
const dns = __importStar(require("dns"));
dns.setDefaultResultOrder('ipv4first');
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
    .option('-p, --port <number>', 'Port to run the UI server on', '8080')
    .option('-r, --role <string>', 'Role of this node (e.g. CORE, OSINT, MEDIA)', 'CORE')
    .option('--ringmaster <string>', 'URL of the Ringmaster hub. If set, node will auto-register.', 'http://192.168.1.124:8000')
    .action((options) => {
    const port = parseInt(options.port, 10);
    (0, WebSocketServer_1.startUIServer)(port, options.role, options.ringmaster);
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
