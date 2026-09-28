// Widens the router's word tables from sentences a language model wrote.
//
//   npm run mine:vocab            report only
//   npm run mine:vocab -- --apply  rewrite the tables in src/ai/chat-router.ts
//
// The point of the teacher corpus, given that training a network on it made things worse.
//
// Eight intents is a small, closed set and a router over it does not need to read the
// message, it needs to notice which dozen or so words are in it. The tables in
// src/ai/chat-router.ts are those words, and they were written by reading the template
// corpus, which means they only contain words the templates already had. That is circular:
// the classifier cannot recognise a phrasing nobody thought to write down, and the
// template corpus is made of phrasings somebody did think to write down.
//
// So the vocabulary is widened from outside. For each language, this finds the words real
// sentences use that the table does not have, and asks the local model what each one *is*
// - a salutation, a question opener, an assistant-word, a verb of making a change - rather
// than which intent it appeared in. The role is the thing the table stores, and asking for
// the intent instead would file a noun under whatever sentence happened to contain it.
//
// Two guards, both learned the hard way.
//
// Nothing already in the table is touched, and a word may not join a second role: the
// router throws at import if one word is filed under two, and that throw is worth keeping.
// And a word is only proposed if it is *unambiguous* in the corpus - the intent it appears
// with most has to be most of the intents it appears with, or the word is one the model's
// own labels disagree about and the table would be teaching the router a coin flip.
//
// Output is a report by default. --apply rewrites the tables, and it is a separate step
// precisely so the result can be read before it becomes the committed answer.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {VOCAB, ROLES, foldWord as fold} from '../src/ai/chat-router.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CORPUS = join(ROOT, 'src', 'ai', 'chat-teacher-data.json');
const ROUTER = join(ROOT, 'src', 'ai', 'chat-router.ts');
const URL = process.env.TEACHER_URL ?? 'http://127.0.0.1:8099';
const APPLY = process.argv.includes('--apply');
const PER_ROLE = Number(process.env.MINE_PER_ROLE ?? 8);
const SLOTS = 6;

/** The twelve roles, spelled out for the model, with the one to avoid. */
const ROLE_BRIEF = {
  greet: 'a salutation: hello, hi, good morning, goodbye',
  ask: 'opens a request for information: what, who, why, where, can, is, do',
  how: 'the word "how" on its own, or an equivalent in this language',
  self: 'refers to the assistant or the reader: you, your, I, my',
  can: 'what this thing can do or is for: able, help, use, work, explain, useful, features',
  privacy: 'data, keys, the network, safety: private, send, offline, server, secret, cost',
  code: 'the project and its parts: code, file, project, function, component, model, database',
  act: 'a verb of making a change: add, create, rename, change, edit, remove, update',
  thing: 'the object of a change: string, theme, setting, label, text, title, counter',
  thanks: 'gratitude: thanks, thank you, appreciate, helpful, cheers',
  chat: 'small talk about anything else: weather, joke, name, day, mood, food, music, hobby',
  filler: 'words carrying no signal: the, a, and, please, just, really, now, ok',
};

/** Words too short or too generic to be worth filing anywhere. */
const SKIP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'so', 'to', 'of', 'in', 'on', 'at', 'for',
  'with', 'from', 'by', 'is', 'are', 'was', 'be', 'do', 'does', 'did', 'it', 'its', 'i',
  'me', 'my', 'we', 'us', 'you', 'your', 'he', 'she', 'they', 'them', 'this', 'that',
  'these', 'those', 'there', 'here', 'not', 'no', 'yes', 'am', 'have', 'has', 'had',
]);

/**
 * The same tokenisation the router uses, in the same order.
 *
 * fold() is imported rather than copied. The copy is what caused a build that would not
 * start: it carried its own undecomposable-letter table, missed Turkish dotless i, and so
 * disagreed with the router about whether 'nasilsin' was a word it already had. Two
 * implementations of a normalisation rule will drift apart on exactly the letters that
 * matter, and the disagreement is invisible until the router throws at import.
 */
const tokenize = (text) => text.trim().toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean).map(fold);

const known = new Set(VOCAB);
const corpus = JSON.parse(readFileSync(CORPUS, 'utf8'));

/**
 * Candidate words per language, with the intents they were seen under.
 *
 * Only the training half is read. The held half exists to report how well the widened
 * table does on phrasings nobody mined, and a word taken from it would make that number
 * meaningless in the same way the leaked held-out rows would have.
 */
const candidates = new Map();
for (const row of corpus.train ?? []) {
  if (!candidates.has(row.lang)) candidates.set(row.lang, new Map());
  const per = candidates.get(row.lang);
  for (const w of tokenize(row.text)) {
    if (known.has(w) || SKIP.has(w)) continue;
    if (!/\p{L}/u.test(w)) continue;
    // Latin needs a few letters to be a word rather than a stray; the fixed scripts do
    // not, and a two-character Japanese or Chinese word is a perfectly good word.
    const min = /^\p{Script=Latin}/u.test(w) ? 4 : 2;
    if ([...w].length < min) continue;
    let byIntent = per.get(w);
    if (!byIntent) per.set(w, (byIntent = new Map()));
    byIntent.set(row.intent, (byIntent.get(row.intent) ?? 0) + 1);
  }
}

const report = [];
const suggestions = new Map();

for (const [lang, per] of candidates) {
  // A word has to be a reliable signal: seen at least three times, and most of those times
  // under one intent. A word split evenly across intents is a word the router should not
  // learn from, whatever role the model assigns it to.
  const clear = [];
  for (const [w, byIntent] of per) {
    const total = [...byIntent.values()].reduce((a, b) => a + b, 0);
    if (total < 3) continue;
    const top = Math.max(...byIntent.values());
    if (top / total < 0.5) continue;
    clear.push({w, total});
  }
  clear.sort((a, b) => b.total - a.total);
  const shortlist = clear.slice(0, 90);
  if (!shortlist.length) continue;
  report.push(`\n${lang}: ${clear.length} unambiguous candidates, asking about the top ${shortlist.length}`);

  // Batched, so a language costs two or three requests rather than ninety.
  const batches = [];
  for (let i = 0; i < shortlist.length; i += 30) batches.push(shortlist.slice(i, i + 30));
  // Flat, because Promise.all over the batches hands back an array of arrays - one per
  // batch - and iterating that directly destructures an array into {word, role} and gets
  // undefined for both, so every word was silently dropped and the run reported zero
  // words filed for all sixteen languages while the model had answered perfectly well.
  const answers = (await Promise.all(batches.map((b) => classify(lang, b)))).flat();
  const picked = new Map(ROLES.map((r) => [r, []]));
  for (const {word, role} of answers) {
    if (!role || !picked.has(role)) continue;
    picked.get(role).push(word);
  }
  // A plain object, not the Map: JSON.stringify renders a Map as {} and the file said
  // every language had zero words, which read as "the model refused everything" rather
  // than "the writer dropped it on the floor".
  suggestions.set(lang, Object.fromEntries(picked));
  for (const [role, words] of picked) {
    if (!words.length) continue;
    report.push(`  ${role.padEnd(9)} ${words.slice(0, PER_ROLE).join(', ')}`);
  }
}

console.log(report.join('\n'));
let total = 0;
for (const roles of suggestions.values()) {
  for (const words of Object.values(roles)) total += words.length;
}
console.log(`\nfiled ${total} word(s) across ${suggestions.size} language(s)`);
writeFileSync(join(HERE, 'vocab-report.txt'), report.join('\n') + '\n', 'utf8');
writeFileSync(join(HERE, 'vocab-suggestions.json'), JSON.stringify(Object.fromEntries(suggestions), null, 1) + '\n', 'utf8');
console.log(`wrote scripts/vocab-report.txt and scripts/vocab-suggestions.json`);

if (APPLY) {
  const {added, skipped, conflicts} = apply(suggestions);
  console.log(`\nadded ${added} word(s) to the tables in src/ai/chat-router.ts`);
  console.log(`  ${skipped} already present, ${conflicts.length} dropped for wanting two roles`);
  for (const c of conflicts.slice(0, 12)) console.log(`  ! ${c.word} -> ${c.roles.join(' and ')} (${c.lang})`);
  console.log('\nnow run `npm run train:chat` and read the held-out number before keeping any of this');
}

/**
 * Rewrite the tables with the mined words folded in.
 *
 * Three things it refuses to do, and all three because the router already has opinions
 * about them. A word already in the table is not added again, or the vocabulary grows a
 * duplicate and the coverage count - the share of a message the table recognises - starts
 * reporting a number that is too high. A word the model filed under two roles is dropped
 * rather than given a winner, because src/ai/chat-router.ts throws at import for exactly
 * that and the throw is the right one: it is a disagreement about a word, and picking a
 * side silently would be picking a side silently. And nothing is added to a role the model
 * did not name.
 *
 * 'filler' is skipped on purpose. It is the one role whose words are also spliced into the
 * training corpus as noise, so adding to it changes the noise vocabulary and every
 * accuracy number at the same time, which makes the change impossible to attribute. It can
 * be mined on its own, with its own measurement.
 */
function apply(all) {
  let source = readFileSync(ROUTER, 'utf8');
  let added = 0;
  let skipped = 0;
  const conflicts = [];

  for (const [lang, roles] of all) {
    // A word the model wanted in two places is a disagreement, not a decision.
    const wanted = new Map();
    for (const [role, words] of Object.entries(roles)) {
      if (role === 'filler') continue;
      for (const w of words.slice(0, PER_ROLE)) {
        if (!wanted.has(w)) wanted.set(w, []);
        wanted.get(w).push(role);
      }
    }
    const add = new Map(ROLES.map((r) => [r, []]));
    for (const [w, list] of wanted) {
      if (list.length > 1) {
        conflicts.push({lang, word: w, roles: list});
        continue;
      }
      if (known.has(w)) {
        skipped++;
        continue;
      }
      add.get(list[0]).push(w);
    }

    const name = lang.toUpperCase();
    const blockRe = new RegExp(`(const ${name}: Record<Role, string\\[\\]> = \\{)([\\s\\S]*?)(\\r?\\n\\};)`);
    const block = source.match(blockRe);
    if (!block) {
      console.log(`  ! no table found for ${name}, skipped`);
      continue;
    }
    let body = block[2];
    for (const [role, words] of add) {
      if (!words.length) continue;
      const roleRe = new RegExp(`(\\r?\\n(\\s*)${role}: \\[)([\\s\\S]*?)(\\])`);
      const hit = body.match(roleRe);
      if (!hit) {
        console.log(`  ! ${name}/${role} not found in the table, skipped`);
        continue;
      }
      const quoted = words.map((w) => (w.includes("'") ? `"${w}"` : `'${w}'`)).join(', ');
      body = body.replace(roleRe, `$1$3, ${quoted}$4`);
      added += words.length;
    }
    source = source.replace(blockRe, `$1${body}$3`);
  }

  writeFileSync(ROUTER, source, 'utf8');
  return {added, skipped, conflicts};
}

/**
 * Ask the model to file a batch of words.
 *
 * One role per word, or none. Temperature 0, because this table is committed and a table
 * that changed when nobody changed the code would be worse than no table; the same input
 * has to produce the same words on the next run and on someone else's machine.
 */
async function classify(lang, words) {
  const list = words.map((c) => c.w).join(', ');
  const brief = Object.entries(ROLE_BRIEF).map(([r, d]) => `${r}: ${d}`).join('\n');
  const res = await fetch(`${URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      model: 'local',
      temperature: 0,
      top_p: 1,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content:
            'You file vocabulary into categories. You reply with JSON and nothing else.',
        },
        {
          role: 'user',
          content:
            `These are ${words.length} words written in the language identified as "${lang}". ` +
            'For each word, choose the ONE category whose description fits the word best in ' +
            'this language - the category a classifier should use to recognise it.\n\n' +
            `${brief}\n\n` +
            'Rules: answer every word, exactly once, in the order given. Use "none" for a ' +
            'word that belongs to no category, including content nouns that are not part of ' +
            'this app: place names, foods, animals, numbers, times, and words that only name ' +
            'a specific topic. Judge the word alone, not any sentence it came from.\n\n' +
            `Words: ${list}\n\n` +
            'Reply with one line per word, in the form "word -> role", and nothing else:\n' +
            'merci -> thanks\nfonctionne -> can\ndonnees -> none\n' +
            'Copy each word back exactly as it was given. Do not number the lines.',
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`teacher ${res.status}`);
  const json = await res.json();
  const text = json.choices[0].message.content;
  // The reply is written out on request, because a parse that finds nothing and a model
  // that answers nothing look identical from the outside and the difference is the whole
  // question. Twice this reported zero words for all sixteen languages for reasons that
  // were only visible in here.
  if (process.env.MINE_DEBUG && !globalThis.__mined) {
    globalThis.__mined = true;
    writeFileSync(join(HERE, 'mine-debug.txt'), `lang=${lang}\nwords=${words.length}\n\n${text}\n`, 'utf8');
  }
  const byWord = new Map(words.map((c) => [c.w, c.w]));
  const out = [];
  // Aligned by the word, not by line order.
  //
  // A JSON array of roles was the first attempt and it silently returned nothing at all:
  // asked for thirty words the model answered with twenty-nine, the length check rejected
  // the batch, and every language reported zero. It is a real failure mode of batched
  // classification and it produced a report that looked like a verdict on the model rather
  // than a bug in the parser. Echoing the word back means a dropped or repeated line costs
  // that one word and nothing else.
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\S+)\s*(?:->|=>|:)\s*([a-z_]+)\s*$/i);
    if (!m) continue;
    const word = byWord.get(m[1]) ?? byWord.get(m[1].toLowerCase());
    if (process.env.MINE_DEBUG) {
      console.error(`  batch(${words.length}) line=${JSON.stringify(line)} lhs=${JSON.stringify(m[1])} inBatch=${byWord.has(m[1])} role=${m[2]}`);
    }
    if (!word) continue;
    out.push({word, role: m[2].toLowerCase()});
  }
  return out;
}
