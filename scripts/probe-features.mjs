/**
 * Prints the feature vector for a handful of sentences.
 *
 * A confusion report says *that* two messages were told apart wrongly; this says what the
 * router actually saw, which is the difference between a table that is missing a word and a
 * sentence that is genuinely identical to another one. Deleted once the tables settled.
 */
import { features, ROLES, CHAT_FEATURE_SIZE } from '../src/ai/chat-router.ts';

const ctx = {files: [], canWrite: false, isOwner: true};
const SENTENCES = process.argv.slice(2);

for (const text of SENTENCES) {
  const x = features(text, ctx);
  const present = ROLES.filter((r, i) => x[i] > 0);
  const counted = ROLES
    .map((r, i) => [r, x[ROLES.length + i]])
    .filter((pair) => pair[1] > 0)
    .map((pair) => `${pair[0]}=${pair[1].toFixed(2)}`);
  const shape = ROLES.length * 2;
  const focus = shape + 6;
  const bit = (n) => (x[focus + n] > 0 ? '1' : '0');
  console.log(
    `${JSON.stringify(text)}\n  roles   ${present.join('+') || '(none)'}` +
      `\n  counts  ${counted.join(' ') || '(none)'}` +
      `\n  shape   q=${x[shape]} len=${x[shape + 1].toFixed(2)} file=${x[shape + 2]} oov=${x[shape + 3].toFixed(2)}` +
      `\n  focus   content=${x[focus].toFixed(2)} fillerShare=${x[focus + 1].toFixed(2)}` +
      ` howAct=${bit(2)} selfQ=${bit(3)} selfOnly=${bit(4)} codeQ=${bit(5)} actThing=${bit(6)} askOov=${bit(7)}`,
  );
}
console.log(`\nfeature size ${CHAT_FEATURE_SIZE}, ${ROLES.length} roles`);
