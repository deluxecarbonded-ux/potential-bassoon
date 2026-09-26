// Unit test for the on-device hint gate.
//
//   npm run test:local-ai
//
// A hint that contains the four-digit code is not a hint, it is the answer, and an
// answer ends the puzzle instead of unblocking it. A 1.5B model is far more likely to
// ignore "do not disclose a digit of the code" than a hosted frontier model is, so the
// gate in front of it is the safety-critical part of the feature, and it is the part
// that no live test can exercise: WebGPU is not available in CI, and asking a real
// model to misbehave on demand is not a test, it is a coin flip. So the gate is pinned
// here instead, against the shapes a small model actually produces.
//
// The module is imported directly rather than copied, so there is one implementation
// and this test cannot drift away from it. Node strips the types with
// --experimental-strip-types. Importing it does not load the model: the WebLLM import
// is dynamic and lives inside loadLocalAi, so nothing is fetched at module load.
import { acceptable, localEngine, localAiReady, localHint } from '../src/local-ai.ts';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};

const GOOD =
  'Subtract the known addend from each sum; the difference is the missing single-digit value.';

ok('a real hint passes through untouched', acceptable(GOOD) === GOOD);
ok('an empty response is refused', acceptable('') === '');
ok('whitespace only is refused', acceptable('   \n  ') === '');

// The core guarantee.
for (const leak of [
  'Just solve it: the code is 4271 and you are done.',
  'Try 4271.',
  'Try 0 4 2 7 1 if you like.',
  'The code, written with commas, is 4,271 in this case.',
  'Adding the rows gives 1234 for the code.',
  'The answer is 9999 in every case.',
  'The four digits are 0-4-2-7, in that order, for this one.',
]) {
  ok(`the four digits are refused -> ${JSON.stringify(leak.slice(0, 28))}`, acceptable(leak) === '');
}

// The squeeze must not overreach. Ordinals and positional references are how a hint
// legitimately talks about digits, and refusing them would silently cost the feature
// its whole reason to exist. A letter between two digits breaks the chain.
ok('ordinal references survive the squeeze', acceptable('Compare the 1st, 2nd, 3rd and 4th lines first.') !== '');
ok('two digits are not the code', acceptable('The difference is 12 in both of those cases.') !== '');

// A number of three digits is not the code, and a hint may legitimately mention one.
ok('three digits are allowed through', acceptable('Three of the four lines share a 250 offset.') !== '');

// A small model that says nothing useful must not be shown; a near-empty hint is
// worse than the canned one the player would otherwise have got.
ok('a stub is refused', acceptable('Think about it.') === '');
ok('exactly 19 characters is refused', acceptable('x'.repeat(19)) === '');
ok('exactly 20 characters is allowed', acceptable('x'.repeat(20)).length === 20);

// Unbounded model output must not be pasted into the puzzle card.
const long = 'A '.repeat(2000);
ok('a runaway response is capped at 1000 characters', acceptable(long).length === 1000);

// The download is opt-in and belongs to the switch in Settings. Nothing may start it as
// a side effect of asking for a hint, because that would make the Hint button hang for
// the length of a 1.1GB download instead of answering. This is asserted by calling the
// real entry point with no model loaded: it must return empty, and it must not have
// kicked off a load on its way there.
const puzzle = { category: 'math', prompt: 'Fill in the missing digit.', lines: ['3 + ? = 7'] };
const before = localAiReady();
const hint = await localHint(puzzle, 'en');

ok('no engine is available before the player opts in', localEngine() === null);
ok('not ready before the player opts in', before === false);
ok('a hint request with no model returns empty', hint === '');
ok('and it did not start a download on the way', localAiReady() === before);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
