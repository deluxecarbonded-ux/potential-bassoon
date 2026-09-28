/**
 * Generates the training corpus for the chat classifier with a local teacher model.
 *
 * This is a development tool. Nothing it produces is fetched at runtime and nothing in
 * src/ imports it: it writes a JSON file, the training script reads that file, and the
 * trained network is committed as plain numbers. The app never loads a model, opens a
 * socket, or knows this file exists - which is the whole point, because the teacher is a
 * nine-gigabyte download and the app has to work on a phone on a train.
 *
 * The teacher is llama.cpp over plain HTTP on the loopback interface, started by hand:
 *
 *   llama-server.exe -m Qwen2.5-14B-Instruct-Q4_K_M.gguf -ngl 99 -c 16384 -np 6 --jinja
 *   npm run gen:teacher
 *
 * Why a teacher at all, when the corpus is only eight intents? Because the hand-written
 * corpus is templates: about eighty sentences per language, each repeated five times with
 * noise and a randomised context. The network learned those vectors rather than the
 * sentences - 99.5% on the training rows against 97.2% on the held-out ones, with most of
 * the held-out failures reporting no matching training row at all. It had nothing to
 * generalise from, because there was nothing in the corpus that was not a template.
 *
 * What a fourteen-billion-parameter model is for here is variety, not knowledge. It has
 * read enough text to know how a person actually asks "what can you do" in Urdu, which is
 * not a thing that can be enumerated by hand and is the entire difference between a router
 * that works on the sentences people type and one that works on the ones in the test.
 *
 * Two files come out of this and they are kept apart on purpose:
 *
 *   train - added to the training rows. Nothing here is ever scored.
 *   held  - never trained on, and scored as a second, independent number. The original
 *           held-out split is the last repetition of the hand-written templates, so it
 *           measures whether the network can survive a change of noise word on a sentence
 *           it has seen. That is a real test and it is the one the weights are gated on,
 *           but it is not a test of a sentence nobody wrote, and this file is.
 *
 * Usage:
 *   npm run gen:teacher                    both halves, default counts
 *   npm run gen:teacher -- --split train   only the training half
 *   npm run gen:teacher -- --split held    only the held-out half
 *   npm run gen:teacher -- --count 40      examples per intent per language
 *   npm run gen:teacher -- --url http://127.0.0.1:8099
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'ai', 'chat-teacher-data.json');

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const URL = arg('url', 'http://127.0.0.1:8099');
const COUNT = Number(arg('count', 30));
const SPLIT = arg('split', 'both');
/** The server runs six slots; asking for more just queues them and hides a stall. */
const SLOTS = Number(arg('slots', 6));
const SEED = Number(arg('seed', 0x5eed));

/**
 * The sixteen interface languages, each named in itself.
 *
 * The native name goes in the prompt rather than the code, because "Urdu" gets English
 * instructions and "اردو" gets Urdu ones, and the difference in what comes back is large
 * enough to be worth the extra sentence. The script note is there for the same reason:
 * Chinese and Japanese are written without spaces, and a model that has not been told so
 * will helpfully space them out.
 */
const LANGUAGES = [
  {code: 'en', name: 'English', note: 'Latin script, spaced', script: 'latin'},
  {code: 'ar', name: 'Arabic', note: 'Arabic script, right to left, spaced, do not add diacritics you would not normally write', script: 'arabic'},
  {code: 'es', name: 'Spanish', note: 'Latin script with accents, spaced', script: 'latin'},
  {code: 'fr', name: 'French', note: 'Latin script with accents, spaced', script: 'latin'},
  {code: 'de', name: 'German', note: 'Latin script, umlauts and eszett are normal here, spaced', script: 'latin'},
  {code: 'pt', name: 'Portuguese', note: 'Latin script with accents, spaced', script: 'latin'},
  {code: 'it', name: 'Italian', note: 'Latin script with accents, spaced', script: 'latin'},
  {code: 'nl', name: 'Dutch', note: 'Latin script, spaced', script: 'latin'},
  {code: 'ru', name: 'Russian', note: 'Cyrillic script, spaced', script: 'cyrillic'},
  {code: 'tr', name: 'Turkish', note: 'Latin script; dotted and dotless i are both correct, use whichever a speaker would type', script: 'latin'},
  {code: 'hi', name: 'Hindi', note: 'Devanagari script, spaced', script: 'devanagari'},
  {code: 'ja', name: 'Japanese', note: 'Japanese script, written without spaces between words, polite forms are normal', script: 'japanese'},
  {code: 'ko', name: 'Korean', note: 'Hangul script, spaced, particles attached to the word are normal', script: 'hangul'},
  {code: 'zh', name: 'Chinese', note: 'Han script, written without spaces between words', script: 'han'},
  {code: 'id', name: 'Indonesian', note: 'Latin script, spaced', script: 'latin'},
  {code: 'ur', name: 'Urdu', note: 'Arabic script, right to left, spaced, do not add diacritics you would not normally write', script: 'arabic'},
];

/**
 * Which scripts a message is allowed to be written in.
 *
 * This exists because a fourteen-billion-parameter model will occasionally answer a
 * Korean request in Japanese. The first run returned 'いらっ셔' - three Japanese kana and
 * one Korean syllable - as a Korean greeting. Both are invisible unless something checks,
 * and both are worse than an empty row: the word table matches on script, so a Korean row
 * written in kana teaches the router that Japanese means Korean.
 *
 * The test is about which letters are present, not about the whole string matching a
 * range, and it is written with \p{Script=...} rather than with hand-written character
 * ranges. The hand-written ranges were wrong in a way that only showed up in the output:
 * the Cyrillic range was malformed enough to reject 'Привет, всё живы?', which is nothing
 * but Cyrillic, and the Arabic range threw away most of the Urdu greetings - eight of
 * thirty survived, and nothing said why, because a rejected row leaves no trace in the
 * corpus and turns up much later as a language that routes badly for no visible reason.
 *
 * Latin letters are allowed alongside Arabic and Devanagari, but only as a technical
 * token. A reader writing Arabic does type 'ملف weights.json' and a router that throws
 * that away is throwing away a real message; a reader does not type 'الملف weights
 * xyzzy plugh' and that is contamination. A dot followed by letters is the line between
 * them, and it is the same line src/ai/chat-router.ts draws for a file name.
 */
const TECHNICAL = /[\w./-]*\.[A-Za-z]{2,5}\b|\b[A-Z]{2,}\b|\bv?\d+(\.\d+)*\b/;

function scriptOk(text, script) {
  // Punctuation, digits and marks are permitted in every script; only letters are judged.
  //
  // ー (the prolonged sound mark) and 〆 are removed first. Both are modifier letters that
  // carry Script=Common, because they are orthographic marks shared by several writing
  // systems rather than text in any one of them, so they belong to no script property at
  // all. ー appears in a large share of Japanese words, and while it was left in, the
  // "a letter from a script we did not consider" guard below fired on it: every sentence
  // containing one looked as though it had a stray character of unknown origin, and a run
  // of perfectly good Japanese privacy questions was rejected as contamination.
  const letters = text.replace(/[^\p{L}]/gu, '').replace(/[ー〆]/gu, '');
  if (letters.length < 2) return false;

  const count = (re) => (letters.match(re) ?? []).length;
  const has = {
    latin: count(/\p{Script=Latin}/gu),
    cyrillic: count(/\p{Script=Cyrillic}/gu),
    arabic: count(/\p{Script=Arabic}/gu),
    devanagari: count(/\p{Script=Devanagari}/gu),
    hangul: count(/\p{Script=Hangul}/gu),
    han: count(/\p{Script=Han}/gu),
    kana: count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu),
  };

  const total = Object.values(has).reduce((a, b) => a + b, 0);
  // Letters from scripts not on this list - Greek, Hebrew, Thai - are tolerated in small
  // quantity rather than refused outright. 'Qual é o significado do símbolo de pi (π)'
  // is a real Portuguese sentence, and a guard that demanded every letter be accounted
  // for rejected it. This is the third version of this check and each earlier one broke
  // on a different special letter: ー has Script=Common, π has Script=Greek. A share of
  // the sentence is the right measure - a whole sentence in a script we do not model is
  // still refused, because then the unknown count is everything.
  if ((letters.length - total) * 10 > letters.length) return false;

  switch (script) {
    case 'japanese':
      // Kana is required rather than merely allowed. Han is shared with Chinese, so
      // "presence of Han" cannot tell a Japanese row from a Chinese one, and every
      // Japanese greeting in this corpus has kana in it.
      return has.kana > 0 && has.hangul === 0;
    case 'han':
      return has.han > 0 && has.kana === 0 && has.hangul === 0;
    case 'hangul':
      // Kana is forbidden rather than tolerated. 'いらっ셔' - three kana and one syllable,
      // which is what the model actually returned when asked for Korean - is a real
      // Hangul letter, so 'contains Hangul' passes it, and a majority rule is what catches
      // it. No Korean sentence contains kana.
      return has.hangul > 0 && has.kana === 0 && has.hangul * 2 > total;
    case 'arabic':
    case 'devanagari':
      // Mostly the right script, with Latin confined to a technical token.
      return has[script] > 0 && (has.latin === 0 || TECHNICAL.test(text));
    case 'latin':
    case 'cyrillic': {
      // These two borrow from each other, and only from each other.
      //
      // Presence is the test, not a majority. 'Что за файл такой Agent.tsx?', 'Сколько
      // стоит акция Google?' and 'Hello, как дела?' are all sentences a Russian speaker
      // really sends, and a majority rule rejects all three - the last one because the
      // greeting opens in English. Nothing is lost by dropping the majority: an answer
      // that is wholly in the wrong language has *no* letters of the expected script, and
      // that is the failure this filter exists to catch.
      //
      // Nothing else is borrowed. A Han, Hangul, kana, Arabic or Devanagari letter has no
      // legitimate place in a Latin or Cyrillic sentence, so '有人在吗' - which is what the
      // model returned when asked for Arabic, in Chinese, word for word - is refused.
      const foreign = has.hangul + has.kana + has.han + has.arabic + has.devanagari;
      return has[script] > 0 && foreign === 0;
    }
    default: {
      // Strict. Every script other than the expected one has to be absent.
      const others = Object.entries(has).filter(([k]) => k !== script);
      return has[script] > 0 && others.every(([, n]) => n === 0);
    }
  }
}



/**
 * The eight intents, written out for the teacher rather than as a label.
 *
 * The descriptions carry their own exclusions, and the exclusions are the part that
 * matters. Given only "capabilities" a model will happily generate "what can you do" six
 * times; given the description plus what it is *not*, it generates the awkward cases -
 * "what's the point of you", "how do you work" - which are the ones the router actually
 * gets wrong. Every boundary that produced a held-out failure is written into this block,
 * because a teacher that has not been told about a boundary cannot produce examples that
 * sit on it.
 */
const INTENTS = [
  {
    name: 'greeting',
    about: 'A greeting or an opening: hello, good morning, hi there, "anyone around", "are you there".',
    notAbout: 'Not a question about what the assistant can do, even when a greeting is wrapped around one - "hi, what can you do?" is capabilities.',
  },
  {
    name: 'capabilities',
    about: 'A question addressed at the assistant about itself: what it can do, what it is for, what it is good at, how it works, what its limits are, whether it is worth using.',
    notAbout: 'Not a question about the project or its source code - "what does Agent.tsx do" is code. Not a request to change something - that is edit. Not social chat - "how are you today" is smalltalk.',
  },
  {
    name: 'privacy',
    about: 'A question about data, privacy, safety or the network: whether messages are stored, whether a password is kept, whether anything is uploaded, whether it works offline, whether a server is involved, whether it is safe.',
    notAbout: 'Not a question about what the assistant can do in general. Not a question about the code - "is the api key in the source code" is code.',
  },
  {
    name: 'code',
    about: 'A question about this project, its source, its files, its data model or its AI: how something is implemented, what a file does, what the model or weights are, how many parameters it has, where something is defined.',
    notAbout: 'Not a request to change something - "add a counter to Agent.tsx" is edit, not code. Not a question about the assistant as a person rather than the code.',
  },
  {
    name: 'edit',
    about: 'A request for the assistant to change the project: add something, rename something, delete something, rewrite a string, change a label or a setting, introduce a new option.',
    notAbout: 'Not a question about what exists - "does Agent.tsx have a counter" is code. Not a request that is merely about the assistant itself.',
  },
  {
    name: 'thanks',
    about: 'Gratitude: thanks, thank you, that helped, much appreciated, you are very helpful.',
    notAbout: 'Not a greeting - "good morning" is greeting. Not a compliment about the assistant\'s abilities, which is capabilities.',
  },
  {
    name: 'smalltalk',
    about: 'Social conversation with no task in it: the weather, a joke, the time of day, the assistant\'s name or age, how the reader is doing, what they are working on, music, food, boredom, plans for the weekend.',
    notAbout: 'Not a question about the assistant\'s capabilities - "what can you do" is capabilities, not smalltalk. Not a practical question about the world outside the project, which would be unknown.',
  },
  {
    name: 'unknown',
    about: 'A question the assistant has no business answering, about anything at all: geography, history, science, cooking, medicine, sport, money, the weather forecast, a product recommendation, a personal problem.',
    notAbout: 'Not smalltalk - "what is the weather like" as idle chat is smalltalk, but "what is the weather in Tokyo right now" as a real forecast question is unknown. Not anything about the project or the assistant.',
  },
];

/**
 * The pairs the router is currently getting wrong, asked for by name.
 *
 * These go in as their own pass rather than being hoped for. The point of a hard negative
 * is that it sits exactly on the boundary: "how do I fix a tyre" and "how are you" are the
 * same question-word and the same second-person word, and only a verb of changing
 * something tells them apart. A corpus of unambiguous examples never teaches that, because
 * an unambiguous example never contains the ambiguity.
 */
const HARD = [
  {
    id: 'howto-vs-smalltalk',
    intent: 'smalltalk',
    about: 'Asking the assistant how it is, or addressing it directly, using a question word',
    notAbout: 'Not a practical how-to question about the world - that is unknown',
  },
  {
    id: 'howto-vs-capabilities',
    intent: 'capabilities',
    about: 'Asking the assistant what it is for, what it is good at, what its purpose is, phrased indirectly or rhetorically',
    notAbout: 'Not a practical how-to question about the world - that is unknown',
  },
  {
    id: 'code-vs-capabilities',
    intent: 'code',
    about: 'A question about a file, a function, a component, a parameter count, a model or the project, where the subject is the code',
    notAbout: 'Not a question about the assistant as a whole - that is capabilities',
  },
  {
    id: 'privacy-vs-capabilities',
    intent: 'privacy',
    about: 'A question about data, storage, a password, an upload, a server or safety',
    notAbout: 'Not a general question about what the assistant can do',
  },
  {
    id: 'gibberish-vs-unknown',
    intent: 'unknown',
    about: 'A real question in the language about a real subject the assistant has no answer for, asked casually',
    notAbout: 'Not keyboard mashing - generate real sentences',
  },
  {
    id: 'edit-vs-code',
    intent: 'edit',
    about: 'A request to change something in the project, phrased as a question or very tersely',
    notAbout: 'Not a question about what already exists',
  },
];

/** Pull the first JSON object out of a reply that may or may not have obeyed the format. */
function parseItems(text) {
  const at = text.indexOf('{');
  if (at < 0) return [];
  const end = text.lastIndexOf('}');
  if (end <= at) return [];
  try {
    const parsed = JSON.parse(text.slice(at, end + 1));
    const items = parsed.items ?? parsed.examples ?? parsed.sentences;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

/**
 * Keep only things a player could plausibly have typed.
 *
 * The teacher is asked for JSON and mostly complies, but it will occasionally hand back a
 * translation, a numbering, a sentence in the wrong language, or a string with the
 * scaffolding still inside it. Every one of those is worse than no row at all, because it
 * teaches the router that a specific piece of punctuation means a specific intent, and
 * because a bad label in the training set is invisible afterwards - the network just
 * memorises it. So the filter is deliberately strict and the count is reported, since a
 * filter that quietly discards half the output is a bug that looks like a small model.
 */
function clean(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (text.length > 160) return null;
  if (/^[\d]+[.)]/.test(text)) return null;
  if (/[{}\[\]<>|]/.test(text)) return null;
  if (text.includes('"') || text.includes('\\')) return null;
  // "Sure, here are six examples:" and its relatives.
  if (/(^|\s)(here (are|is)|sure[,!]|example|translation|translates|means)[:\s]/i.test(text)) return null;
  if (!/\p{L}/u.test(text)) return null;
  // One character is not a message. Two often is - 'hi', '안녕', 'да' are all real
  // greetings in languages the app ships, and an earlier version of this filter dropped
  // anything under three characters, which quietly deleted every short greeting in the
  // corpus while the report said nothing was wrong.
  if ([...text].length < 2) return null;
  return text.replace(/\s+/gu, ' ').trim();
}

async function ask(language, spec, n, temperature) {
  const about = typeof spec === 'string' ? spec : spec.about;
  const notAbout = typeof spec === 'string' ? '' : spec.notAbout;
  const body = {
    messages: [
      {
        role: 'system',
        content:
          'You write training data for an intent classifier. You reply with strict JSON and ' +
          'nothing else. You never number the items and never explain them.',
      },
      {
        role: 'user',
        content:
`Write ${n} different chat messages written in ${language.name} (${language.note}).

Each message must mean exactly this:
${about}
${notAbout}

Rules:
- Every message must be something a real player would actually type, in ${language.name}.
- Vary the phrasing a lot. Use different sentence shapes, lengths, registers and levels of politeness. Do not produce near-duplicates of each other.
- Do not include the intent name, the category, or any label in the text.
- Do not use quotation marks around the messages.
- ${language.name} only. Never mix in English or another language.
- Keep each message to one short line.

Return exactly this JSON shape and nothing else:
{"items":["...","...","...","...","...","..."]}`,
      },
    ],
    temperature,
    top_p: 0.95,
    max_tokens: 1400,
  };

  // Retried rather than counted as a loss. One request in the first full run came back
  // with a slot timeout and cost a whole language-and-intent cell, and a corpus with a
  // silent hole in it is exactly the sort of thing that is not noticed until a language
  // routes badly and nobody can say why. Three tries, then give up and say so.
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
    const res = await fetch(`${URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      last = new Error(`teacher returned ${res.status}`);
      continue;
    }
    const json = await res.json();
    const items = parseItems(json.choices[0].message.content);
    if (items.length) return items;
    last = new Error('unparseable reply');
  }
  throw last ?? new Error('no reply');
}

/**
 * Run the jobs a few at a time.
 *
 * The server has six slots and will happily accept sixty; queueing them all just moves the
 * wait somewhere less visible. Progress goes to stderr so the file on stdout stays clean.
 */
async function pool(jobs, width) {
  const out = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      try {
        out[i] = await jobs[i]();
      } catch (err) {
        out[i] = {error: String(err)};
      }
      done++;
      if (done % 10 === 0 || done === jobs.length) {
        process.stderr.write(`  ${done}/${jobs.length}\r`);
      }
    }
  };
  await Promise.all(Array.from({length: width}, worker));
  return out;
}

async function generateSplit(split, count) {
  process.stderr.write(`\n${split}: ${LANGUAGES.length} languages\n`);
  const jobs = [];
  for (const language of LANGUAGES) {
    for (const intent of INTENTS) {
      jobs.push(async () => ({
        language: language.code,
        script: language.script,
        intent: intent.name,
        items: await ask(language, intent, count, 0.95),
      }));
    }
    for (const hard of HARD) {
      jobs.push(async () => ({
        language: language.code,
        script: language.script,
        // The hard cells are a different *angle* on an intent, not a ninth class. Labelling
        // them 'howto-vs-smalltalk' would teach the router a distinction the reply library
        // cannot make, so they are folded back onto the intent they belong to and what
        // survives is the awkward phrasing of it.
        intent: hard.intent,
        items: await ask(language, hard, Math.max(6, Math.round(count / 2)), 1.0),
      }));
    }
  }

  const results = await pool(jobs, SLOTS);
  process.stderr.write('\n');

  const rows = [];
  const rejected = [];
  const seen = new Set();
  let duplicates = 0;
  let wrongScript = 0;

  // Absorb one cell's worth of answers, applying every filter. Shared by the first pass
  // and the top-up pass, so that a sentence accepted on the second attempt is held to
  // exactly the same standard as one accepted on the first.
  const absorb = (result) => {
  if (!result || result.error) {
    rejected.push({reason: result?.error ?? 'no result'});
    return;
  }
  for (const raw of result.items ?? []) {
    const text = clean(raw);
    if (!text) {
      rejected.push({reason: 'filtered', raw: String(raw).slice(0, 60)});
      continue;
    }
    if (!scriptOk(text, result.script)) {
      wrongScript++;
      rejected.push({reason: 'script', lang: result.language, raw: text.slice(0, 40)});
      continue;
    }
    // Deduplicated on the casefolded text, so the same sentence asked for twice does not
    // become two rows that then have to be learned separately.
    const key = `${result.language} ${text.toLowerCase()}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    rows.push({text, lang: result.language, intent: result.intent});
  }
  };

  for (const result of results) absorb(result);
  for (const result of results) absorb(result);

  // A second pass for the cells that came up short.
  //
  // Cells go thin for reasons that are only visible after the fact: Korean greetings
  // dropped to eleven out of thirty because the model kept answering
  // 'いらっじょ 방갑습네' - a kana-Hangul hybrid it invented - and every one of those
  // was correctly refused. That is the filter working, but the cell is still short, and
  // a gap in the corpus is invisible: it surfaces later as Korean greeting routes that
  // are worse than having no data for them at all. Asking again at full temperature
  // recovers most of it.
  const byCell = new Map();
  for (const r of rows) {
    const cell = `${r.lang} ${r.intent}`;
    byCell.set(cell, (byCell.get(cell) ?? 0) + 1);
  }
  const floor = Math.max(6, Math.round(count / 2));
  const topUp = [];
  for (const language of LANGUAGES) {
    for (const intent of INTENTS) {
      const have = byCell.get(`${language.code} ${intent.name}`) ?? 0;
      if (have >= floor) continue;
      const deficit = floor - have;
      topUp.push(async () => ({
        language: language.code,
        script: language.script,
        intent: intent.name,
        // Three times the shortfall: duplicates and refusals are expected, and a top-up
        // that asks for exactly the deficit lands short again.
        items: await ask(language, intent, deficit * 3, 1.0),
      }));
    }
  }

  let topped = 0;
  if (topUp.length) {
    process.stderr.write(`  topping up ${topUp.length} thin cell(s)` + String.fromCharCode(10));
    const before = rows.length;
    for (const result of await pool(topUp, SLOTS)) absorb(result);
    topped = rows.length - before;
    process.stderr.write(String.fromCharCode(10));
  }

  return {rows, rejected, duplicates, wrongScript, topped, floor};
}

/**
 * The validator, checked against sentences that have actually broken it.
 *
 * Every case here is one that either got through a previous version of this filter or got
 * thrown away by it, and the second kind is worse: 'Привет, всё живы?' is nothing but
 * Cyrillic and was rejected by a hand-written character range, which quietly left Urdu with
 * eight greetings out of thirty. A filter that is wrong leaves no trace in the output, so
 * it is checked here rather than trusted.
 *
 *   npm run gen:teacher -- --self-test
 */
const SELF_TEST = [
  // Right script, kept.
  ['Привет, всё живы?', 'cyrillic', true],
  ['Здравствуйте, всё в порядке?', 'cyrillic', true],
  ['ما هي قدراتك بالضبط؟', 'arabic', true],
  ['صباح بخير', 'arabic', true],
  ['وعليكم السلام ورحمة الله', 'arabic', true],
  ['नमस्ते आप कैसे हैं', 'devanagari', true],
  ['你好，请问在吗', 'han', true],
  ['いらっしいまいくださいましたか', 'japanese', true],
  // ー is a modifier letter with no script of its own, and used to be counted as a
  // stray character of unknown origin, which threw away ordinary Japanese questions.
  ['データは安全に保管されますか', 'japanese', true],
  ['サーバーに情報が送られますか', 'japanese', true],
  ['PWA 是什么意思', 'han', true],
  // A Japanese-acronym expansion inside an English sentence is code-switching, and is
  // exactly what a privacy question about this app looks like in practice.
  ['Does a PWA send my data to a server?', 'latin', true],
  ['안녕하세요 반갑습니다', 'hangul', true],
  ['hola, ¿qué tal?', 'latin', true],
  ['qwert zxcv please', 'latin', true],
  // Short messages are still messages: 'hi' and '안녕' are both ordinary greetings, and a
  // three-character minimum deleted every one of them.
  ['hi', 'latin', true],
  ['안녕', 'hangul', true],
  // A Latin filename inside a right-to-left sentence is something a reader really types.
  ['ما هي الوظيفة الأساسية لملف weights.json', 'arabic', true],
  ['الملف API كبير', 'arabic', true],
  // Latin and Cyrillic borrow from each other, and only from each other.
  ['Что за файл такой Agent.tsx?', 'cyrillic', true],
  ['Сколько стоит акция Google?', 'cyrillic', true],
  ['Hello, как дела?', 'latin', true],
  // Wrong script, dropped.
  ['ملف weights xyzzy plugh', 'arabic', false],
  ['有人在吗', 'arabic', false],
  ['你好世界', 'japanese', false],
  ['いらっ셔', 'hangul', false],
  // A wholly English sentence in a Russian cell is the failure this majority rule exists
  // to catch: nothing of the expected script is present at all.
  ['What can you do for me?', 'cyrillic', false],
  // Known ambiguity, kept deliberately rather than pretending it is solved: one Russian
  // word inside an English sentence passes, because there is no way to tell it from
  // code-switching, and code-switching is a thing real players do.
  ['Where is твой file?', 'latin', true],
  ['و', 'arabic', false],
];

if (process.argv.includes('--self-test')) {
  let bad = 0;
  for (const [text, script, want] of SELF_TEST) {
    const got = scriptOk(text, script);
    if (got !== want) bad++;
    console.log(`${got === want ? 'ok  ' : 'FAIL'} [${script.padEnd(11)}] ${want ? 'keep' : 'drop'}  ${text}`);
  }
  console.log(bad ? `\n${bad} of ${SELF_TEST.length} validator cases are wrong` : `\nall ${SELF_TEST.length} validator cases correct`);
  process.exit(bad ? 1 : 0);
}

const train = SPLIT === 'held' ? {rows: [], rejected: [], duplicates: 0} : await generateSplit('train', COUNT);
const held = SPLIT === 'train' ? {rows: [], rejected: [], duplicates: 0} : await generateSplit('held', Math.max(8, Math.round(COUNT / 3)));

// Held-out rows that also appear in training are not held out at all.
//
// Each split deduplicates against itself, but nothing stopped the two splits from
// overlapping, and they overlapped on 123 rows. Almost all of them are the handful of
// canonical greetings a model reaches for every single time - 'hello there', 'مرحبًا',
// 'صباح الخير' - which are exactly the sentences a held-out set is most likely to be
// built from and exactly the ones that inflate the score. Training sees them, so they are
// scored as if they were new. The label is dropped from the held side rather than the
// train side: training wants every sentence it can get, and the held set is still large
// enough to measure something.
const trainKeys = new Set(train.rows.map((r) => `${r.lang} ${r.text.toLowerCase()}`));
const before = held.rows.length;
held.rows = held.rows.filter((r) => !trainKeys.has(`${r.lang} ${r.text.toLowerCase()}`));
const leaked = before - held.rows.length;
if (leaked) process.stderr.write(`  dropped ${leaked} held row(s) that also appear in training\n`);

const existing = await readFile(OUT, 'utf8').then(
  (text) => JSON.parse(text),
  () => ({train: [], held: []}),
);

const merge = (was, now) => {
  const seen = new Set(was.map((r) => `${r.lang} ${r.text.toLowerCase()}`));
  const fresh = now.filter((r) => !seen.has(`${r.lang} ${r.text.toLowerCase()}`));
  return [...was, ...fresh];
};

const payload = {
  note:
    'Generated by scripts/gen-teacher-data.mjs from a local llama.cpp teacher. Training data ' +
    'only: nothing in src/ imports this at runtime. Regenerate with `npm run gen:teacher`.',
  teacher: 'Qwen2.5-14B-Instruct-Q4_K_M',
  train: merge(existing.train, train.rows),
  held: merge(existing.held, held.rows),
};

// Repeated against the merged sets, because merging with a file from a previous run can
// reintroduce the overlap the check above just removed. Kept in step with the two
// summaries below, which report what the file on disk actually holds rather than what
// this run happened to produce.
const finalTrain = new Set(payload.train.map((r) => `${r.lang} ${r.text.toLowerCase()}`));
const heldBefore = payload.held.length;
payload.held = payload.held.filter((r) => !finalTrain.has(`${r.lang} ${r.text.toLowerCase()}`));
const stillLeaking = heldBefore - payload.held.length;
if (stillLeaking) process.stderr.write(`  dropped ${stillLeaking} more held row(s) present in training\n`);

await writeFile(OUT, JSON.stringify(payload, null, 1) + '\n', 'utf8');

const byIntent = (rows) =>
  Object.entries(
    rows.reduce((acc, r) => ((acc[r.intent] = (acc[r.intent] || 0) + 1), acc), {}),
  )
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');

console.log(`wrote ${OUT}`);
console.log(`  train ${payload.train.length} rows (${train.rows.length} new, ${train.duplicates} duplicate, ${train.rejected.length} rejected, ${train.topped} from top-up)`);
console.log(`    ${byIntent(payload.train)}`);
console.log(`  held  ${payload.held.length} rows (${held.rows.length} new, ${held.duplicates} duplicate, ${held.rejected.length} rejected, ${held.topped} from top-up)`);
console.log(`    ${byIntent(payload.held)}`);

// Said out loud rather than left in a count, because a script rejection is the one failure
// mode that leaves no trace in the corpus: the row simply is not there, and the effect
// shows up much later as a language that routes badly for no visible reason.
const strays = [...train.rejected, ...held.rejected].filter((r) => r.reason === 'script');
if (strays.length) {
  console.log(`\n  ${strays.length} answer(s) were in the wrong script and were dropped:`);
  for (const s of strays.slice(0, 12)) console.log(`    [${s.lang}] ${s.raw}`);
  if (strays.length > 12) console.log(`    ...and ${strays.length - 12} more`);
}

const thin = new Set();
for (const language of LANGUAGES) {
  for (const intent of INTENTS) {
    const n = payload.train.filter((r) => r.lang === language.code && r.intent === intent.name).length;
    if (n < COUNT / 2) thin.add(`${language.code}/${intent.name}:${n}`);
  }
}
console.log(thin.size ? `  thin: ${[...thin].join(' ')}` : '  every language and intent is well covered');
