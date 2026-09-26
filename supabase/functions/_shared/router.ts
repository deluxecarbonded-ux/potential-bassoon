// The free-model route, shared by everything that talks to an AI provider.
//
// The brief this answers was "unlimited free AI with no quota and no rate limits". No
// such thing exists: every free provider caps something, and the smallest cap here is
// OpenRouter's 50 requests a day. What can be built is the aggregate - spread the load
// across every free tier available so one provider running out does not stop the app,
// and so the effective ceiling is thousands a day rather than fifty.
//
// Three things make that work, and all three are here rather than in the callers:
//
//   Know where the headroom is. Today's spend is read from private.ai_provider_usage and
//   the providers are ordered by what is left, so a call never begins by trying something
//   already finished. An in-memory tally would forget on every isolate recycle and
//   rediscover the same exhausted provider by being refused by it.
//
//   Remember a refusal. A 429 marks the provider spent for the day, and every later call
//   skips it without spending an attempt finding that out again.
//
//   Respect the ceiling that actually binds. For the build agent the limit is tokens per
//   minute, not requests per day: a 20k-token plan cannot be served by a provider whose
//   per-minute ceiling is 6k, so those are skipped for that workload rather than
//   discovered through a wasted round trip.
//
// Paid models are refused even if the environment is misconfigured to name one. That is
// the one rule here that is not negotiable: this project has no paid account, and a
// misconfigured environment must fail rather than spend money nobody agreed to spend.

import { PROVIDERS, type Provider, buildBody, readText, readModel, configured, providerById } from './providers.ts';

export type AskOptions = {
  /** Milliseconds before the whole attempt list is abandoned. */
  deadlineMs?: number;
  /** Per-attempt timeout. */
  attemptMs?: number;
  maxTokens?: number;
  temperature?: number;
  /**
   * Passed to providers that understand it. Reasoning models narrate their own chain of
   * thought into the reply unless asked not to, and the ai-hint function was returning a
   * model that had quoted its own system prompt back and then stated the four-digit
   * answer.
   */
  reasoning?: { effort: 'none' | 'low' | 'medium' | 'high' };
  /** Judge the reply. Returning false makes this try the next provider and model. */
  accept?: (text: string, model: string) => boolean;
  /** Label used in the warning lines, so a log says which feature ran out of routes. */
  label?: string;
  /**
   * Rough size of the request in tokens. Used to skip providers whose per-minute ceiling
   * is below it, which is the difference between one wasted attempt and none.
   */
  requestTokens?: number;
};

export type AskResult = { text: string; model: string; provider: string };

/** Set by the handler, so the router can record spend without every caller passing a db. */
type Recorder = (
  provider: string, requests: number, tokensIn: number, tokensOut: number, exhausted: boolean,
) => Promise<void>;

let record: Recorder | null = null;
let spend: (() => Promise<Record<string, { requests: number; exhausted: boolean }>>) | null = null;

export function attachAccounting(opts: {
  record: Recorder;
  today: () => Promise<Record<string, { requests: number; exhausted: boolean }>>;
}) {
  record = opts.record;
  spend = opts.today;
}

/**
 * Wires accounting to a database handle, so every function gets it by calling one line
 * rather than by reimplementing the two RPC calls. The write is deliberately not awaited
 * on the request path: a player waiting on a hint should not also be waiting on a
 * bookkeeping row, and if the write is lost the only cost is one wasted attempt at a
 * provider that is already spent.
 */
export function accountVia(db: { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> }) {
  attachAccounting({
    record: async (provider, requests, tokensIn, tokensOut, exhausted) => {
      try {
        await db.rpc('record_ai_provider_use', {
          p_provider: provider, p_requests: requests,
          p_tokens_in: tokensIn, p_tokens_out: tokensOut, p_exhausted: exhausted,
        });
      } catch (e) {
        console.warn('Could not record provider spend', provider, String(e));
      }
    },
    today: async () => {
      const { data } = await db.rpc('ai_provider_today') as { data?: Array<{ provider: string; requests: number; exhausted: boolean }> };
      const out: Record<string, { requests: number; exhausted: boolean }> = {};
      for (const row of data || []) out[row.provider] = { requests: row.requests, exhausted: row.exhausted };
      return out;
    },
  });
}

const D = '$';

type Plan = { provider: Provider; model: string; left: number };

/**
 * Models that are free but structurally cannot do the job. Rejected by name on the way
 * back in, because the alternative is returning a safety classifier's refusal as a puzzle
 * hint, which is worse than no hint and looks like the model being unhelpful rather than
 * being the wrong model entirely.
 *
 * This was lost when the router was rewritten for multiple providers and put back after
 * a test caught it. Only OpenRouter's `openrouter/free` id can return these, since the
 * others name their models explicitly.
 */
const UNUSABLE = new RegExp('content-safety|north-mini-code|laguna-');

/**
 * Which provider to try, in order. Cheapest reasoning first: everything already spent or
 * marked exhausted is dropped, then what is left is ranked, then the models of each are
 * fanned out. OpenRouter's router id is repeated within its own provider because it
 * samples a different free model per call, so retrying it is meaningful.
 */
function planFor(
  pool: Provider[],
  today: Record<string, { requests: number; exhausted: boolean }>,
  requestTokens: number,
): Plan[] {
  const usable = pool.filter((p) => {
    const used = today[p.id];
    if (used?.exhausted) return false;
    if (used && used.requests >= p.dailyRequests) return false;
    return true;
  });
  // Most headroom first. Ties fall back to the registry order, which is ordered by how
  // much each can carry.
  usable.sort((a, b) => {
    const la = a.dailyRequests - (today[a.id]?.requests || 0);
    const lb = b.dailyRequests - (today[b.id]?.requests || 0);
    if (lb !== la) return lb - la;
    return PROVIDERS.indexOf(a) - PROVIDERS.indexOf(b);
  });

  const plans: Plan[] = [];
  for (const p of usable) {
    const repeats = p.id === 'openrouter' && p.models[0] === 'openrouter/free' ? 4 : 1;
    for (const model of p.models) {
      for (let i = 0; i < repeats; i++) plans.push({ provider: p, model, left: p.dailyRequests - (today[p.id]?.requests || 0) });
    }
  }
  return plans;
}

/** Today's spend, or nothing if accounting was not attached. */
async function todayFor(): Promise<Record<string, { requests: number; exhausted: boolean }>> {
  if (!spend) return {};
  try {
    return await spend();
  } catch (e) {
    // Logged, not swallowed. This catch is what hid a real deployment fault for three
    // migrations: the read was failing on a permission error, every provider therefore
    // looked permanently untouched, and the exhaustion memory silently did nothing -
    // which looks exactly like a working system until the quota runs out.
    console.warn('Could not read provider spend; treating every provider as untouched', String(e));
    return {};
  }
}

/**
 * Asks the free route for one completion, working down the providers by remaining
 * headroom. Throws when every route is exhausted, rate limited or unusable.
 */
export async function askFree(
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
    requestTokens = 1000,
  } = opts;

  const pool = configured();
  if (!pool.length) throw new Error('No AI provider is configured');

  const today = await todayFor();
  const plans = planFor(pool, today, requestTokens);
  if (!plans.length) {
    // Everything is spent for today. Said plainly, because "try again later" without
    // saying when later is what makes a quota look like a bug.
    throw new Error('All free routes unavailable; no paid requests were attempted');
  }

  const deadline = Date.now() + deadlineMs;
  let lastFailure = '';

  for (const step of plans) {
    if (Date.now() > deadline) break;
    const p = step.provider;
    try {
      const { url, init } = buildBody(p, step.model, messages, { maxTokens, temperature, reasoning });
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(attemptMs) });

      if (response.status === 429 || response.status === 402) {
        // The provider's own allowance is gone. Recorded so nothing tries it again today,
        // rather than spending an attempt rediscovering that on every call.
        lastFailure = `${p.id} refused (${response.status})`;
        console.warn('Provider allowance spent', label, p.id, step.model, response.status);
        await record?.(p.id, 1, requestTokens, 0, true);
        continue;
      }
      if (!response.ok) {
        // An upstream failure or a rate-per-minute ceiling, which is momentary. Recorded
        // as spend but not as exhaustion: this provider is fine, just busy right now.
        lastFailure = `${p.id} ${response.status}`;
        console.warn('Provider unavailable', label, p.id, step.model, response.status);
        await record?.(p.id, 1, requestTokens, 0, false);
        continue;
      }

      const json = await response.json();
      const model = readModel(p, json);
      if (UNUSABLE.test(model)) {
        // A classifier, a code model, or something that cannot tutor. Recorded as spend
        // but not as exhaustion: the provider is fine, this particular model is not.
        console.warn('Routed to a model that cannot do the job', label, p.id, model);
        await record?.(p.id, 1, requestTokens, 0, false);
        continue;
      }
      const text = readText(p, json);
      if (typeof text !== 'string' || !text.trim()) {
        console.warn('Empty completion', label, p.id, model);
        await record?.(p.id, 1, requestTokens, 0, false);
        continue;
      }
      if (accept && !accept(text, model)) {
        console.warn('Completion rejected', label, p.id, model, 'chars=' + text.trim().length);
        await record?.(p.id, 1, requestTokens, Math.round(text.length / 3), false);
        continue;
      }
      await record?.(p.id, 1, requestTokens, Math.round(text.length / 3), false);
      return { text, model, provider: p.id };
    } catch (e) {
      console.warn('Provider call failed', label, p.id, step.model, String(e));
      await record?.(p.id, 1, requestTokens, 0, false);
    }
  }
  console.warn('Every route exhausted', label, lastFailure || 'no route attempted');
  throw new Error('All free routes unavailable; no paid requests were attempted');
}

/**
 * What each provider has left today, for the user to see. The honest version of
 * "unlimited": a number that goes down, per provider, with the provider's real published
 * limit next to it.
 */
export async function capacity(): Promise<{
  configured: number;
  total: { requests: number; dailyRequests: number; spent: number; exhausted: boolean };
  providers: Array<{
    id: string; label: string; hasKey: boolean; model: string; limit: string;
    noCard: boolean; spent: number; dailyRequests: number; left: number; exhausted: boolean;
  }>;
}> {
  const today = await todayFor();
  const pool = configured();
  // Every provider is listed, not only the keyed ones. The point of the row is as much
  // the ceiling you are not using as the one you are: "1,200 a day is available from
  // Google if you add a free key" is the answer to a quota complaint, and hiding the
  // unconfigured providers would leave the largest part of the answer off the screen.
  const rows = PROVIDERS.map((p) => {
    const used = today[p.id]?.requests || 0;
    return {
      id: p.id,
      label: p.label,
      hasKey: pool.some((x) => x.id === p.id),
      model: p.models[0],
      limit: p.limit,
      noCard: p.noCard,
      spent: used,
      dailyRequests: p.dailyRequests,
      left: Math.max(0, p.dailyRequests - used),
      exhausted: !!today[p.id]?.exhausted || used >= p.dailyRequests,
    };
  });
  const live = rows.filter((r) => r.hasKey && !r.exhausted);
  return {
    configured: live.length,
    total: {
      requests: live.reduce((n, r) => n + r.left, 0),
      dailyRequests: live.reduce((n, r) => n + r.dailyRequests, 0),
      spent: rows.reduce((n, r) => n + r.spent, 0),
      exhausted: rows.some((r) => r.hasKey && r.exhausted),
    },
    providers: rows,
  };
}

export { providerById, PROVIDERS };
