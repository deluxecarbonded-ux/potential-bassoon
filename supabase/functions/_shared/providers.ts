// Every free model provider this project can use, and how to talk to it.
//
// The brief was "unlimited free AI with no quota and no rate limits". That does not
// exist, and this file is where that is made concrete rather than argued about. Every
// provider below caps something, and the caps are the real design constraint:
//
//   OpenRouter   50 requests/day on the free tier. 1000/day once $10 of credits exist.
//   Groq         30 requests/minute, 6k-30k tokens/minute, 1000-14400/day by model.
//   Cerebras     30 rpm, 60k tpm, 1M tokens/day - but as of 2026 it requires a verified
//                payment method and the allowance is 30-day credits, so it is opt-in
//                and never assumed.
//   Gemini       10-15 rpm, 250k+ tpm, 250-1500/day, and the allowance is PER MODEL -
//                a key can be listed for a model that is allocated nothing at all.
//   Mistral      roughly 1 request/second and a monthly token allowance.
//
// So the honest answer to "unlimited" is: spread the load. One provider at 50/day
// becomes several thousand a day across four or five, and when one is spent the others
// carry it. That is what this file and router.ts do - not a claim of unlimited, but the
// largest honest aggregate available for nothing.
//
// Two request shapes are supported, because the providers do not agree:
//   'openai'  the /chat/completions body almost everyone serves
//   'gemini'  Google's own generateContent body
//
// The per-minute token ceilings matter more than the daily ones for the build agent,
// whose planning requests are 10k-20k tokens: a provider with a 6k tokens/minute
// ceiling cannot serve one at all. That is why each entry carries a realistic token
// weight, and why the router prefers headroom over order.

export type Shape = 'openai' | 'gemini';

export type Provider = {
  id: string;
  /** The environment variable holding the key. A provider with no key is not used. */
  key: string;
  /** Shown in the UI, so "which one served this" is answerable. */
  label: string;
  shape: Shape;
  base: string;
  /** Tried in this order. A provider is skipped if its key is absent or it is spent. */
  models: string[];
  /**
   * A conservative daily request ceiling used for planning only. The provider's real
   * limit is enforced by the provider; this is what the router uses to decide who has
   * the most headroom left. Deliberately under-stated rather than optimistic, because a
   * number that is too high means the router sends work to a provider that is already
   * exhausted and every attempt is wasted.
   */
  dailyRequests: number;
  /**
   * Approximate tokens per request for this provider's likely use here. A provider whose
   * per-minute ceiling is below this cannot serve an agent plan at all, and the router
   * skips it for that workload rather than discovering it through a 429.
   */
  tokensPerRequest: number;
  /** Free without a payment method. */
  noCard: boolean;
  /** What the limit actually is, shown to the user rather than paraphrased away. */
  limit: string;
};

/**
 * Ordered by how much they can carry, best first, so the default path is the one with
 * the most headroom rather than whichever happens to be configured first.
 */
export const PROVIDERS: Provider[] = [
  {
    id: 'google',
    key: 'GOOGLE_AI_API_KEY',
    label: 'Google AI Studio',
    shape: 'gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta/models',
    // The free allowance is per model, and a key can be allocated nothing for a model
    // it is nonetheless listed for. Flash is the one with the widest free allocation.
    models: ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
    dailyRequests: 1200,
    tokensPerRequest: 4000,
    noCard: true,
    limit: '10-15 requests/minute, 250k+ tokens/minute, 250-1500 a day, per model',
  },
  {
    id: 'cerebras',
    key: 'CEREBRAS_API_KEY',
    label: 'Cerebras',
    shape: 'openai',
    base: 'https://api.cerebras.ai/v1',
    // Its catalogue has been pruned repeatedly, so more than one id is listed and a
    // missing one is a dead attempt rather than a failure.
    models: ['gpt-oss-120b', 'llama-3.3-70b', 'zai-glm-4.7'],
    dailyRequests: 2000,
    tokensPerRequest: 6000,
    noCard: false,
    limit: '30 requests/minute, 60k tokens/minute, 1M tokens/day. Needs a verified card; the free allowance is 30-day credits.',
  },
  {
    id: 'groq',
    key: 'GROQ_API_KEY',
    label: 'Groq',
    shape: 'openai',
    base: 'https://api.groq.com/openai/v1',
    // The 8b model has a far higher request ceiling than the 70b, which is the honest
    // reason it is listed first: a daily budget you can never reach is not a budget.
    models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'gpt-oss-120b', 'qwen3-32b'],
    dailyRequests: 1000,
    tokensPerRequest: 5000,
    noCard: true,
    limit: '30 requests/minute, 6k-30k tokens/minute, 1000-14400 a day by model',
  },
  {
    id: 'openrouter',
    key: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    shape: 'openai',
    base: 'https://openrouter.ai/api/v1',
    // The router id samples a different free model per call, which is why a single entry
    // is worth several: one call can be served by a safety classifier and the next by a
    // usable model. The named ids are a fallback for when the router is down.
    models: ['openrouter/free', 'qwen/qwen3.8-27b:free', 'google/gemma-4-31b-it:free'],
    dailyRequests: 50,
    tokensPerRequest: 4000,
    noCard: true,
    limit: '50 requests/day free. 1000/day once $10 of credits exist.',
  },
  {
    id: 'mistral',
    key: 'MISTRAL_API_KEY',
    label: 'Mistral',
    shape: 'openai',
    base: 'https://api.mistral.ai/v1',
    models: ['mistral-small-latest', 'open-mistral-nemo'],
    dailyRequests: 500,
    tokensPerRequest: 3000,
    noCard: true,
    limit: 'about 1 request/second and a monthly token allowance',
  },
];

/** The providers that have a key in this deployment. */
export function configured(): Provider[] {
  return PROVIDERS.filter((p) => {
    try { return !!Deno.env.get(p.key); } catch { return false; }
  });
}

export function providerById(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * The body for one attempt. Providers disagree about shape, so the translation lives
 * here rather than being repeated at each call site.
 */
export function buildBody(
  p: Provider,
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts: { maxTokens: number; temperature: number; reasoning?: { effort: string } },
): { url: string; init: RequestInit } {
  if (p.shape === 'gemini') {
    // Gemini splits system text out of the messages and wants "parts".
    const system = messages.find((m) => m.role === 'system')?.content || '';
    const rest = messages.filter((m) => m.role !== 'system');
    return {
      url: `${p.base}/${model}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get(p.key) as string },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: rest.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: opts.maxTokens, temperature: opts.temperature },
        }),
      },
    };
  }
  return {
    url: `${p.base}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get(p.key)}`,
        ...(p.id === 'openrouter' ? { 'X-Title': 'Exotic', 'HTTP-Referer': Deno.env.get('APP_URL') || 'https://exotic.game' } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        // Only OpenRouter understands this; sending it elsewhere is ignored, but asking
        // for no reasoning is the root-cause fix for a model that narrates its own
        // deliberation into the reply.
        ...(opts.reasoning && p.id === 'openrouter' ? { reasoning: opts.reasoning } : {}),
        messages,
      }),
    },
  };
}

/** The reply text, whichever shape it arrived in. */
export function readText(p: Provider, json: unknown): string {
  if (p.shape === 'gemini') {
    const c = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates;
    const parts = c?.[0]?.content?.parts || [];
    return parts.map((x) => x.text || '').join('');
  }
  return (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content as string || '';
}

/** The id of the model that actually served the reply, for the UI to name. */
export function readModel(p: Provider, json: unknown): string {
  if (p.shape === 'gemini') return (json as { modelVersion?: string })?.modelVersion || 'gemini';
  return (json as { model?: string })?.model || 'unknown';
}
