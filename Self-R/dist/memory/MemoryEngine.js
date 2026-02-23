"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryEngine = exports.MemoryEngine = void 0;
const redis_1 = require("redis");
const LLMFactory_1 = require("../providers/LLMFactory");
class MemoryEngine {
    redisClient;
    connected = false;
    constructor() {
        this.redisClient = (0, redis_1.createClient)({ url: "redis://localhost:6379" });
        this.redisClient.connect()
            .then(() => { this.connected = true; })
            .catch((e) => console.log("[MemoryEngine] Redis unavailable (short-term memory disabled):", e));
    }
    async storeShortTerm(key, data) {
        if (!this.connected || !this.redisClient.isOpen)
            return;
        await this.redisClient.setEx(`stm:${key}`, 3600, JSON.stringify(data)); // 1 hour TTL
    }
    async getShortTerm(key) {
        if (!this.connected || !this.redisClient.isOpen)
            return null;
        const raw = await this.redisClient.get(`stm:${key}`);
        return raw ? JSON.parse(raw) : null;
    }
    async absorbCompletion(filename, code) {
        const llm = LLMFactory_1.LLMFactory.getProvider("Kimi");
        const prompt = `Ingest this completed module: ${filename}. Extract the core logical functions, potential bugs, and architectural patterns.\n\nCode:\n${code.substring(0, 3000)}`;
        const analysis = await llm.generateResponse(prompt, "You are the ACE memory ingestion unit. Be concise.");
        await this.storeShortTerm(`ingest:${filename}`, {
            filename,
            timestamp: Date.now(),
            analysis: analysis.trim(),
        });
        console.log(`[MemoryEngine] Absorbed ${filename} into Short-Term Memory.`);
        return analysis;
    }
}
exports.MemoryEngine = MemoryEngine;
exports.memoryEngine = new MemoryEngine();
