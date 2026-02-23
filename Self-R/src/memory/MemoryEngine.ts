import { createClient } from "redis";
import { LLMFactory } from "../providers/LLMFactory";

export class MemoryEngine {
    private redisClient: ReturnType<typeof createClient>;
    private connected: boolean = false;

    constructor() {
        this.redisClient = createClient({ url: "redis://localhost:6379" });
        this.redisClient.connect()
            .then(() => { this.connected = true; })
            .catch((e: unknown) => console.log("[MemoryEngine] Redis unavailable (short-term memory disabled):", e));
    }

    async storeShortTerm(key: string, data: unknown): Promise<void> {
        if (!this.connected || !this.redisClient.isOpen) return;
        await this.redisClient.setEx(`stm:${key}`, 3600, JSON.stringify(data)); // 1 hour TTL
    }

    async getShortTerm(key: string): Promise<unknown | null> {
        if (!this.connected || !this.redisClient.isOpen) return null;
        const raw = await this.redisClient.get(`stm:${key}`);
        return raw ? JSON.parse(raw) : null;
    }

    async absorbCompletion(filename: string, code: string): Promise<string> {
        const llm = LLMFactory.getProvider("Kimi");
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

export const memoryEngine = new MemoryEngine();
