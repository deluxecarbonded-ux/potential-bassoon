// Validates the numeral layer in isolation: digit sets, display mapping, input
// parsing, grouping, padding, and the round-trip that matters most for the game.
import { languages, toNumerals, fromNumerals, num, pad, translate } from '../src/i18n.ts';

let pass = 0, fail = 0;
const ok = (label, cond, got) => {
  cond ? pass++ : fail++;
  if (!cond) console.log(`FAIL  ${label}  got: ${JSON.stringify(got)}`);
};

const ZERO = '۰'; // ۰ extended Arabic-Indic (ar renders this set)
const NINE = '۹'; // ۹
const PLAIN_ZERO = '٠'; // ٠ plain Arabic-Indic, still accepted on input
const PLAIN_NINE = '٩'; // ٩
const DEV_ZERO = '०'; // ०
const FW_NINE = '９'; // ９
const UR_NINE = '۹'; // ۹

console.log('DIGIT SETS');
for (const l of languages) {
  const set = [0,1,2,3,4,5,6,7,8,9].map((i) => toNumerals(String(i), l.code)).join('');
  const expected = {
    en: '0123456789', es: '0123456789', fr: '0123456789', de: '0123456789',
    pt: '0123456789', it: '0123456789', nl: '0123456789', ru: '0123456789',
    tr: '0123456789', id: '0123456789',
    // Arabic uses Eastern Arabic-Indic (U+066x); Urdu uses Extended (U+06Fx).
    ar: PLAIN_ZERO + '١٢٣٤٥٦٧٨' + PLAIN_NINE,
    ur: '۰۱۲۳۴۵۶۷۸' + UR_NINE,
    hi: DEV_ZERO + '१२३४५६७८९',
    ja: '０１２３４５６７８' + FW_NINE, ko: '０１２３４５６７８' + FW_NINE, zh: '０１２３４５６７８' + FW_NINE,
  }[l.code];
  ok(`${l.code} digit set`, set === expected, set);
  const uniq = new Set(set).size === 10;
  ok(`${l.code} has 10 distinct glyphs`, uniq, set);
}

// Display mapping must not disturb anything that is not an ASCII digit.
ok('letters/punctuation survive', toNumerals('Level 01 of 90 — done!', 'ar') === `Level ${toNumerals('01','ar')} of ${toNumerals('90','ar')} — done!`);
// A keycap emoji is a digit plus a variation selector plus U+20E3; the selector and
// the enclosing mark must survive, only the digit itself is rewritten.
ok('emoji survive', toNumerals('2️⃣ win', 'hi') === `${toNumerals('2','hi')}️⃣ win`, toNumerals('2️⃣ win','hi'));
ok('no surrogate splitting', toNumerals('12', 'ja').length === 2, [...toNumerals('12','ja')].length);

// Input parsing: every supported script, in every locale, must yield ASCII.
console.log('\nINPUT PARSING');
for (const l of languages) {
  const native = toNumerals('4071', l.code);
  ok(`${l.code} native -> ascii`, fromNumerals(native) === '4071', fromNumerals(native));
  // cross-script: digits typed or pasted from another keyboard than the active one
  ok(`${l.code} accepts plain arabic-indic`, fromNumerals(PLAIN_ZERO + PLAIN_NINE + '٠١') === '0901', fromNumerals(PLAIN_ZERO + PLAIN_NINE + '٠١'));
  ok(`${l.code} accepts extended arabic-indic`, fromNumerals(ZERO + NINE + '۰۱') === '0901', fromNumerals(ZERO + NINE + '۰۱'));
  ok(`${l.code} accepts hi digits`, fromNumerals(DEV_ZERO + '९९') === '099', fromNumerals(DEV_ZERO + '९९'));
  ok(`${l.code} accepts ur digits`, fromNumerals('۰۱' + UR_NINE) === '019', fromNumerals('۰۱' + UR_NINE));
  ok(`${l.code} accepts fullwidth`, fromNumerals('１２３４') === '1234', fromNumerals('１２３４'));
  ok(`${l.code} round-trips`, fromNumerals(toNumerals('9876543210', l.code)) === '9876543210');
  // fromNumerals maps digits only; the code field additionally discards non-digits.
  // This is the exact pipeline CodeEntry uses.
  const typed = toNumerals('4a0' + toNumerals('7', l.code) + 'b', l.code);
  ok(`${l.code} code-field pipeline`, fromNumerals(typed).replace(/[^0-9]/g,'').slice(0,4) === '407',
     fromNumerals(typed).replace(/[^0-9]/g,'').slice(0,4));
  ok(`${l.code} never exceeds 4 digits`, fromNumerals(typed + toNumerals('99', l.code)).replace(/[^0-9]/g,'').slice(0,4).length === 4,
     fromNumerals(typed + toNumerals('99', l.code)).replace(/[^0-9]/g,'').slice(0,4));
}

// Grouping
console.log('\nGROUPING');
ok('en 1234567', num(1234567, 'en') === '1,234,567', num(1234567, 'en'));
ok('de 1234567', num(1234567, 'de') === '1.234.567', num(1234567, 'de'));
ok('hi uses lakh/crore', num(1234567, 'hi') === toNumerals('12,34,567', 'hi'), num(1234567, 'hi'));
ok('hi 12345', num(12345, 'hi') === toNumerals('12,345', 'hi'), num(12345, 'hi'));
ok('en 999 untouched', num(999, 'en') === '999', num(999, 'en'));
ok('en 0', num(0, 'en') === '0', num(0, 'en'));
ok('negative', num(-4200, 'en') === '-4,200', num(-4200, 'en'));
ok('ar uses eastern arabic-indic + U+066C', num(1234567, 'ar') === '١٬٢٣٤٬٥٦٧', num(1234567, 'ar'));
ok('ur uses extended arabic-indic + U+066C', num(1234567, 'ur') === toNumerals('1٬234٬567', 'ur'), num(1234567, 'ur'));
ok('en 30 (a price)', num(30, 'en') === '30', num(30, 'en'));
ok('ar 30 (a price)', num(30, 'ar') === toNumerals('30', 'ar'), num(30, 'ar'));

// Padding
console.log('\nPADDING');
ok('pad en 7 -> 07', pad(7, 2, 'en') === '07', pad(7, 2, 'en'));
ok('pad ar 7 -> 0+7', pad(7, 2, 'ar') === toNumerals('07', 'ar'), pad(7, 2, 'ar'));
ok('pad ja 12 -> １２', pad(12, 2, 'ja') === '１２', pad(12, 2, 'ja'));
ok('pad no truncation', pad(123, 2, 'en') === '123', pad(123, 2, 'en'));

// Translations carry embedded numerals through translate()
console.log('\nTRANSLATIONS');
ok('ar 90 levels', translate('ar', 'soloDesc').includes(toNumerals('90', 'ar')), translate('ar', 'soloDesc').slice(0, 40));
ok('hi 90 levels', translate('hi', 'soloDesc').includes(toNumerals('90', 'hi')), translate('hi', 'soloDesc').slice(0, 40));
ok('ur 90 levels', translate('ur', 'soloDesc').includes(toNumerals('90', 'ur')), translate('ur', 'soloDesc').slice(0, 40));
ok('zh 90 levels', translate('zh', 'soloDesc').includes('９０'), translate('zh', 'soloDesc').slice(0, 40));
ok('en unchanged', translate('en', 'soloDesc').includes('90'), translate('en', 'soloDesc').slice(0, 40));
// The Arabic copy spells the count out ("لاعبان" = two players) instead of using a
// digit, so there is nothing to localise. Assert it is left intact, not mangled.
ok('word-form counts untouched', translate('ar', 'needPlayers') === 'يلزم لاعبان على الأقل.', translate('ar', 'needPlayers'));
ok('es digit count localised', translate('es', 'needPlayers') === 'Se necesitan 2 jugadores.', translate('es', 'needPlayers'));
ok('newline escape intact', translate('en', 'sidebarNote').includes('\n'), 'missing \\n');
ok('unknown key falls through', translate('en', 'nope_xyz') === 'nope_xyz', translate('en', 'nope_xyz'));
ok('unknown locale falls back to en', translate('xx', 'level') === 'Level', translate('xx', 'level'));
ok('digit keys not user-visible strings', translate('en', 'digit0') === '0', translate('en', 'digit0'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
