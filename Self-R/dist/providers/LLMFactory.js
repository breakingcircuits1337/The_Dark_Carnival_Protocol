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
exports.LLMFactory = exports.GroqProvider = exports.MistralProvider = exports.OllamaProvider = exports.DeepSeekProvider = exports.OpenAIProvider = exports.ClaudeProvider = exports.GeminiProvider = exports.KimiProvider = exports.ClaudesonProvider = void 0;
const generative_ai_1 = require("@google/generative-ai");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const openai_1 = __importDefault(require("openai"));
const ollama_1 = __importDefault(require("ollama"));
const chalk_1 = __importDefault(require("chalk"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
class ClaudesonProvider {
    name = 'Claudeson';
    async generateResponse(prompt, context = '') {
        // Claudeson 2026 runs locally via a bridge API (FastAPI) on port 8000
        const response = await fetch('http://127.0.0.1:8000/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claudeson-2026',
                messages: [
                    { role: 'system', content: context },
                    { role: 'user', content: prompt }
                ],
                planning_horizon: 3
            })
        });
        if (!response.ok) {
            throw new Error(`[Claudeson] HTTP ${response.status}: ${response.statusText} — ensure the Claudeson 2026 Python API is running on port 8000.`);
        }
        const data = await response.json();
        return data.choices[0].message.content || '';
    }
}
exports.ClaudesonProvider = ClaudesonProvider;
class KimiProvider {
    name = 'Kimi';
    async generateResponse(prompt, context = '') {
        const endpoint = process.env.KIMI_ENDPOINT;
        const apiKey = process.env.AZURE_API_KEY || process.env.KIMI_API_KEY;
        if (!endpoint || !apiKey) {
            throw new Error('[Kimi] KIMI_ENDPOINT and AZURE_API_KEY must be set in .env');
        }
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: context },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 4096,
                temperature: 0.7
            })
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`[Kimi] HTTP ${response.status}: ${errText}`);
        }
        const data = await response.json();
        return data.choices[0].message.content || '';
    }
}
exports.KimiProvider = KimiProvider;
class GeminiProvider {
    name = 'Gemini';
    genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    async generateResponse(prompt, context = '') {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(`${context}\n\n${prompt}`);
        return result.response.text();
    }
}
exports.GeminiProvider = GeminiProvider;
class ClaudeProvider {
    name = 'Claude';
    anthropic = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
    async generateResponse(prompt, context = '') {
        const msg = await this.anthropic.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 4096,
            system: context,
            messages: [{ role: 'user', content: prompt }]
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return msg.content[0].text;
    }
}
exports.ClaudeProvider = ClaudeProvider;
class OpenAIProvider {
    name = 'GPT';
    async generateResponse(prompt, context = '') {
        try {
            // Azure Route for GPT-4o on resource 9257
            if (process.env.AZURE_GPT4O_ENDPOINT && process.env.AZURE_GPT4O_KEY) {
                const response = await fetch(process.env.AZURE_GPT4O_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': process.env.AZURE_GPT4O_KEY
                    },
                    body: JSON.stringify({
                        messages: [
                            { role: 'system', content: context },
                            { role: 'user', content: prompt }
                        ],
                        max_tokens: 4096,
                        temperature: 0.7
                    })
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Azure GPT-4o HTTP ${response.status}: ${errText}`);
                }
                const data = await response.json();
                return data.choices[0].message.content || '';
            }
            // Azure Route for GPT-4.1 on resource 1334
            if (process.env.AZURE_GPT41_ENDPOINT && process.env.AZURE_API_KEY) {
                const response = await fetch(process.env.AZURE_GPT41_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': process.env.AZURE_API_KEY
                    },
                    body: JSON.stringify({
                        messages: [
                            { role: 'system', content: context },
                            { role: 'user', content: prompt }
                        ],
                        max_tokens: 4096,
                        temperature: 0.7
                    })
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Azure GPT-4.1 HTTP ${response.status}: ${errText}`);
                }
                const data = await response.json();
                return data.choices[0].message.content || '';
            }
            // Fallback Official OpenAI Route
            const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY || '' });
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: 'system', content: context },
                    { role: 'user', content: prompt }
                ],
                model: 'gpt-4o',
            });
            return completion.choices[0].message.content || '';
        }
        catch (error) {
            return chalk_1.default.red(`[GPT Error]: ${error}`);
        }
    }
}
exports.OpenAIProvider = OpenAIProvider;
class DeepSeekProvider {
    name = 'DeepSeek';
    async generateResponse(prompt, context = '') {
        try {
            const endpoint = process.env.DEEPSEEK_ENDPOINT;
            const apiKey = process.env.AZURE_API_KEY;
            if (!endpoint || !apiKey) {
                throw new Error("DEEPSEEK_ENDPOINT and AZURE_API_KEY must be set in .env");
            }
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: context },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 4096,
                    temperature: 0.7
                })
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errText}`);
            }
            const data = await response.json();
            return data.choices[0].message.content || '';
        }
        catch (error) {
            return chalk_1.default.red(`[DeepSeek Error]: ${error}`);
        }
    }
}
exports.DeepSeekProvider = DeepSeekProvider;
class OllamaProvider {
    name = 'Ollama';
    async generateResponse(prompt, context = '') {
        const modelName = process.env.OLLAMA_MODEL || 'llama3.2';
        const response = await ollama_1.default.chat({
            model: modelName,
            messages: [
                { role: 'system', content: context },
                { role: 'user', content: prompt }
            ],
        });
        return response.message.content;
    }
}
exports.OllamaProvider = OllamaProvider;
class MistralProvider {
    name = 'Mistral';
    async generateResponse(prompt, context = '') {
        try {
            // Route to Azure AI Foundry if environment is configured
            if (process.env.MISTRAL_ENDPOINT && process.env.AZURE_API_KEY) {
                const response = await fetch(process.env.MISTRAL_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': process.env.AZURE_API_KEY
                    },
                    body: JSON.stringify({
                        messages: [
                            { role: 'system', content: context },
                            { role: 'user', content: prompt }
                        ],
                        max_tokens: 4096,
                        temperature: 0.7
                    })
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Azure HTTP ${response.status}: ${errText}`);
                }
                const data = await response.json();
                return data.choices[0].message.content || '';
            }
            else {
                // Fallback to official Mistral cloud API via OpenAI proxy format
                const openai = new openai_1.default({
                    apiKey: process.env.MISTRAL_API_KEY || '',
                    baseURL: 'https://api.mistral.ai/v1'
                });
                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: 'system', content: context },
                        { role: 'user', content: prompt }
                    ],
                    model: 'mistral-large-latest',
                });
                return completion.choices[0].message.content || '';
            }
        }
        catch (error) {
            return chalk_1.default.red(`[Mistral Error]: ${error}`);
        }
    }
}
exports.MistralProvider = MistralProvider;
class GroqProvider {
    name = 'Groq';
    openai = new openai_1.default({
        apiKey: process.env.GROQ_API_KEY || '',
        baseURL: 'https://api.groq.com/openai/v1'
    });
    async generateResponse(prompt, context = '') {
        const completion = await this.openai.chat.completions.create({
            messages: [
                { role: 'system', content: context },
                { role: 'user', content: prompt }
            ],
            model: 'llama-3.3-70b-versatile',
        });
        return completion.choices[0].message.content || '';
    }
}
exports.GroqProvider = GroqProvider;
class LLMFactory {
    static getAvailableProvidersSync() {
        const available = [];
        if (process.env.OLLAMA_HOST)
            available.push('Ollama');
        if (process.env.CLAUDESON_URL)
            available.push('Claudeson');
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '')
            available.push('Gemini');
        if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== '')
            available.push('Claude');
        if ((process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.trim() !== '') || (process.env.MISTRAL_ENDPOINT && process.env.AZURE_API_KEY))
            available.push('Mistral');
        if ((process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '') || (process.env.AZURE_GPT4O_ENDPOINT && process.env.AZURE_GPT4O_KEY) || (process.env.AZURE_GPT41_ENDPOINT && process.env.AZURE_API_KEY))
            available.push('GPT');
        if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '')
            available.push('Groq');
        if ((process.env.AZURE_API_KEY || process.env.KIMI_API_KEY) && process.env.KIMI_ENDPOINT)
            available.push('Kimi');
        if (process.env.AZURE_API_KEY && process.env.DEEPSEEK_ENDPOINT)
            available.push('DeepSeek');
        return available;
    }
    static async getAvailableProviders() {
        const available = LLMFactory.getAvailableProvidersSync();
        const healthyProviders = [];
        for (const providerName of available) {
            if (providerName === 'Ollama') {
                try {
                    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
                    const response = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(2000) }); // 2-second timeout
                    if (response.ok) {
                        healthyProviders.push('Ollama');
                    }
                }
                catch (error) {
                    // console.warn(`Ollama health check failed: ${error}`);
                }
            }
            else if (providerName === 'Claudeson') {
                try {
                    const claudesonUrl = process.env.CLAUDESON_URL;
                    if (claudesonUrl) {
                        const response = await fetch(`${claudesonUrl}/health`, { signal: AbortSignal.timeout(2000) }); // 2-second timeout
                        if (response.ok) {
                            healthyProviders.push('Claudeson');
                        }
                    }
                }
                catch (error) {
                    // console.warn(`Claudeson health check failed: ${error}`);
                }
            }
            else {
                healthyProviders.push(providerName);
            }
        }
        return healthyProviders;
    }
    static getProvider(name) {
        switch (name.toLowerCase()) {
            case 'claudeson': return new ClaudesonProvider();
            case 'kimi': return new KimiProvider();
            case 'deepseek': return new DeepSeekProvider();
            case 'gemini': return new GeminiProvider();
            case 'claude': return new ClaudeProvider();
            case 'ollama': return new OllamaProvider();
            case 'mistral': return new MistralProvider();
            case 'gpt': return new OpenAIProvider();
            case 'groq': return new GroqProvider();
            default: return new OllamaProvider();
        }
    }
}
exports.LLMFactory = LLMFactory;
