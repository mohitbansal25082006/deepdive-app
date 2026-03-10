// src/services/openaiClient.ts
// FIXED: Reads EXPO_PUBLIC_OPENAI_API_KEY (required for Expo client bundle).
// Variables without EXPO_PUBLIC_ prefix are invisible to the React Native app.

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: { message: { content: string } }[];
  error?: { message: string; type: string };
}

function getApiKey(): string {
  // Must be EXPO_PUBLIC_ prefixed for Expo to bundle it into the app
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error(
      'EXPO_PUBLIC_OPENAI_API_KEY is not set.\n' +
      'Add it to your .env file and restart with: npx expo start --clear'
    );
  }
  return key.trim();
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  } = {}
): Promise<string> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
  };

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(`Network error reaching OpenAI: ${String(networkErr)}`);
  }

  const data: OpenAIResponse = await response.json();

  // Surface OpenAI API-level errors (wrong key, quota exceeded, etc.)
  if (!response.ok || data.error) {
    const errMsg = data.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 401) {
      throw new Error(`Invalid OpenAI API key. Check EXPO_PUBLIC_OPENAI_API_KEY in your .env file.`);
    }
    if (response.status === 429) {
      throw new Error(`OpenAI rate limit or quota exceeded. Check your OpenAI billing at platform.openai.com.`);
    }
    throw new Error(`OpenAI API error: ${errMsg}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  return content;
}

export async function chatCompletionJSON<T>(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const raw = await chatCompletion(messages, { ...options, jsonMode: true });

  // Strip markdown code fences if the model adds them despite json mode
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `Failed to parse OpenAI JSON. Raw response: ${cleaned.slice(0, 300)}`
    );
  }
}