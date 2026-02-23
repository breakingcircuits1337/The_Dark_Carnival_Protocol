import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import ollama from 'ollama';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
dotenv.config();

export interface LLMProvider {
    name: string;
    generateResponse(prompt: string, context?: string): Promise<string>;
}

export class ClaudesonProvider implements LLMProvider {
    name = 'Claudeson';

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
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

export class KimiProvider implements LLMProvider {
    name = 'Kimi';

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
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

export class GeminiProvider implements LLMProvider {
    name = 'Gemini';
    private genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(`${context}\n\n${prompt}`);
        return result.response.text();
    }
}

export class ClaudeProvider implements LLMProvider {
    name = 'Claude';
    private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
        const msg = await this.anthropic.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 4096,
            system: context,
            messages: [{ role: 'user', content: prompt }]
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (msg.content[0] as any).text;
    }
}

export class OpenAIProvider implements LLMProvider {
    name = 'GPT';

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
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
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: 'system', content: context },
                    { role: 'user', content: prompt }
                ],
                model: 'gpt-4o',
            });
            return completion.choices[0].message.content || '';
        } catch (error) {
            return chalk.red(`[GPT Error]: ${error}`);
        }
    }
}

export class DeepSeekProvider implements LLMProvider {
    name = 'DeepSeek';

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
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
        } catch (error) {
            return chalk.red(`[DeepSeek Error]: ${error}`);
        }
    }
}

export class OllamaProvider implements LLMProvider {
    name = 'Ollama';

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
        const modelName = process.env.OLLAMA_MODEL || 'llama3.2';
        const response = await ollama.chat({
            model: modelName,
            messages: [
                { role: 'system', content: context },
                { role: 'user', content: prompt }
            ],
        });
        return response.message.content;
    }
}

export class MistralProvider implements LLMProvider {
    name = 'Mistral';

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
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
            } else {
                // Fallback to official Mistral cloud API via OpenAI proxy format
                const openai = new OpenAI({
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
        } catch (error) {
            return chalk.red(`[Mistral Error]: ${error}`);
        }
    }
}

export class GroqProvider implements LLMProvider {
    name = 'Groq';
    private openai = new OpenAI({
        apiKey: process.env.GROQ_API_KEY || '',
        baseURL: 'https://api.groq.com/openai/v1'
    });

    async generateResponse(prompt: string, context: string = ''): Promise<string> {
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

export class LLMFactory {
    static getAvailableProvidersSync(): string[] {
        const available: string[] = [];
        if (process.env.OLLAMA_HOST) available.push('Ollama');
        if (process.env.CLAUDESON_URL) available.push('Claudeson');
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') available.push('Gemini');
        if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== '') available.push('Claude');
        if ((process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.trim() !== '') || (process.env.MISTRAL_ENDPOINT && process.env.AZURE_API_KEY)) available.push('Mistral');
        if ((process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '') || (process.env.AZURE_GPT4O_ENDPOINT && process.env.AZURE_GPT4O_KEY) || (process.env.AZURE_GPT41_ENDPOINT && process.env.AZURE_API_KEY)) available.push('GPT');
        if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '') available.push('Groq');
        if ((process.env.AZURE_API_KEY || process.env.KIMI_API_KEY) && process.env.KIMI_ENDPOINT) available.push('Kimi');
        if (process.env.AZURE_API_KEY && process.env.DEEPSEEK_ENDPOINT) available.push('DeepSeek');
        return available;
    }

    static async getAvailableProviders(): Promise<string[]> {
        const available = LLMFactory.getAvailableProvidersSync();
        const healthyProviders: string[] = [];

        for (const providerName of available) {
            if (providerName === 'Ollama') {
                try {
                    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
                    const response = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(2000) }); // 2-second timeout
                    if (response.ok) {
                        healthyProviders.push('Ollama');
                    }
                } catch (error) {
                    // console.warn(`Ollama health check failed: ${error}`);
                }
            } else if (providerName === 'Claudeson') {
                try {
                    const claudesonUrl = process.env.CLAUDESON_URL;
                    if (claudesonUrl) {
                        const response = await fetch(`${claudesonUrl}/health`, { signal: AbortSignal.timeout(2000) }); // 2-second timeout
                        if (response.ok) {
                            healthyProviders.push('Claudeson');
                        }
                    }
                } catch (error) {
                    // console.warn(`Claudeson health check failed: ${error}`);
                }
            } else {
                healthyProviders.push(providerName);
            }
        }
        return healthyProviders;
    }

    static getProvider(name: string): LLMProvider {
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
