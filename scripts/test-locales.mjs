// Locale sweep: every language, every puzzle category, every difficulty.
//
// The numeral layer can only be judged across the whole set at once. A locale is
// wrong if a raw ASCII digit survives into rendered text, if a translation cell is
// missing, if a puzzle prompt is empty, or if the same puzzle renders differently
// for two players in the same language - which is what "the same language gets the
// same puzzle" promises.
import { languages, translate, translations, toNumerals, toDigits, num, pad, fromNumerals, isRTL } from '../src/i18n.ts';
import { makePuzzle, categories } from '../supabase/functions/_shared/puzzles.ts';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};

// A digit may legitimately survive as a *character* in these places: none of them,
// actually - every rendered numeral should be in the locale's own script or its
// documented ASCII form (ru/tr/hi keep non-ASCII digits, but en/es/fr/de/... keep
// ASCII, which is correct for them). So the rule is per-locale: a locale either has
// a non-ASCII digit set, or it is one that legitimately writes Latin digits.
const ASCII_DIGIT_LOCALES = new Set(['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ru', 'tr', 'id']);

const KEYS = ['docTitle', 'docDesc', 'soloDesc', 'multiDesc', 'how1', 'how2', 'how3', 'how4',
  'answer', 'win', 'wrong', 'check', 'next', 'replay', 'attempts', 'hint', 'reveal', 'ai',
  'needPlayers', 'level', 'levels', 'journeySub', 'eyebrow', 'allDone', 'roundDone'];

console.log('TRANSLATION COMPLETENESS');
for (const l of languages) {
  // Presence is checked against the table, not by comparing the rendered value to the
  // key: `levels` is genuinely the English string "levels", so a value-equality test
  // calls it missing.
  const absent = KEYS.filter((k) => !(k in translations[l.code]));
  const empty = KEYS.filter((k) => k in translations[l.code] && !translate(l.code, k));
  ok(`${l.code}: all ${KEYS.length} keys present and non-empty`, absent.length === 0 && empty.length === 0,
    [...absent, ...empty.map((k) => `${k}(empty)`)].join(', '));
}
ok('locale count is 16', languages.length === 16, String(languages.length));
ok('rtl set is exactly ar+ur', languages.filter((l) => isRTL(l.code)).map((l) => l.code).join(',') === 'ar,ur');

console.log('\nNO RAW ASCII DIGITS SURVIVE RENDERING');
for (const l of languages) {
  if (ASCII_DIGIT_LOCALES.has(l.code)) continue;
  const leaks = [];
  for (const key of KEYS) {
    const text = translate(l.code, key);
    // A digit is a leak unless it is part of a longer word-like token we cannot judge;
    // in practice every count in these keys is a standalone number.
    if (/[0-9]/.test(text)) leaks.push(`${key}:"${text.match(/.{0,12}[0-9].{0,12}/)[0]}"`);
  }
  ok(`${l.code}: translated copy is fully localised`, leaks.length === 0, leaks.join(' | '));
}

console.log('\nPUZZLE PROMPTS PER LOCALE AND CATEGORY');
const diffs = ['easy', 'medium', 'hard'];
for (const l of languages) {
  const problems = [];
  for (const difficulty of diffs) {
    for (const category of categories) {
      for (let level = 1; level <= 30; level += 7) {
        const p = makePuzzle(difficulty, level, l.code, 0, category);
        if (!p.prompt || p.prompt.length < 4) problems.push(`${difficulty}/${category}/${level}: empty prompt`);
        // Riddles are two lines by design - a number and an addend to reverse-and-add
        // into a four-digit answer - and the stylesheet renders them at display size.
        // Every other category is four independent clues, one digit each.
        const wantLines = category === 'riddles' ? 2 : 4;
        if (p.lines.length !== wantLines) problems.push(`${difficulty}/${category}/${level}: ${p.lines.length} lines, want ${wantLines}`);
        if (!/^\d{4}$/.test(p.answer)) problems.push(`${difficulty}/${category}/${level}: answer "${p.answer}"`);
        // Rendered as the browser would render it.
        const shown = toNumerals(p.prompt, l.code);
        if (/[0-9]/.test(shown) && !ASCII_DIGIT_LOCALES.has(l.code)) {
          problems.push(`${difficulty}/${category}/${level}: prompt leaks a digit: "${shown.slice(0, 40)}"`);
        }
      }
    }
  }
  ok(`${l.code}: 135 puzzles well-formed and localised`, problems.length === 0, problems.slice(0, 3).join(' | '));
}

console.log('\nSAME LANGUAGE MUST YIELD THE SAME PUZZLE');
for (const l of languages) {
  const a = makePuzzle('medium', 12, l.code, 0, 'math');
  const b = makePuzzle('medium', 12, l.code, 0, 'math');
  ok(`${l.code}: deterministic for a given level`, a.answer === b.answer && a.prompt === b.prompt, `${a.answer} vs ${b.answer}`);
}
// The arena stores one question per locale, so two players on the same language must
// be given the identical puzzle - that is the promise in the how-to copy.
for (const l of ['en', 'ja', 'ko', 'zh', 'ar']) {
  const a = makePuzzle('medium', 4, l, 7, 'riddles');
  const b = makePuzzle('medium', 4, l, 7, 'riddles');
  ok(`${l}: same locale + same round + same category -> same answer`, a.answer === b.answer, `${a.answer}/${b.answer}`);
}

console.log('\nNUMERALS ROUND-TRIP THROUGH THE CODE FIELD');
for (const l of languages) {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => toDigits(String(i), l.code)).join('');
  const roundTrip = fromNumerals(digits);
  const padded = fromNumerals(toDigits('0042', l.code));
  ok(`${l.code}: digit set is 10 distinct glyphs`, new Set(digits).size === 10, digits);
  ok(`${l.code}: renders and re-parses`, roundTrip === '0123456789' && padded === '0042', `${roundTrip} / ${padded}`);
}

console.log('\nCLOCKS, PRICES AND COUNTS');
for (const l of languages) {
  const clock = pad(7, 2, l.code) + ':' + pad(5, 2, l.code);
  const price = num(250, l.code);
  const attempts = pad(3, 2, l.code);
  ok(`${l.code}: clock/price/attempts render`, clock.length >= 5 && price.length >= 1 && attempts.length >= 2,
    `${clock} | ${price} | ${attempts}`);
}
// 250 is the crown price and the largest number the UI ever shows.
ok('crown price is not a raw digit string in CJK', !/[0-9]/.test(num(250, 'ja')) && !/[0-9]/.test(num(250, 'ko')) && !/[0-9]/.test(num(250, 'zh')),
  `${num(250, 'ja')} / ${num(250, 'ko')} / ${num(250, 'zh')}`);

console.log('\nRTL MARK');
for (const code of ['ar', 'ur']) {
  const r = makePuzzle('easy', 1, code, 0, 'math');
  ok(`${code}: puzzle lines carry the ASCII question mark (U+003F), not U+061F`,
    r.lines.every((line) => !line.includes('\u061F')), r.lines[0]);
}
for (const code of ['en', 'ja', 'ko', 'zh', 'ru', 'hi']) {
  const r = makePuzzle('easy', 1, code, 0, 'math');
  ok(`${code}: no Arabic question mark leaks into a non-RTL locale`, r.lines.every((line) => !line.includes('\u061F')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
