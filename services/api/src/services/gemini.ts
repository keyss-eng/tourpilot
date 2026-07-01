// ---------------------------------------------------------------------------
// Provider-agnostic LLM caller.
//
// Switch providers WITHOUT touching code — just set env vars:
//   AI_PROVIDER = "cloudflare" (default) | "gemini" | "groq"
//   AI_MODEL    = optional model override for the chosen provider
//
// Defaults to Cloudflare Workers AI because it needs NO external API key
// (built-in `env.AI` binding) and has a free daily allowance.
//
// Every provider returns ALREADY-PARSED JSON (array or object); pipeline.ts
// then normalises it into the tour-steps array.
// ---------------------------------------------------------------------------

const DEFAULT_MODELS = {
  // Valid Cloudflare Workers AI model id (the plain "llama-3.3-70b-instruct"
  // does NOT exist — the 3.3 build is the fp8-fast variant). Swap to
  // "@cf/meta/llama-3.1-8b-instruct" via AI_MODEL for a faster/cheaper option.
  cloudflare: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
} as const;

// Normalised token usage returned alongside every LLM response so callers can
// log cost / billing. Any field may be 0 if the provider didn't report it.
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LLMResult = { data: any; usage: TokenUsage };

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

function normalizeUsage(input?: number, output?: number, total?: number): TokenUsage {
  const i = Number(input) || 0;
  const o = Number(output) || 0;
  const t = Number(total) || i + o;
  return { inputTokens: i, outputTokens: o, totalTokens: t };
}

/** Strip markdown fences / stray prose and JSON.parse the result. */
function parseJsonLoose(text: string): any {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}

// ─── Cloudflare Workers AI (default — no API key needed) ─────────────────────
async function callCloudflare(system: string, user: string, env: any, model?: string): Promise<LLMResult> {
  if (!env.AI || typeof env.AI.run !== 'function') {
    throw new Error('Cloudflare Workers AI binding "AI" not configured. Add [ai] binding in wrangler.toml or set AI_PROVIDER.');
  }
  const result: any = await env.AI.run(model || DEFAULT_MODELS.cloudflare, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    // Workers AI defaults to a tiny output budget (~256 tokens), which truncates
    // a multi-step tour JSON mid-string ("Unterminated string in JSON"). Give it
    // enough room to finish the array.
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  const u = result?.usage || {};
  const usage = normalizeUsage(u.prompt_tokens, u.completion_tokens, u.total_tokens);

  // Workers AI returns { response: string | object }; some models return the
  // string directly.
  const raw = result && typeof result === 'object' && 'response' in result
    ? (result as any).response
    : result;
  if (raw && typeof raw === 'object') return { data: raw, usage };
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('Empty response from Cloudflare Workers AI');
  }
  return { data: parseJsonLoose(raw), usage };
}

// ─── Groq (free tier, very fast — needs GROQ_API_KEY) ────────────────────────
async function callGroq(system: string, user: string, env: any, model?: string): Promise<LLMResult> {
  if (!env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set. Run: wrangler secret put GROQ_API_KEY');
  }
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.groq,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API Error [${response.status}]: ${await response.text()}`);
  }
  const data = (await response.json()) as any;
  const text: string | undefined = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Malformed response from Groq API');
  const u = data.usage || {};
  const usage = normalizeUsage(u.prompt_tokens, u.completion_tokens, u.total_tokens);
  return { data: parseJsonLoose(text), usage };
}

// ─── Google Gemini (original — needs GEMINI_API_KEY) ─────────────────────────
async function callGemini(
  system: string,
  user: string,
  apiKey: string,
  model?: string,
  retries = 3 // 3 attempts: 1 initial + 2 retries on 429/503
): Promise<LLMResult> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set. Run: wrangler secret put GEMINI_API_KEY');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODELS.gemini}:generateContent`;

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.2,
      response_mime_type: 'application/json',
    },
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
    });

    // Retry on rate-limit / service unavailable — but not on the last attempt
    if ((response.status === 503 || response.status === 429) && attempt < retries) {
      const waitSeconds = attempt * 2;
      console.warn(`[Gemini] ${response.status} on attempt ${attempt}. Retrying in ${waitSeconds}s...`);
      await new Promise(r => setTimeout(r, waitSeconds * 1000));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Gemini API Error [${response.status}]: ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    const textResponse: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) throw new Error('Malformed response from Gemini API');
    const m = data.usageMetadata || {};
    const usage = normalizeUsage(m.promptTokenCount, m.candidatesTokenCount, m.totalTokenCount);
    return { data: parseJsonLoose(textResponse), usage };
  }

  throw new Error(`Gemini API failed after ${retries} attempts`);
}

// ─── Public entry point — dispatches to the configured provider ──────────────
export async function callLLM(
  system: string,
  user: string,
  env: any,
  retries = 2
): Promise<LLMResult> {
  const provider = String(env.AI_PROVIDER || 'cloudflare').toLowerCase();
  const model: string | undefined = env.AI_MODEL;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (provider === 'gemini') return await callGemini(system, user, env.GEMINI_API_KEY, model);
      if (provider === 'groq') return await callGroq(system, user, env, model);
      // default
      return await callCloudflare(system, user, env, model);
    } catch (err) {
      console.warn(`[LLM:${provider}] attempt ${attempt}/${retries} failed:`, err);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
  throw new Error(`callLLM (${provider}) failed after ${retries} attempts`);
}

// The provider/model actually used for this env — so billing rows can record it
// without re-deriving the dispatch logic.
export function resolveProviderModel(env: any): { provider: string; model: string } {
  const provider = String(env.AI_PROVIDER || 'cloudflare').toLowerCase();
  const model = env.AI_MODEL
    || (DEFAULT_MODELS as any)[provider]
    || DEFAULT_MODELS.cloudflare;
  return { provider, model };
}

// Rough provider cost in micro-USD (1e-6 USD) per 1M tokens → our internal cost.
// Cloudflare's free allowance ≈ 0; Gemini Flash & Groq Llama are cheap. These are
// editable estimates; client billing is "per tour" and does NOT depend on these.
const COST_PER_M_TOKENS_USD: Record<string, { in: number; out: number }> = {
  cloudflare: { in: 0, out: 0 },
  gemini: { in: 0.075, out: 0.30 },
  groq: { in: 0.59, out: 0.79 },
};

export function estimateProviderCostMicroUsd(provider: string, usage: TokenUsage): number {
  const rate = COST_PER_M_TOKENS_USD[provider] || COST_PER_M_TOKENS_USD.cloudflare;
  const usd = (usage.inputTokens / 1_000_000) * rate.in + (usage.outputTokens / 1_000_000) * rate.out;
  return Math.round(usd * 1_000_000); // → micro-USD
}

// Backwards-compatible export (kept in case other modules import it).
export { callGemini };
