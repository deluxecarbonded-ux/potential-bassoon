// Validates the numeral layer in isolation: digit sets, display mapping, input
// parsing, grouping, cardinal reading, padding, and the round-trip that matters most
// for the game.
import { languages, toDigits, toNumerals, fromNumerals, num, pad, translate, numeralReading, numeralRegisters } from '../src/i18n.ts';

let pass = 0, fail = 0;
const ok = (label, cond, got) => {
  cond ? pass++ : fail++;
  if (!cond) console.log(`FAIL  ${label}  got: ${JSON.stringify(got)}`);
};
const eq = (label, got, want) => ok(label, got === want, got);

const ZERO = '۰'; // ۰ extended Arabic-Indic (ar renders this set)
const NINE = '۹'; // ۹
const PLAIN_ZERO = '٠'; // ٠ plain Arabic-Indic, still accepted on input
const PLAIN_NINE = '٩'; // ٩
const DEV_ZERO = '०'; // ०
const FW_NINE = '９'; // ９
const UR_NINE = '۹'; // ۹

// Built from code points rather than pasted, because a hand-typed CJK literal in a
// test file is exactly the kind of thing that silently rots.
const HAN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];       // ja
const HAN_ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];   // zh, read
const HAN_ZH_DIGIT = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九']; // zh, written
const HANGUL = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];   // ko
const FINANCIAL = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const FULLWIDTH = ['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const NATIVE_KO = ['영', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];

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
    ja: HAN.join(''), ko: HANGUL.join(''), zh: HAN_ZH.join(''),
  }[l.code];
  eq(`${l.code} digit set`, set, expected);
  ok(`${l.code} has 10 distinct glyphs`, new Set(set).size === 10, set);
}

// The alternate registers the Settings screen offers.
console.log('\nREGISTERS');
eq('zh registers', JSON.stringify(numeralRegisters('zh')), JSON.stringify([['', 'numeralSmall'], ['financial', 'numeralFinancial']]));
eq('ja registers', JSON.stringify(numeralRegisters('ja')), JSON.stringify([['', 'numeralKanji'], ['fullwidth', 'numeralFullwidth']]));
eq('ko registers', JSON.stringify(numeralRegisters('ko')), JSON.stringify([['', 'numeralSino'], ['native', 'numeralNative']]));
eq('en has no choice', JSON.stringify(numeralRegisters('en')), '[]');
// A code, a clock and a keypad take the digit forms. Chinese is the only one of the
// three with two zeros: 零 is the number, as in 零 levels left, while 〇 is the digit,
// as in the blank code 〇〇 or the year 二〇二六. The two are not interchangeable.
for (const [id, want] of [['zh', HAN_ZH_DIGIT], ['ja', HAN], ['ko', HANGUL]])
  eq(`${id} positional digit set`, toDigits('0123456789', id), want.join(''));
for (const [id, want] of [['zh#financial', FINANCIAL], ['ja#fullwidth', FULLWIDTH], ['ko#native', NATIVE_KO]])
  eq(`${id} digit set`, [0,1,2,3,4,5,6,7,8,9].map(i => toDigits(String(i), id)).join(''), want.join(''));
eq('zh reads zero as 零', toNumerals('0', 'zh'), '零');
eq('zh writes zero as 〇', toDigits('0', 'zh'), '〇');
eq('zh financial keeps 零 as the zero', toDigits('0', 'zh#financial'), '零');
// Native Korean is words, not glyphs, and words cannot be stacked into a number.
eq('native ko 1-9 are single words', toDigits('123456789', 'ko#native'), '하나둘셋넷다섯여섯일곱여덟아홉');

// Display mapping must not disturb anything that is not an ASCII digit.
ok('letters/punctuation survive', toNumerals('Level 01 of 90 — done!', 'ar') === `Level ${toNumerals('01','ar')} of ${toNumerals('90','ar')} — done!`);
// A keycap emoji is a digit plus a variation selector plus U+20E3; the selector and
// the enclosing mark must survive, only the digit itself is rewritten.
ok('emoji survive', toNumerals('2️⃣ win', 'hi') === `${toNumerals('2','hi')}️⃣ win`, toNumerals('2️⃣ win','hi'));
// An astral character in front of a number must not be torn apart by the run split.
eq('astral char before a run', toNumerals('🌒12', 'ja'), '🌒十二');
eq('astral char survives toDigits', toNumerals('🌒1', 'ja'), '🌒一');
eq('astral char is not split', [...toNumerals('🌒12', 'ja')].length, 3);
// A four-digit run is a code and stays positional; the run split must not fire on it.
eq('four-digit run is positional', toNumerals('1234', 'zh'), '一二三四');
eq('four-digit run inside a sentence', toNumerals('code 1234 here', 'ko'), 'code 일이삼사 here');

// Input parsing: every supported script, in every locale, must yield ASCII.
console.log('\nINPUT PARSING');
for (const l of languages) {
  const native = toNumerals('4071', l.code);
  eq(`${l.code} native -> ascii`, fromNumerals(native), '4071');
  // cross-script: digits typed or pasted from another keyboard than the active one
  eq(`${l.code} accepts plain arabic-indic`, fromNumerals(PLAIN_ZERO + PLAIN_NINE + '٠١'), '0901');
  eq(`${l.code} accepts extended arabic-indic`, fromNumerals(ZERO + NINE + '۰۱'), '0901');
  eq(`${l.code} accepts hi digits`, fromNumerals(DEV_ZERO + '९९'), '099');
  eq(`${l.code} accepts ur digits`, fromNumerals('۰۱' + UR_NINE), '019');
  // The fullwidth block is no longer any locale's own set, but it is what the CJK
  // locales displayed until they gained real digits.
  eq(`${l.code} accepts fullwidth`, fromNumerals('１２３４'), '1234');
  // A code is positional, so the round trip runs through toDigits. toNumerals on a
  // ten-digit run would read it as a quantity, which is the point of the two.
  eq(`${l.code} round-trips`, fromNumerals(toDigits('9876543210', l.code)), '9876543210');
  // fromNumerals maps digits only; the code field additionally discards non-digits.
  // This is the exact pipeline CodeEntry uses.
  const typed = toNumerals('4a0' + toNumerals('7', l.code) + 'b', l.code);
  eq(`${l.code} code-field pipeline`, fromNumerals(typed).replace(/[^0-9]/g,'').slice(0,4), '407');
  ok(`${l.code} never exceeds 4 digits`, fromNumerals(typed + toNumerals('99', l.code)).replace(/[^0-9]/g,'').slice(0,4).length === 4,
     fromNumerals(typed + toNumerals('99', l.code)).replace(/[^0-9]/g,'').slice(0,4));
}
// A code pasted in a register the reader is not currently using must still open.
eq('accepts financial chinese', fromNumerals('壹贰叁肆'), '1234');
// Native Korean words are two characters for most digits, so this only works if the
// parser prefers the longest match: 일곱 must not parse as 1 followed by a stray ㄱ.
eq('accepts native korean', fromNumerals('하나둘셋넷'), '1234');
eq('accepts native korean 7', fromNumerals('영일곱여덟아홉'), '0789');
eq('accepts kanji', fromNumerals('一二三四'), '1234');
eq('accepts hangul', fromNumerals('일이삼사'), '1234');

// Grouping
console.log('\nGROUPING');
eq('en 1234567', num(1234567, 'en'), '1,234,567');
eq('de 1234567', num(1234567, 'de'), '1.234.567');
eq('hi uses lakh/crore', num(1234567, 'hi'), toNumerals('12,34,567', 'hi'));
eq('hi 12345', num(12345, 'hi'), toNumerals('12,345', 'hi'));
eq('en 999 untouched', num(999, 'en'), '999');
eq('en 0', num(0, 'en'), '0');
eq('negative', num(-4200, 'en'), '-4,200');
eq('ar uses eastern arabic-indic + U+066C', num(1234567, 'ar'), '١٬٢٣٤٬٥٦٧');
eq('ur uses extended arabic-indic + U+066C', num(1234567, 'ur'), toNumerals('1٬234٬567', 'ur'));
eq('en 30 (a price)', num(30, 'en'), '30');
eq('ar 30 (a price)', num(30, 'ar'), toNumerals('30', 'ar'));

// Cardinal reading. Chinese and Japanese count in fours of digits under 万/億/兆 and
// Sino-Korean under 만, and the three differ in where they drop a leading one and
// whether they name an interior zero at all.
console.log('\nCARDINAL READING');
const cards = {
  // value: [zh, ja, ko]
  0:   ['零', '〇', '영'],  1:   ['一', '一', '일'],
  10:  ['十', '十', '십'],
  11:  ['十一', '十一', '십일'],
  12:  ['十二', '十二', '십이'],
  20:  ['二十', '二十', '이십'],
  99:  ['九十九', '九十九', '구십구'],
  // Chinese keeps the one before 百 and 千; Japanese and Korean drop it.
  100: ['一百', '百', '백'],
  101: ['一百零一', '百一', '백일'],
  110: ['一百一十', '百一十', '백일십'],
  123: ['一百二十三', '百二十三', '백이십삼'],
  1000:['一千', '千', '천'],
  1005:['一千零五', '千五', '천오'],
  1234:['一千二百三十四', '千二百三十四', '천이백삼십사'],
  10000:['一万', '万', '만'],
  // A multiplier that is not standing alone keeps its one: 11000 is 一万一千.
  10001:['一万零一', '一万一', '일만일'],
  11000:['一万一千', '一万一千', '일만일천'],
  12345:['一万二千三百四十五', '一万二千三百四十五', '일만이천삼백사십오'],
  100000:['十万', '十万', '십만'],
  1000000:['一百万', '百万', '백만'],
  100000000:['一亿', '億', '억'],
  12345678:['一千二百三十四万五千六百七十八', '千二百三十四万五千六百七十八', '천이백삼십사만오천육백칠십팔'],
};
for (const [value, want] of Object.entries(cards)) {
  eq(`zh ${value}`, num(Number(value), 'zh'), want[0]);
  eq(`ja ${value}`, num(Number(value), 'ja'), want[1]);
  eq(`ko ${value}`, num(Number(value), 'ko'), want[2]);
}
// A plain register writes plain digits and takes the generic separator.
eq('ja#fullwidth groups by three', num(1234567, 'ja#fullwidth'), '１,２３４,５６７');
eq('ja#fullwidth 30', num(30, 'ja#fullwidth'), '３０');
// A word register cannot be stacked, so quantities stay Sino-Korean while the
// keypad takes the counting words. This split is Korean's own.
eq('ko#native 12 is sino', num(12, 'ko#native'), '십이');
eq('ko#native 123456 is sino', num(123456, 'ko#native'), '십이만삼천사백오십육');
eq('ko#native code is native', toDigits('1234', 'ko#native'), '하나둘셋넷');
// The financial set renames the places along with the digits.
eq('zh#financial 12', num(12, 'zh#financial'), '壹拾贰');
eq('zh#financial 100', num(100, 'zh#financial'), '壹佰');
eq('zh#financial 1234', num(1234, 'zh#financial'), '壹仟贰佰叁拾肆');
// Past the largest unit the reader has, digits are left positional, not truncated.
eq('zh past the last unit', num(1e17, 'zh'), toDigits('1'.padEnd(18, '0'), 'zh'));

// Prose reads a run as a number, unless the run is a four-digit code.
console.log('\nPROSE');
eq('zh 90 is a number', toNumerals('90', 'zh'), '九十');
eq('zh 1234 is a code', toNumerals('1234', 'zh'), '一二三四');
eq('ja 45 seconds', toNumerals('45s', 'ja'), '四十五s');
eq('ko 45 seconds', toNumerals('45s', 'ko'), '사십오s');
eq('zh equation', toNumerals('12 + 3 = 15', 'zh'), '十二 + 三 = 十五');
eq('en prose untouched', toNumerals('12 + 3 = 15', 'en'), '12 + 3 = 15');
eq('ar prose untouched', toNumerals('12 + 3 = 15', 'ar'), '١٢ + ٣ = ١٥');

// How each language says a digit, for the keypad tooltip and its accessible name.
console.log('\nREADINGS');
eq('ja 0', numeralReading(0, 'ja'), 'rei');
// 4 and 9 take the reading that is not homophonically loaded: し sounds like death
// and く like suffering, so よん and きゅう are what a Japanese speaker uses.
eq('ja 4', numeralReading(4, 'ja'), 'yon');
eq('ja 9', numeralReading(9, 'ja'), 'kyū');
eq('ja 7', numeralReading(7, 'ja'), 'nana');
eq('ko 1', numeralReading(1, 'ko'), 'il');
eq('ko#native 1', numeralReading(1, 'ko#native'), 'hana');
eq('ko#native 5', numeralReading(5, 'ko#native'), 'daseot');
eq('zh 0', numeralReading(0, 'zh'), 'líng');
eq('zh 3', numeralReading(3, 'zh'), 'sān');
// A register that already shows Latin or Arabic digits needs no romanisation.
eq('ja#fullwidth needs none', numeralReading(3, 'ja#fullwidth'), '');
eq('en needs none', numeralReading(3, 'en'), '');
eq('ar needs none', numeralReading(3, 'ar'), '');

// Padding
console.log('\nPADDING');
eq('pad en 7 -> 07', pad(7, 2, 'en'), '07');
eq('pad ar 7 -> 0+7', pad(7, 2, 'ar'), toNumerals('07', 'ar'));
// A timer is a clock face, not a quantity, so it stays positional: 〇五, not 五.
eq('pad ja 12 -> 十二 positionally', pad(12, 2, 'ja'), '一二');
eq('pad zh 5 -> 0+5', pad(5, 2, 'zh'), '〇五');
eq('pad ko#native 5', pad(5, 2, 'ko#native'), '영다섯');
eq('pad no truncation', pad(123, 2, 'en'), '123');

// Translations carry embedded numerals through translate()
console.log('\nTRANSLATIONS');
ok('ar 90 levels', translate('ar', 'soloDesc').includes(toNumerals('90', 'ar')), translate('ar', 'soloDesc').slice(0, 40));
ok('hi 90 levels', translate('hi', 'soloDesc').includes(toNumerals('90', 'hi')), translate('hi', 'soloDesc').slice(0, 40));
ok('ur 90 levels', translate('ur', 'soloDesc').includes(toNumerals('90', 'ur')), translate('ur', 'soloDesc').slice(0, 40));
ok('zh 90 levels', translate('zh', 'soloDesc').includes('九十'), translate('zh', 'soloDesc'));
ok('ja 90 levels', translate('ja', 'soloDesc').includes('九十'), translate('ja', 'soloDesc'));
ok('ko 90 levels', translate('ko', 'soloDesc').includes('구십'), translate('ko', 'soloDesc'));
ok('en unchanged', translate('en', 'soloDesc').includes('90'), translate('en', 'soloDesc').slice(0, 40));
// translate() takes the register separately from the language of the copy, which is
// what lets Settings change the numerals without touching the locale.
eq('register reaches translate', translate('ko', 'soloDesc', 'ko#native'), translate('ko', 'soloDesc'));
// The Arabic copy spells the count out ("لاعبان" = two players) instead of using a
// digit, so there is nothing to localise. Assert it is left intact, not mangled.
eq('word-form counts untouched', translate('ar', 'needPlayers'), 'يلزم لاعبان على الأقل.');
eq('es digit count localised', translate('es', 'needPlayers'), 'Se necesitan 2 jugadores.');
// The CJK copy spells its counts out in the language's own numerals, because a bare
// "90" in a sentence would be read as a code and come out as 九〇.
ok('newline escape intact', translate('en', 'sidebarNote').includes('\n'), 'missing \\n');
eq('unknown key falls through', translate('en', 'nope_xyz'), 'nope_xyz');
eq('unknown locale falls back to en', translate('xx', 'level'), 'Level');
eq('digit keys not user-visible strings', translate('en', 'digit0'), '0');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
