// Unit test for the hint tidier, run against output the free router actually produced.
//
//   npm run test:hint-tidy
//
// test:ai-hint.mjs measures quality live, but the free router is a lottery: it may not
// produce a single bad hint in a run, which makes a regression invisible. The cases
// below are the real responses captured from six live runs, so the tidier is pinned to
// the failures that actually occur rather than to ones imagined.
//
// The tidier is imported from the Deno module directly rather than copied, so there is
// one implementation and this test cannot drift away from it. Node strips the types
// with --experimental-strip-types; Deno runs the same file unstripped.
import { tidyHint } from '../supabase/functions/_shared/hint.ts';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};
const show = (s) => JSON.stringify(s.length > 150 ? s.slice(0, 150) + '...' : s);

// Each case is [what the model did, what came back, what must be true of it].
/** @type {Array<[string,string,(out:string)=>boolean]>} */
const CASES = [
  ['already-good hint passes through untouched',
    'Subtract the known addend from each sum; the difference is the missing single-digit value.',
    (o) => o === 'Subtract the known addend from each sum; the difference is the missing single-digit value.'],

  ['thinking-process dump is refused, not returned',
    `Here's a thinking process:\n\n1.  **Analyze User Input:**\n   - User provides a JSON-like object with \`hint\`, \`lines\`, \`locale\`.\n   - \`locale\`: "en"\n\n2.  **Identify Constraints from System Prompt:**\n   - "You are a concise puzzle tutor in Exotic."\n   - "Reply only in language en."`,
    (o) => o === ''],

  ['system-prompt echo is refused',
    `The system prompt says: "You are a concise puzzle tutor in Exotic. Reply only in language en. Give one helpful hint in at most 45 words."\n\nSo I need to give a hint in English.`,
    (o) => o === ''],

  ['self-directed reasoning is refused',
    `The user wants a hint for solving a puzzle. The puzzle has four equations:\n\n1. 3 + ? = 7\n2. 3 + ? = 7\n3. 4 + ? = 4\n4. 4 + ? = 4\n\nThe hint should explain the method.`,
    (o) => o === ''],

  ['scratchpad is mined for the hint it contains',
    `We need to give a hint: "Work backwards using inverse operations." Already given. So maybe: "Subtract 4 from each result to find the missing digit; if result >9, consider carry from addition." But each equation is simple addition. So digits: 3,1,9,1. But we must not give answer. Provide hint: "For each line, subtract 4 from the sum; if the sum is two-digit, the missing digit is the units digit after borrowing"`,
    (o) => /^for each line, subtract 4 from the sum/i.test(o)],

  ['the disclosed code is dropped even when the hint is kept',
    `We need to give a hint. So digits: 3,1,9,1. Provide hint: "Subtract 4 from each sum to find the missing digit."`,
    (o) => /subtract 4 from each sum/i.test(o) && !/\b3,1,9,1\b/.test(o)],

  ['truncation at the token budget is cut back to the last whole sentence',
    'Subtract the known addend from the given sum. If the sum is smaller than the addend, remember you may',
    (o) => o === 'Subtract the known addend from the given sum.'],

  ['a fragment with no full stop is kept rather than thrown away',
    'Subtract the known addend from the given sum; if the sum is smaller, remember you may',
    (o) => /subtract the known addend from the given sum/i.test(o) && o.length > 40],

  ['markdown bold is unwrapped',
    '**Hint:** To find each missing digit, subtract the known number from the total.',
    (o) => o === 'To find each missing digit, subtract the known number from the total.'],

  ['a leading label alone is unwrapped',
    '**Final Hint:**\n\nLook at the total of each line and work backwards.',
    (o) => /look at the total of each line/i.test(o) && !/\*/.test(o)],

  ['chatbot openers are removed',
    "Sure! Here's a hint: subtract the total from the sum to isolate the missing value.",
    (o) => /^subtract the total from the sum/i.test(o)],

  ['a conversational opener plus a label is removed',
    'Of course! Happy to help. Tip - Check each line from right to left.',
    (o) => /^check each line from right to left/i.test(o)],

  ['newlines are collapsed so a <p> does not run words together',
    'Subtract the known addend from each sum.\nWork from the top line downwards.',
    (o) => !o.includes('\n') && /work from the top line downwards/i.test(o)],

  ['list scaffolding is stripped from a bulleted hint',
    '- Subtract the addend from the total\n- The result is the missing digit',
    (o) => !/^\s*-\s/m.test(o) && /subtract the addend from the total/i.test(o)],

  ['surrounding quotes are unwrapped',
    '"Work backwards from the total of each line."',
    (o) => o === 'Work backwards from the total of each line.'],

  ['an empty or non-string reply is empty, never the string "undefined"',
    '', (o) => o === ''],
];

for (const [label, input, check] of CASES) {
  let out = '';
  try { out = tidyHint(input); } catch (e) { out = 'THREW: ' + String(e); }
  ok(label, typeof out === 'string' && check(out), show(out));
}

// Non-strings and junk must never crash the caller or leak a placeholder.
ok('null is empty', tidyHint(null) === '');
ok('undefined is empty', tidyHint(undefined) === '');
ok('a number is empty', tidyHint(42) === '');
ok('an object is empty', tidyHint({ hint: 'x' }) === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
