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
exports.startUIServer = startUIServer;
exports.broadcastLog = broadcastLog;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const chalk_1 = __importDefault(require("chalk"));
const RoundTable_1 = require("../orchestrator/RoundTable");
let ioInstance = null;
function startUIServer(port = 8080) {
    const app = (0, express_1.default)();
    const server = (0, http_1.createServer)(app);
    const io = new socket_io_1.Server(server, { cors: { origin: '*' } });
    ioInstance = io;
    // Serve the Self-R-UI folder
    const uiPath = path.join(process.cwd(), '../Self-R-UI');
    app.use(express_1.default.static(uiPath));
    app.use(express_1.default.json()); // enable json body parsing
    // File Management Endpoints for Proxmox UI
    const completionsDir = path.join(process.cwd(), 'completions');
    app.get('/api/completions', (req, res) => {
        try {
            if (!fs.existsSync(completionsDir))
                fs.mkdirSync(completionsDir, { recursive: true });
            const files = fs.readdirSync(completionsDir);
            res.json({ files });
        }
        catch (e) {
            res.status(500).json({ error: e.toString() });
        }
    });
    app.get('/api/completions/:filename', (req, res) => {
        try {
            const file = path.join(completionsDir, req.params.filename);
            if (fs.existsSync(file))
                res.sendFile(file);
            else
                res.status(404).send('Not found');
        }
        catch (e) {
            res.status(500).json({ error: e.toString() });
        }
    });
    app.delete('/api/completions/:filename', (req, res) => {
        try {
            const file = path.join(completionsDir, req.params.filename);
            if (fs.existsSync(file))
                fs.unlinkSync(file);
            res.json({ success: true });
        }
        catch (e) {
            res.status(500).json({ error: e.toString() });
        }
    });
    // Learning / Contemplation Engine
    app.post('/api/learn', async (req, res) => {
        try {
            const { filename, contents } = req.body;
            const llm = require('../providers/LLMFactory').LLMFactory.getProvider('DeepSeek'); // Use deepseek by default
            const prompt = `Objective: Ingest the following python script ${filename}, analyze its logic, contemplate its flaws, and learn how to improve it.\n\nCode:\n${contents}`;
            const analysis = await llm.generateResponse(prompt, 'You are the Swarm Meta-Cognitive Engine.');
            res.json({ analysis });
        }
        catch (e) {
            res.status(500).json({ error: e.toString() });
        }
    });
    io.on('connection', (socket) => {
        console.log(chalk_1.default.cyan(`[UI WebSocket] Connected: ${socket.id}`));
        socket.on('trigger-debate', async (data) => {
            console.log(chalk_1.default.yellow(`[UI Trigger] Received Objective: ${data.objective}`));
            try {
                // Call the entire Swarm orchestration flow dynamically
                await (0, RoundTable_1.initializeOrchestrator)(data.objective);
            }
            catch (err) {
                console.error(chalk_1.default.red('[UI Trigger] Swarm execution failed: ' + err));
            }
        });
        socket.on('disconnect', () => {
            console.log(chalk_1.default.gray(`[UI WebSocket] Disconnected: ${socket.id}`));
        });
    });
    server.listen(port, () => {
        console.log(chalk_1.default.green(`\n[UI Server] Running locally on http://localhost:${port}`));
        console.log(chalk_1.default.green(`[UI WebSocket] Socket.io enabled\n`));
    });
}
function broadcastLog(agent, message) {
    if (ioInstance) {
        ioInstance.emit('swarm-log', { agent, message });
    }
}
