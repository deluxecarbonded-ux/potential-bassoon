// The free-model route, shared by everything that talks to OpenRouter.
//
// The router behind OPENROUTER_FREE_MODELS lands on whatever model happens to be free
// at that moment, which means a call can be served by a safety classifier, a code
// model, or a reasoning model that spends the whole token budget narrating its own
// chain of thought and returns nothing usable. None of that is knowable in advance, so
// this asks repeatedly, rejects the answers that cannot be used, and gives up with an
// error the caller can turn into a player-facing message.
//
// Paid models are refused even if the environment is misconfigured to name one. That
// is the one rule here that is not negotiable: this project has no paid account, and a
// misconfigured environment must fail rather than spend money nobody agreed to spend.

// Models that are free but structurally cannot do the job. Rejected by name on the way
// back in, because the alternative is returning a nonsense hint or a nonsense patch.
const UNUSABLE = /content-safety|north-mini-code|laguna-/;

export type AskOptions = {
  /** Milliseconds before the whole attempt list is abandoned. */
  deadlineMs?: number;
  /** Per-attempt timeout. */
  attemptMs?: number;
  /** Ceiling on the completion. Raise it for work that legitimately needs room. */
  maxTokens?: number;
  /** Sampling temperature. Left low by default; patch generation wants it lower still. */
  temperature?: number;
  /**
   * Passed straight through to the provider. Reasoning models narrate their chain of
   * thought into `content` unless asked not to, and the ai-hint function was returning
   * a model that had quoted its own system prompt back and then stated the four-digit
   * answer. Asking for none is the root-cause fix.
   */
  reasoning?: { effort: 'none' | 'low' | 'medium' | 'high' };
  /** Judge the reply. Returning false makes this try the next model. */
  accept?: (text: string, model: string) => boolean;
  /** Label used in the warning lines, so a log says which feature ran out of routes. */
  label?: string;
};

export type AskResult = { text: string; model: string };

/**
 * Asks the free route for one completion, retrying across the configured models.
 * Throws when every route is exhausted, rate limited or unusable.
 */
export async function askFree(
  key: string,
  messages: Array<{ role: string; content: string }>,
  opts: AskOptions = {},
): Promise<AskResult> {
  const {
    deadlineMs = 55000,
    attemptMs = 20000,
    maxTokens = 260,
    temperature = 0.45,
    reasoning,
    accept,
    label = 'request',
  } = opts;

  const configured = (Deno.env.get('OPENROUTER_FREE_MODELS')
    || 'openrouter/free,meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-4b:free')
    .split(',').map((s) => s.trim())
    .filter((m) => m === 'openrouter/free' || m.endsWith(':free'));

  // openrouter/free samples a different model on every call, so retrying it is
  // meaningful: in practice about half of all calls land on a model that cannot answer.
  // The named models are rate limited while the router is up, so each is tried once and
  // the router is retried instead.
  const attempts: string[] = [];
  for (const m of configured) {
    if (m === 'openrouter/free') { for (let i = 0; i < 5; i++) attempts.push(m); }
    else attempts.push(m);
  }

  const deadline = Date.now() + deadlineMs;
  for (const model of attempts) {
    if (Date.now() > deadline) break;
    try {
      const body: Record<string, unknown> = { model, temperature, max_tokens: maxTokens, messages };
      if (reasoning) body.reasoning = reasoning;
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(attemptMs),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Title': 'Exotic',
          'HTTP-Referer': Deno.env.get('APP_URL') || 'https://exotic.game',
        },
        body: JSON.stringify(body),
      });
      // Fall through immediately on rate limiting, unavailable models and upstream
      // failures rather than surfacing them, because the next model may well work.
      if (!response.ok) { console.warn('Free model unavailable', label, model, response.status); continue; }

      const result = await response.json();
      if (UNUSABLE.test(result?.model || '')) {
        console.warn('Routed to a non-tutoring model', label, result.model);
        continue;
      }
      const text = result?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        console.warn('Empty completion', label, result?.model, result?.choices?.[0]?.finish_reason);
        continue;
      }
      if (accept && !accept(text, result.model)) {
        console.warn('Completion rejected', label, result.model, 'chars=' + text.trim().length);
        continue;
      }
      return { text, model: result.model };
    } catch (e) {
      console.warn('Free model failed', label, model, String(e));
    }
  }
  throw new Error('All free routes unavailable; no paid requests were attempted');
}

/** The key, or a thrown error the client can explain. */
export function openRouterKey(): string {
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('OpenRouter is not configured');
  return key;
}
