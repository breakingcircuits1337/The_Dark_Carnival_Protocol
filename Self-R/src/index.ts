import * as path from 'path';
import * as dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import { Command } from 'commander';
import chalk from 'chalk';
import { initializeOrchestrator } from './orchestrator/RoundTable';
import { LLMFactory } from './providers/LLMFactory';
import { startUIServer } from './server/WebSocketServer';

const program = new Command();

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
        startUIServer(port, options.role, options.ringmaster);
    });

program
    .command('init')
    .description('Initialize a new round table swarm for a specific task and start the web dashboard')
    .argument('<task>', 'The task or project to build')
    .action(async (task) => {
        startUIServer(8080);
        console.log(chalk.bold.magenta('\n🏰 Assembling the Round Table...\n'));
        console.log(chalk.gray(`Objective: "${task}"\n`));

        await initializeOrchestrator(task);
    });

program
    .command('health')
    .description('Check the API connection health of all configured LLMs')
    .action(async () => {
        console.log(chalk.blue('Checking Swarm API endpoints...\n'));

        const providers = ['Gemini', 'Claude', 'Ollama', 'Mistral', 'GPT', 'Groq'];

        for (const name of providers) {
            console.log(chalk.dim(`Pinging ${name}...`));
            try {
                const provider = LLMFactory.getProvider(name);
                const res = await provider.generateResponse('Please reply with the single word: PONG.', 'You are a health ping bot.');
                console.log(chalk.green(`[${name} OK]: ${res.trim()}`));
            } catch (e) {
                console.log(chalk.red(`[${name} FAILED]: ${e}`));
            }
        }
    });

program.parse(process.argv);
