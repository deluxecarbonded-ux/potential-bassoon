// Unit tests for the shared free-model route.
//
//   npm run test:router
//
// The live path cannot be tested on demand: OpenRouter allows 50 free requests a day
// across the whole project, and every one of them is spent by the time the suite has
// run twice. So the route is tested here against a stubbed provider instead, which
// costs nothing and - more usefully - can reproduce the cases that are hard to catch
// live: a router that lands on a safety classifier, a model that reasons out loud, a
// completion that is rejected, an upstream 429, and a route that is genuinely exhausted.
//
// Deno is stubbed rather than shimmed through a build step, so this runs the same file
// the edge functions import.
import { readFileSync } from 'node:fs';

globalThis.Deno = { env: { get: () => process.env.OPENROUTER_FREE_MODELS_TEST ?? 'openrouter/free' } };

const { askFree } = await import('../supabase/functions/_shared/router.ts');

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};

// A provider that replies with whatever the next script says, and records what it was
// asked for.
function stubProvider(script) {
  const calls = [];
  let i = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const step = script[Math.min(i++, script.length - 1)];
    if (step.status && step.status !== 200) {
      return { ok: false, status: step.status, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: step.model ?? body.model,
        choices: [{ message: { content: step.content }, finish_reason: step.finish_reason ?? 'stop' }],
      }),
    };
  };
  return calls;
}
const realFetch = globalThis.fetch;

async function expectThrows(label, script, opts) {
  // Installs its own stub. Without this it silently reused whatever the previous
  // section left behind, which made a "this must fail" assertion pass on a leftover
  // success - the exact failure mode this file exists to prevent.
  stubProvider(script);
  let threw = null;
  try { await askFree('test-key', [{ role: 'user', content: 'x' }], { deadlineMs: 400, ...opts }); }
  catch (e) { threw = e; }
  ok(label, !!threw && /free routes/i.test(String(threw && threw.message)), threw ? String(threw.message) : 'returned a result');
}

try {
  console.log('THE HAPPY PATH');
  let calls = stubProvider([{ content: 'a good answer' }]);
  const first = await askFree('test-key', [{ role: 'user', content: 'x' }]);
  ok('the first usable answer is returned', first.text === 'a good answer', first.text);
  ok('one request was made', calls.length === 1, `${calls.length}`);
  ok('the model that actually served it is reported', !!first.model, first.model);

  console.log('\nA ROUTER THAT LANDS ON A MODEL THAT CANNOT ANSWER');
  // openrouter/free samples whatever is free, so the same call can be served by a
  // safety classifier, then a code model, then something usable.
  calls = stubProvider([
    { model: 'some/content-safety-guard', content: 'I cannot help with that.' },
    { model: 'vendor/north-mini-code-v2', content: 'def main(): pass' },
    { model: 'vendor/usable-model', content: 'the real answer' },
  ]);
  const salvaged = await askFree('test-key', [{ role: 'user', content: 'x' }]);
  ok('the unusable models are skipped and a later one is used', salvaged.text === 'the real answer', salvaged.model);
  ok('three models were tried', calls.length === 3, `${calls.length}`);

  console.log('\nRATE LIMITING AND UPSTREAM FAILURES');
  calls = stubProvider([{ status: 429 }, { status: 503 }, { content: 'recovered' }]);
  const recovered = await askFree('test-key', [{ role: 'user', content: 'x' }]);
  ok('a 429 falls through to the next model', recovered.text === 'recovered');
  ok('both failures were tried before the success', calls.length === 3, `${calls.length}`);
  await expectThrows('a route that is exhausted reports it', [{ status: 429 }]);

  console.log('\nEMPTY AND UNUSABLE COMPLETIONS');
  await expectThrows('an empty completion is not a result', [{ content: '' }]);
  await expectThrows('whitespace is not a result', [{ content: '   \n  ' }]);
  calls = stubProvider([{ content: 'too short' }, { content: 'long enough to be accepted' }]);
  const accepted = await askFree('test-key', [{ role: 'user', content: 'x' }], { accept: (t) => t.length > 12 });
  ok('a rejection moves on to the next model', accepted.text === 'long enough to be accepted');
  ok('the rejected one was still requested', calls.length === 2, `${calls.length}`);
  await expectThrows('every completion rejected is an error', [{ content: 'no' }], { accept: () => false });

  console.log('\nPAID MODELS ARE REFUSED');
  process.env.OPENROUTER_FREE_MODELS_TEST = 'openai/gpt-4o,anthropic/claude-opus-4,openrouter/free';
  calls = stubProvider([{ content: 'only the free one should be asked' }]);
  await askFree('test-key', [{ role: 'user', content: 'x' }]);
  const paid = calls.filter((c) => !String(c.model).endsWith(':free') && c.model !== 'openrouter/free');
  ok('no paid model is ever requested', paid.length === 0, paid.map((p) => p.model).join(', ') || 'none requested');
  ok('the free router was used instead', calls.every((c) => c.model === 'openrouter/free'), calls.map((c) => c.model).join(', '));

  process.env.OPENROUTER_FREE_MODELS_TEST = 'vendor/only-a-free-one:free';
  calls = stubProvider([{ content: 'ok' }]);
  await askFree('test-key', [{ role: 'user', content: 'x' }]);
  ok('a named :free model is allowed through', calls[0].model === 'vendor/only-a-free-one:free', calls[0].model);

  console.log('\nTHE REQUEST THE PROVIDER RECEIVES');
  process.env.OPENROUTER_FREE_MODELS_TEST = 'openrouter/free';
  calls = stubProvider([{ content: 'ok' }]);
  await askFree('test-key', [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hello' }], {
    maxTokens: 1234, temperature: 0.1, reasoning: { effort: 'none' },
  });
  const sent = calls[0];
  ok('max_tokens is passed through', sent.max_tokens === 1234, String(sent.max_tokens));
  ok('temperature is passed through', sent.temperature === 0.1, String(sent.temperature));
  ok('reasoning is passed through so a reasoning model does not narrate', sent.reasoning?.effort === 'none', JSON.stringify(sent.reasoning));
  ok('both messages are sent in order', sent.messages.length === 2 && sent.messages[0].role === 'system');
  const noReasoning = stubProvider([{ content: 'ok' }]);
  await askFree('test-key', [{ role: 'user', content: 'x' }], {});
  ok('reasoning is omitted when not asked for', noReasoning[0].reasoning === undefined, JSON.stringify(noReasoning[0].reasoning));

  console.log('\nTHE DEADLINE');
  // The deadline bounds SLOW attempts, not fast failures. Forty instant 429s finish in
  // milliseconds and there is nothing to cut off, so the stub has to be slow for this to
  // mean anything - which is also the real case: a model that hangs rather than errors
  // is what would otherwise hold the request open past the edge timeout.
  process.env.OPENROUTER_FREE_MODELS_TEST = Array.from({ length: 40 }, (_, i) => `vendor/m${i}:free`).join(',');
  globalThis.fetch = async () => {
    await new Promise((r) => setTimeout(r, 120));
    return { ok: false, status: 502, json: async () => ({}) };
  };
  const started = Date.now();
  let bounded = null;
  try { await askFree('test-key', [{ role: 'user', content: 'x' }], { deadlineMs: 300, attemptMs: 5000 }); }
  catch (e) { bounded = e; }
  const elapsed = Date.now() - started;
  ok('a slow route is abandoned at the deadline', !!bounded, bounded ? String(bounded.message) : 'returned a result');
  ok('it gave up near the deadline rather than trying all 40', elapsed >= 250 && elapsed < 3000, `${elapsed}ms against a 300ms deadline`);
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
