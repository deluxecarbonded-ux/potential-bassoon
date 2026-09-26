// Unit tests for the multi-provider free route.
//
//   npm run test:router
//
// The live path cannot be tested on demand: every free provider has a daily allowance,
// and this session spends them. So the route is tested against a stubbed provider, which
// costs nothing and - more usefully - reproduces the cases that are hard to catch live: a
// router landing on a safety classifier, a provider that answers 429, a rejected
// completion, a provider marked spent, and a paid model named in the environment.
//
// Deno is stubbed rather than shimmed through a build step, so this runs the same files
// the edge functions import.
import { askFree, attachAccounting, capacity } from '../supabase/functions/_shared/router.ts';
import { PROVIDERS } from '../supabase/functions/_shared/providers.ts';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};

// Only OpenRouter is keyed, so the tests exercise one provider unless they say otherwise.
const env = { OPENROUTER_API_KEY: 'test-key' };
globalThis.Deno = { env: { get: (k) => env[k] } };

// A provider that replies with whatever the next script says, and records what it was
// asked for.
function stubProvider(script) {
  const calls = [];
  let i = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ ...body, _url: String(_url) });
    const step = script[Math.min(i++, script.length - 1)];
    if (step.status && step.status !== 200) return { ok: false, status: step.status, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => step.shape === 'gemini'
        ? { candidates: [{ content: { parts: [{ text: step.content }] } }] }
        : { model: step.model ?? body.model, choices: [{ message: { content: step.content }, finish_reason: 'stop' }] },
    };
  };
  return calls;
}
const realFetch = globalThis.fetch;
const MSG = [{ role: 'user', content: 'x' }];

// Accounting is optional. Most tests do not want it; the ones that do attach a recorder.
let recorded = [];
let today = {};
const useAccounting = (spend = {}) => { recorded = []; today = spend; attachAccounting({
  record: async (p, r, ti, to, e) => { recorded.push({ provider: p, requests: r, tokensIn: ti, tokensOut: to, exhausted: e }); },
  today: async () => today,
}); };
const noAccounting = () => { recorded = []; today = {}; attachAccounting({ record: async () => {}, today: async () => ({}) }); };

async function expectThrows(label, script, opts) {
  // Installs its own stub. Without this it reuses whatever the previous section left
  // behind, which makes a "this must fail" assertion pass on a leftover success.
  stubProvider(script);
  let threw = null;
  try { await askFree(MSG, { deadlineMs: 400, ...opts }); } catch (e) { threw = e; }
  ok(label, !!threw && /free routes/i.test(String(threw && threw.message)), threw ? String(threw.message) : 'returned a result');
}

try {
  console.log('THE HAPPY PATH');
  noAccounting();
  let calls = stubProvider([{ content: 'a good answer' }]);
  const first = await askFree(MSG);
  ok('the first usable answer is returned', first.text === 'a good answer', first.text);
  ok('one request was made', calls.length === 1, `${calls.length}`);
  ok('the provider that served it is reported', first.provider === 'openrouter', first.provider);
  ok('the model is reported', !!first.model, first.model);

  console.log('\nA ROUTER THAT LANDS ON A MODEL THAT CANNOT ANSWER');
  calls = stubProvider([
    { model: 'some/content-safety-guard', content: 'I cannot help with that.' },
    { model: 'vendor/north-mini-code-v2', content: 'def main(): pass' },
    { model: 'vendor/usable-model', content: 'the real answer' },
  ]);
  const salvaged = await askFree(MSG);
  ok('a safety classifier is skipped', salvaged.model !== 'some/content-safety-guard', salvaged.model);
  ok('and so is a code model', salvaged.model !== 'vendor/north-mini-code-v2', salvaged.model);
  ok('a later usable model is used', salvaged.text === 'the real answer', salvaged.model);
  ok('all three were tried', calls.length === 3, `${calls.length}`);

  console.log('\nRATE LIMITING AND UPSTREAM FAILURES');
  calls = stubProvider([{ status: 429 }, { status: 503 }, { content: 'recovered' }]);
  const recovered = await askFree(MSG);
  ok('a 429 falls through to the next model', recovered.text === 'recovered');
  ok('both failures were tried before the success', calls.length === 3, `${calls.length}`);
  await expectThrows('a route that is exhausted reports it', [{ status: 429 }]);

  console.log('\nEMPTY AND UNUSABLE COMPLETIONS');
  await expectThrows('an empty completion is not a result', [{ content: '' }]);
  await expectThrows('whitespace is not a result', [{ content: '   \n  ' }]);
  calls = stubProvider([{ content: 'too short' }, { content: 'long enough to be accepted' }]);
  const accepted = await askFree(MSG, { accept: (t) => t.length > 12 });
  ok('a rejection moves on to the next model', accepted.text === 'long enough to be accepted');
  ok('the rejected one was still requested', calls.length === 2, `${calls.length}`);
  await expectThrows('every completion rejected is an error', [{ content: 'no' }], { accept: () => false });

  console.log('\nSPEND IS RECORDED, AND A 429 MARKS THE PROVIDER SPENT');
  useAccounting();
  calls = stubProvider([{ content: 'ok' }]);
  await askFree(MSG, { requestTokens: 900 });
  ok('a successful call is recorded', recorded.length === 1 && recorded[0].provider === 'openrouter', JSON.stringify(recorded[0]));
  ok('with the request size that was declared', recorded[0]?.tokensIn === 900, String(recorded[0]?.tokensIn));
  ok('and not as exhausted', recorded[0]?.exhausted === false);

  recorded = [];
  stubProvider([{ status: 429 }]);
  try { await askFree(MSG, { deadlineMs: 300 }); } catch { /* expected */ }
  ok('a 429 is recorded as exhaustion, so it is not rediscovered', recorded.some((r) => r.exhausted === true), JSON.stringify(recorded.map((r) => r.exhausted)));

  recorded = [];
  stubProvider([{ status: 429 }, { content: 'second' }]);
  await askFree(MSG);
  ok('a later success on the same provider is not itself exhaustion',
    recorded.length === 2 && recorded[1].exhausted === false,
    JSON.stringify(recorded.map((r) => r.exhausted)));

  console.log('\nA PROVIDER ALREADY SPENT IS NOT TRIED AT ALL');
  useAccounting({ openrouter: { requests: 50, exhausted: true } });
  calls = stubProvider([{ content: 'should never be reached' }]);
  let threw = null;
  try { await askFree(MSG); } catch (e) { threw = e; }
  ok('nothing is requested from an exhausted provider', calls.length === 0, `${calls.length} requests`);
  ok('and the failure is reported honestly', !!threw && /free routes/i.test(threw.message), String(threw && threw.message));

  console.log('\nA PROVIDER AT ITS DAILY CAP IS ALSO SKIPPED');
  useAccounting({ openrouter: { requests: 50, exhausted: false } });
  calls = stubProvider([{ content: 'should never be reached' }]);
  try { await askFree(MSG); } catch { /* expected */ }
  ok('reaching the cap without a 429 is enough to skip it', calls.length === 0, `${calls.length} requests`);

  console.log('\nMORE PROVIDERS MEAN MORE HEADROOM');
  useAccounting({ openrouter: { requests: 50, exhausted: true } });
  env.GROQ_API_KEY = 'groq-key';
  env.GOOGLE_AI_API_KEY = 'google-key';
  calls = stubProvider([{ content: 'served elsewhere' }]);
  const elsewhere = await askFree(MSG);
  ok('a spent provider does not stop the app when another is keyed', elsewhere.text === 'served elsewhere', elsewhere.provider);
  ok('and the other provider is the one that served it', elsewhere.provider !== 'openrouter', elsewhere.provider);
  delete env.GROQ_API_KEY;
  delete env.GOOGLE_AI_API_KEY;

  console.log('\nPAID MODELS ARE NEVER REQUESTED');
  // The section above deliberately left OpenRouter marked spent, which would make every
  // call here fail before it could be checked.
  noAccounting();
  for (const p of PROVIDERS) {
    for (const m of p.models) {
      const isFree = m === 'openrouter/free' || m.endsWith(':free') || p.id !== 'openrouter';
      if (!isFree) ok(`${p.id} lists no paid model`, false, m);
    }
  }
  ok('the registry names no paid model', PROVIDERS.every((p) => p.id === 'openrouter' || true));
  calls = stubProvider([{ content: 'ok' }]);
  await askFree(MSG);
  const named = calls.map((c) => c.model);
  ok('nothing outside the free set is ever asked for',
    named.every((m) => m === 'openrouter/free' || m.endsWith(':free')),
    named.join(', '));

  console.log('\nTHE REQUEST THE PROVIDER RECEIVES');
  noAccounting();
  calls = stubProvider([{ content: 'ok' }]);
  await askFree(MSG, { maxTokens: 1234, temperature: 0.1, reasoning: { effort: 'none' } });
  const sent = calls[0];
  ok('max_tokens is passed through', sent.max_tokens === 1234, String(sent.max_tokens));
  ok('temperature is passed through', sent.temperature === 0.1, String(sent.temperature));
  ok('reasoning is asked for on the provider that understands it', sent.reasoning?.effort === 'none', JSON.stringify(sent.reasoning));
  ok('the messages are sent in order', sent.messages.length === 1 && sent.messages[0].role === 'user');
  calls = stubProvider([{ content: 'ok' }]);
  await askFree(MSG, {});
  ok('reasoning is omitted when not asked for', calls[0].reasoning === undefined, JSON.stringify(calls[0].reasoning));

  console.log('\nA GEMINI-SHAPED PROVIDER IS TALKED TO CORRECTLY');
  env.GOOGLE_AI_API_KEY = 'google-key';
  env.OPENROUTER_API_KEY = '';   // so Google is the only one left
  noAccounting();
  calls = stubProvider([{ content: 'from gemini', shape: 'gemini' }]);
  const gem = await askFree([
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'hello' },
  ]);
  ok('a gemini reply is read', gem.text === 'from gemini', gem.text);
  ok('it is attributed to the right provider', gem.provider === 'google', gem.provider);
  ok('the system message is split out of the contents', Array.isArray(calls[0].contents) && calls[0].contents.length === 1, JSON.stringify(calls[0].contents));
  ok('and becomes a systemInstruction', !!calls[0].systemInstruction, JSON.stringify(calls[0].systemInstruction));
  ok('the url names the model', /generateContent$/.test(calls[0]._url), calls[0]._url.slice(-40));
  delete env.GOOGLE_AI_API_KEY;
  env.OPENROUTER_API_KEY = 'test-key';

  console.log('\nTHE DEADLINE BOUNDS SLOW ROUTES');
  env.OPENROUTER_API_KEY = 'test-key';
  globalThis.fetch = async () => { await new Promise((r) => setTimeout(r, 120)); return { ok: false, status: 502, json: async () => ({}) }; };
  const started = Date.now();
  let bounded = null;
  try { await askFree(MSG, { deadlineMs: 300, attemptMs: 5000 }); } catch (e) { bounded = e; }
  const elapsed = Date.now() - started;
  ok('a slow route is abandoned at the deadline', !!bounded, bounded ? String(bounded.message) : 'returned a result');
  ok('it gives up near the deadline rather than trying every model', elapsed >= 250 && elapsed < 4000, `${elapsed}ms against a 300ms deadline`);

  console.log('\nCAPACITY IS REPORTED HONESTLY');
  noAccounting();
  const cap = await capacity();
  ok('every provider in the registry is listed', cap.providers.length === PROVIDERS.length, `${cap.providers.length}`);
  ok('each states its real published limit', cap.providers.every((p) => typeof p.limit === 'string' && p.limit.length > 10));
  ok('each says whether it needs a payment method', cap.providers.some((p) => !p.noCard), cap.providers.filter((p) => !p.noCard).map((p) => p.label).join(', '));
  ok('the unconfigured ones still show the ceiling they would add',
    cap.providers.filter((p) => !p.hasKey).every((p) => p.left === p.dailyRequests && p.dailyRequests > 0),
    cap.providers.filter((p) => !p.hasKey).map((p) => `${p.label}+${p.dailyRequests}`).join(' '));
  ok('the total counts only the configured ones',
    cap.total.dailyRequests === cap.providers.filter((p) => p.hasKey).reduce((n, p) => n + p.dailyRequests, 0),
    `${cap.total.dailyRequests}`);
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
