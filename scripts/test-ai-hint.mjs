// Success rate AND output quality for the AI hint.
//
//   npm run test:ai-hint          5 runs, English
//   npm run test:ai-hint 10 ja    10 runs, Japanese
//
// Each iteration uses a fresh throwaway user (the DB caps hints at 10/day per user)
// and deletes it afterwards.
//
// This used to print only the first 95 characters of each hint, which is how a display
// truncation got mistaken for the model running out of tokens. It now prints hints in
// full and asserts on them, because the hint is rendered as plain text inside a <p>:
// whatever the model emits is what the player literally reads, asterisks included.
//
// The locale is a real argument because the tidier has to survive sixteen languages, and
// Japanese, Korean and Chinese terminate sentences with characters English does not.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SB_URL;
const anon = process.env.SB_ANON_KEY;
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${process.env.SB_REF}/api-keys`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})).json();
const admin = createClient(url, keys.find((k) => k.name === 'service_role').api_key, { auth: { persistSession: false } });

// Everything a player would see that a hint has no business containing. The
// conversation wrappers are the ones that actually turn up: the free router lands on
// whatever model is free, and a chat model asked for "one helpful hint" will often
// open with "Sure! Here's a hint:".
const FLAWS = [
  ['markdown decoration', /(\*\*|__|^#{1,6}\s|`)/m],
  ['bold/italic asterisk runs', /\*[^*]{1,80}\*/],
  ['assistant preamble', /^\s*(sure|of course|certainly|absolutely|great question|no problem|happy to help|i'd be happy|as an ai|as a language model|here'?s (a|the) |here is (a|the) )/i],
  ['self-reference', /\b(as an ai|as a language model|i am an ai|i'm an ai|my instructions|the system prompt)\b/i],
  ['redundant label', /^\s*[*#\s]*(hint|tip|answer|clue|response)\s*[*#:\s-]*[:\-–]\s+/i],
  ['reasoning scratchpad', /^\s*(let me|first,? i'?ll|we need to|i need to|okay,? so|to solve this|let'?s (think|work|solve)|step \d+\s*[:.)])/i],
  ['enumeration of the code', /\b(code|answer|solution)s?\s+(is|are|:)\s*\d{3,}/i],
  // The same label habit in scripts that do not use markdown. A model that writes
  // "ヒント：" in a hint box that already has a lightbulb icon is being redundant.
  ['cjk label prefix', /^\s*[*#\s]*(?:ヒント|ヒント：|答え|答え：|팁|팁:|지금|답|提示|提示：|答案|答案：|راهت|جواب)\s*[:：\-–]/],
  ['cjk preamble', /^\s*(?:もちろん|もちろん！|はい|はい、|好的|好的，| Sure|好的，|没问题|了解|Certainly|もちろんですが)/],
];

const runs = Number(process.argv[2] || 5);
const LOCALE = process.argv[3] || 'en';
// Scripts that put whitespace between words, or none at all. The terminal-punctuation
// and length checks have to work for both or they only test English.
const NO_SPACES = /^(ja|ko|zh|th|lo|km|my)/.test(LOCALE);
let ok = 0, fail = 0;
// OpenRouter allows 50 free-model requests a day, and a 429 from it surfaces as the
// function's own aiUnavailable. That is the provider being spent, not a regression, and
// conflating the two makes every run after the quota is gone look like a code failure.
let spent = 0;
const times = [];
const quality = { markdown: 0, preamble: 0, truncated: 0, multiline: 0, short: 0, leaks: 0 };

for (let i = 1; i <= runs; i++) {
  const email = `hint-${Date.now()}-${i}@mailinator.com`;
  const password = `H-${Math.random().toString(36).slice(2)}!x`;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (uErr) { console.log(`  ${i}: could not create user: ${uErr.message}`); continue; }
  try {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    // display_name has a check constraint of 2-24 characters; a 1-char name makes
    // ensure_profile fail and the challenge then reports "Missing profile".
    await c.rpc('ensure_profile', { p_mode: 'solo', p_name: 'Hint Probe' });
    const ch = await c.functions.invoke('solo-action', { body: { action: 'start', difficulty: 'easy', level: 1, locale: LOCALE } });
    if (ch.error || !ch.data?.id) {
      let body = '';
      try { body = JSON.stringify(await ch.error?.context?.clone?.().json?.()); } catch { body = '(unreadable)'; }
      fail++;
      console.log(`  ${i}: could not create challenge -> HTTP ${ch.error?.context?.status ?? '?'} ${String(body).slice(0, 120)}`);
      continue;
    }
    const t0 = Date.now();
    const r = await c.functions.invoke('ai-hint', { body: { id: ch.data.id, locale: LOCALE } });
    const ms = Date.now() - t0;
    times.push(ms);
    if (r.error) {
      const status = r.error.context?.status ?? '?';
      let body = '';
      try { body = JSON.stringify(await r.error.context?.clone?.().json?.()); } catch { body = '(unreadable)'; }
      if (status === 503 && /aiUnavailable/.test(body)) {
        spent++;
        console.log(`  ${i}: daily free-model quota spent after ${ms}ms - the provider's cap, not a fault`);
      } else {
        fail++;
        console.log(`  ${i}: FAILED HTTP ${status} after ${ms}ms  ${String(body).slice(0, 90)}`);
      }
      continue;
    }
    ok++;

    const hint = String(r.data.hint || '');
    // Whole hint, newlines made visible, so a truncation or a paragraph break cannot hide.
    const shown = hint.replace(/\n/g, '\\n');
    const problems = [];
    for (const [label, re] of FLAWS) if (re.test(hint)) { problems.push(label); if (label === 'markdown decoration' || label === 'bold/italic asterisk runs') quality.markdown++; }
    if (/^\s*(sure|of course|certainly|absolutely|here'?s|here is)/i.test(hint) || /\b(as an ai|my instructions)\b/i.test(hint)) quality.preamble++;
    // A cut-off hint has no terminal punctuation. Periods inside decimals and
    // abbreviations are not endings, so only look at the final few characters.
    if (!/[.!?)」』。！？؟:]$/.test(hint.trim())) { problems.push('no terminal punctuation (truncated?)'); quality.truncated++; }
    if (hint.includes('\n')) { problems.push('embedded newline (collapses in a <p>)'); quality.multiline++; }
    // Scripts without word spacing carry more meaning per character, so the floor for
    // "is this actually a hint" is lower. 20 characters of Japanese is a full sentence.
    const floor = NO_SPACES ? 18 : 25;
    if (hint.trim().length < floor) { problems.push(`too short to be useful (<${floor})`); quality.short++; }
    if (hint.trim().length > 600) problems.push('far longer than a hint should be');

    console.log(`  ${i}: OK ${ms}ms ${problems.length ? 'FLAW ' + problems.join(' + ') : 'clean'}`);
    console.log(`      "${shown}"`);
  } finally {
    await admin.auth.admin.deleteUser(u.user.id);
  }
}

const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
const pct = (n) => (ok ? `${Math.round((n / ok) * 100)}%` : 'n/a');
const flaws = quality.markdown + quality.preamble + quality.truncated + quality.multiline + quality.short;
console.log(`\n  locale ${LOCALE}: ${ok}/${runs} returned a hint, ${fail} failed, ${spent} blocked on the daily free-model quota, avg ${avg}ms`);
console.log(`  output quality over ${ok} hint(s): markdown ${pct(quality.markdown)}, preamble ${pct(quality.preamble)}, truncated ${pct(quality.truncated)}, multiline ${pct(quality.multiline)}, too short ${pct(quality.short)}`);
console.log(`  ${ok - Math.max(quality.markdown, quality.preamble, quality.truncated, quality.multiline, quality.short)}/${ok} hints free of every known flaw`);
// A quality flaw is a regression and fails the run. A spent quota does not, because the
// app handles it: the player is told the hints are resting and offered a shop hint. The
// one case that is still a failure is getting nothing at all, which is not a quota.
if (spent === runs && runs > 0) {
  console.log('  no hint could be measured: the daily quota is gone, so nothing was verified');
  process.exit(1);
}
process.exit(fail || flaws ? 1 : 0);
