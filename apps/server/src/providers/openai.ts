import { request } from 'undici';
import type { ModelProvider } from '../types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  provider: ModelProvider;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  /** ms, client-side cap. Default 300_000 (5 min). */
  timeoutMs?: number;
  /** Extra retry attempts on 408/425/429/5xx/network errors. Default 2 (= up to 3 tries). */
  maxRetries?: number;
  /** Initial backoff in ms; each attempt doubles it. Default 1500. */
  retryBaseMs?: number;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildUrl(baseUrl: string, pathSuffix: string) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  const suffix = pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`;
  if (trimmed.endsWith('/v1') || trimmed.endsWith('/v2') || /\/v\d+$/.test(trimmed)) {
    return `${trimmed}${suffix}`;
  }
  return `${trimmed}/v1${suffix}`;
}

function buildHeaders(provider: ModelProvider) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }
  if (provider.headers) {
    for (const [k, v] of Object.entries(provider.headers)) {
      headers[k] = v;
    }
  }
  return headers;
}

export async function chatCompletion(input: ChatInput): Promise<string> {
  const {
    provider,
    messages,
    temperature = 0.8,
    maxTokens,
    model,
    timeoutMs = 300_000,
    maxRetries = 2,
    retryBaseMs = 1500,
  } = input;

  const url = buildUrl(provider.baseUrl, '/chat/completions');
  const body = JSON.stringify({
    model: model || provider.model,
    messages,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    stream: false,
  });
  const headers = buildHeaders(provider);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await request(url, {
        method: 'POST',
        headers,
        body,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      const text = await res.body.text();

      if (res.statusCode >= 400) {
        const err = new Error(`Model API error ${res.statusCode}: ${text.slice(0, 800)}`);
        (err as any).statusCode = res.statusCode;
        if (RETRYABLE_STATUS.has(res.statusCode) && attempt < maxRetries) {
          lastError = err;
          const wait = retryBaseMs * Math.pow(2, attempt);
          console.warn(
            `[chatCompletion] HTTP ${res.statusCode}, retry ${attempt + 1}/${maxRetries} in ${wait}ms`
          );
          await sleep(wait);
          continue;
        }
        throw err;
      }

      try {
        const json = JSON.parse(text);
        const choice = json.choices?.[0];
        const content = choice?.message?.content;
        if (typeof content !== 'string') {
          throw new Error(`Unexpected response shape: ${text.slice(0, 400)}`);
        }
        return content;
      } catch (e: any) {
        throw new Error(`Failed to parse model response: ${e?.message || e}`);
      }
    } catch (e: any) {
      // Retry on network-level failures (reset, timeout, DNS blip, etc.)
      const statusCode = e?.statusCode;
      const code: string | undefined = e?.code || e?.cause?.code;
      const isNetwork =
        !statusCode &&
        (code === 'UND_ERR_HEADERS_TIMEOUT' ||
          code === 'UND_ERR_BODY_TIMEOUT' ||
          code === 'UND_ERR_CONNECT_TIMEOUT' ||
          code === 'UND_ERR_SOCKET' ||
          code === 'ECONNRESET' ||
          code === 'ECONNREFUSED' ||
          code === 'ETIMEDOUT' ||
          code === 'EAI_AGAIN');

      if (isNetwork && attempt < maxRetries) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const wait = retryBaseMs * Math.pow(2, attempt);
        console.warn(
          `[chatCompletion] network error ${code || e?.message}, retry ${attempt + 1}/${maxRetries} in ${wait}ms`
        );
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }

  throw lastError ?? new Error('chatCompletion exhausted retries');
}

export async function testConnection(provider: ModelProvider): Promise<{ ok: boolean; message: string }> {
  try {
    const reply = await chatCompletion({
      provider,
      messages: [
        { role: 'system', content: 'You are a connectivity probe. Reply with OK.' },
        { role: 'user', content: 'ping' },
      ],
      temperature: 0,
      maxTokens: 8,
    });
    return { ok: true, message: reply.trim().slice(0, 200) || 'OK' };
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) };
  }
}
