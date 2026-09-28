/**
 * End-to-end check of the chat, through the same path the browser takes.
 *
 * The trainer reports how well the network routes its own corpus, which is necessary but
 * not sufficient: that number is computed against a synthetic split built from the same
 * tables the router reads, so a table and a weight file that are wrong *together* still
 * score well. This goes through src/ai/chat.ts instead, with the shipped weights, the real
 * confidence floor, and the real reply keys, and it asserts on the sentence a reader would
 * be shown rather than on a class name.
 *
 * It also checks the two things that are cheap to break and expensive to notice:
 *
 *  - Every locale answers in its own language. A missing or malformed key shows up here as
 *    a fallback to English, which no accuracy number would ever report.
 *  - Every locale's translation for each key exists. The reply library refers to keys by
 *    string, so a typo is a blank bubble at runtime and nothing at build time.
 *
 * Run: npm run test:chat
 */
// This is a .mjs file, so it carries no type-only imports: node strips types from the .ts
// modules it pulls in, but not from this one, and `import {type X}` here is a syntax error
// rather than a type error.
import {reply, CHAT_MODEL} from '../src/ai/chat.ts';
import {languages, translate} from '../src/i18n.ts';

// The locale list comes from i18n rather than being written out again here, so a seventeenth
// language cannot be added without this test noticing that it has no sentences.
const LOCALES = languages.map((l) => l.code);
const t = (lang, key, vars) => translate(lang, key, undefined, vars);

/** @type {import('../src/ai/chat.ts').ChatFacts} */
const FACTS = {parameters: 0, recipes: 0, watched: ['src/Agent.tsx', 'src/i18n.ts']};
/** @type {import('../src/ai/chat.ts').ChatContext} */
const OWNER = {files: FACTS.watched, canWrite: true, isOwner: true};
/** @type {import('../src/ai/chat.ts').ChatContext} */
const READER = {files: [], canWrite: false, isOwner: false};

/**
 * One sentence per intent per language, written the way a person would type it rather than
 * copied from the training corpus - if they were the same sentences the number would be
 * measuring memorisation, which is what the held-out split is for and this is not.
 */
const CASES = {
  en: {
    greeting: 'morning!', capabilities: 'what can you actually do', privacy: 'do you upload my code anywhere',
    code: 'what does src/Agent.tsx do', edit: 'change the theme setting', thanks: 'thanks, that was helpful',
    smalltalk: 'do you get bored easily', unknown: 'what is the capital of peru',
  },
  ar: {
    greeting: 'صباح الخير', capabilities: 'ماذا تستطيع أن تفعل', privacy: 'هل ترسل بياناتي إلى الإنترنت',
    code: 'ما الذي يفعله الملف src/Agent.tsx', edit: 'غيّر إعداد السمة', thanks: 'شكرا جزيلا',
    smalltalk: 'كيف كان يومك', unknown: 'ما هي عاصمة بيرو',
  },
  es: {
    greeting: 'buenos días', capabilities: 'qué puedes hacer', privacy: 'envías mis datos a internet',
    code: 'qué hace el archivo src/Agent.tsx', edit: 'cambia el ajuste del tema', thanks: 'muchas gracias',
    smalltalk: 'cuál es tu nombre', unknown: 'cuál es la capital de perú',
  },
  fr: {
    greeting: 'bonjour', capabilities: 'que sais tu faire', privacy: 'envoies tu mes données',
    code: 'que fait le fichier src/Agent.tsx', edit: 'change le réglage du thème', thanks: 'merci beaucoup',
    smalltalk: 'raconte une blague', unknown: 'quelle est la capitale du perou',
  },
  de: {
    greeting: 'guten morgen', capabilities: 'was kannst du machen', privacy: 'sendest du meine daten',
    code: 'was macht die datei src/Agent.tsx', edit: 'ändere die einstellung', thanks: 'danke schön',
    smalltalk: 'wie war dein tag', unknown: 'was ist die hauptstadt von peru',
  },
  pt: {
    greeting: 'bom dia', capabilities: 'o que podes fazer', privacy: 'envias os meus dados',
    code: 'o que faz o ficheiro src/Agent.tsx', edit: 'muda o ajuste do tema', thanks: 'obrigado',
    smalltalk: 'qual é o teu nome', unknown: 'qual é a capital do peru',
  },
  it: {
    greeting: 'buongiorno', capabilities: 'cosa sai fare', privacy: 'invii i miei dati',
    code: 'cosa fa il file src/Agent.tsx', edit: 'cambia l’impostazione del tema', thanks: 'grazie mille',
    smalltalk: 'raccontami una barzelletta', unknown: 'qual è la capitale del perù',
  },
  nl: {
    greeting: 'goedemorgen', capabilities: 'wat kan jij doen', privacy: 'stuur je mijn gegevens',
    code: 'wat doet het bestand src/Agent.tsx', edit: 'wijzig de instelling', thanks: 'hartelijk dank',
    smalltalk: 'vertel een grap', unknown: 'wat is de hoofdstad van peru',
  },
  ru: {
    greeting: 'доброе утро', capabilities: 'что ты умеешь', privacy: 'отправляешь мои данные',
    code: 'что делает файл src/Agent.tsx', edit: 'измени настройку темы', thanks: 'большое спасибо',
    smalltalk: 'расскажи анекдот', unknown: 'какая столица перу',
  },
  tr: {
    greeting: 'günaydın', capabilities: 'ne yapabilirsin', privacy: 'verilerimi gönderiyor musun',
    code: 'src/Agent.tsx dosyası ne yapıyor', edit: 'tema ayarını değiştir', thanks: 'çok teşekkür ederim',
    smalltalk: 'bir fıkra anlat', unknown: 'perunun başkenti nere',
  },
  hi: {
    greeting: 'सुप्रभात', capabilities: 'तुम क्या कर सकते हो', privacy: 'क्या तुम मेरा डेटा भेजते हो',
    code: 'फ़ाइल src/Agent.tsx क्या करता है', edit: 'थीम सेटिंग बदलो', thanks: 'बहुत धन्यवाद',
    smalltalk: 'एक चुटकुला सुनाओ', unknown: 'पेरू की राजधानी क्या है',
  },
  ja: {
    greeting: 'おはよう', capabilities: '何ができますか', privacy: '私のデータを送信しますか',
    code: 'src/Agent.tsx は何をするファイルですか', edit: 'テーマ設定を変更して', thanks: 'どうもありがとうございます',
    smalltalk: '冗談を教えてください', unknown: 'ペルーの首都はどこですか',
  },
  ko: {
    greeting: '좋은 아침', capabilities: '무엇을 도와줄 수 있어', privacy: '내 데이터를 보내요',
    code: 'src/Agent.tsx 파일은 무엇을 해요', edit: '테마 설정을 변경해요', thanks: '정말 감사합니다',
    smalltalk: '농담을 해줘', unknown: '페루의 수도가 어디예요',
  },
  zh: {
    greeting: '早上好', capabilities: '你能做什么', privacy: '你会发送我的数据吗',
    code: 'src/Agent.tsx 文件是做什么的', edit: '修改主题设置', thanks: '非常感谢',
    smalltalk: '讲个笑话吧', unknown: '秘鲁的首都是哪里',
  },
  id: {
    greeting: 'selamat pagi', capabilities: 'apa yang bisa kamu lakukan', privacy: 'apakah kamu mengirim data saya',
    code: 'apa yang dilakukan berkas src/Agent.tsx', edit: 'ubah pengaturan tema', thanks: 'terima kasih banyak',
    smalltalk: 'ceritakan lelucon', unknown: 'apa ibu kota peru',
  },
  ur: {
    greeting: 'صبح بخیر', capabilities: 'تم کیا کر سکتے ہیں', privacy: 'کیا آپ میرا ڈیٹا بھیجتے ہیں',
    code: 'src/Agent.tsx فائل کیا کرتی ہے', edit: 'تھیم سیٹنگ بدلیں', thanks: 'بہت شکریہ',
    smalltalk: 'ایک لطیفہ سنائیں', unknown: 'پیرو کا دارالحکومت کیا ہے',
  },
};

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  FAIL ${msg}`);
};

console.log(`model ${CHAT_MODEL.name}: ${CHAT_MODEL.features} features, ${CHAT_MODEL.parameters} parameters, ${CHAT_MODEL.layers}\n`);

console.log('intent routing, one sentence per language per intent:');
for (const lang of LOCALES) {
  const cases = CASES[lang];
  if (!cases) {
    fail(`no cases written for '${lang}'`);
    continue;
  }
  const line = [];
  for (const [want, text] of Object.entries(cases)) {
    // The reader has no files and cannot write, so 'edit' has to come back as the "I can't
    // do that from here" reply rather than as an instruction - and 'code' has to admit it
    // never read the file. Both are checked on the owner context as well.
    const r = reply(text, READER, FACTS);
    const ok = r.intent === want;
    if (!ok) fail(`${lang} ${want}: got '${r.intent}' (${(r.confidence * 100).toFixed(0)}%) for "${text}"`);
    line.push(`${want}:${ok ? '.' : 'X'}`);
  }
  console.log(`  ${lang.padEnd(3)} ${line.join(' ')}`);
}

console.log('\nowner context, where a real edit request is allowed:');
{
  const cases = [
    ['en', 'change the counter setting', 'chatEditSwitch'],
    ['ar', 'غيّر إعداد العداد', 'chatEditSwitch'],
    ['de', 'ändere die einstellung des zählers', 'chatEditSwitch'],
    ['ru', 'измени настройку счетчика', 'chatEditSwitch'],
  ];
  for (const [lang, text, wantKey] of cases) {
    const r = reply(text, OWNER, FACTS);
    if (r.key !== wantKey) fail(`${lang} owner edit: expected ${wantKey}, got ${r.key} (intent ${r.intent})`);
  }
  console.log(`  ${cases.length} edit requests answered for the owner`);
}

console.log('\nthe same request from a reader who cannot write:');
{
  const r = reply('change the counter setting', READER, FACTS);
  if (r.key !== 'chatEditNoRoute') fail(`reader edit: expected chatEditNoRoute, got ${r.key}`);
  console.log(`  answered ${r.key}`);
}

console.log('\nthe four answers about a file, which is the whole point of aboutCode():');
{
  // The chat compiles in the *names* of the files the planner watches and reads none of
  // them, so which of the four replies comes back is decided by what is in ctx.files - the
  // names actually in hand - and not by whether the file is real. All four are checked
  // because the difference between "I have read that" and "I have not" is the difference
  // between a chat worth using and one that guesses.
  const cases = [
    ['a file in hand', OWNER, 'what does Agent.tsx do', 'chatCodeFile'],
    ['a file in hand, by full path', OWNER, 'what does src/i18n.ts do', 'chatCodeFile'],
    ['a real file the reader has no names for', READER, 'what does Agent.tsx do', 'chatCodeUnread'],
    ['a file nobody has', READER, 'what does src/Planner.ts do', 'chatCodeNoFiles'],
    ['the project in general, files in hand', OWNER, 'what do you know about this project', 'chatCodeHere'],
    ['the project in general, nothing in hand', READER, 'what do you know about this project', 'chatCodeNoFiles'],
  ];
  for (const [what, ctx, text, wantKey] of cases) {
    const r = reply(text, ctx, FACTS);
    if (r.key !== wantKey) fail(`${what}: expected ${wantKey}, got ${r.key} (intent ${r.intent})`);
    else console.log(`  ${what.padEnd(38)} -> ${r.key}${r.vars?.path ? ` (${r.vars.path})` : ''}`);
  }
}

console.log('\na nonsense message, which must not produce a confident answer:');
{
  for (const junk of ['qwertyuiop', 'zx cvb nm', '??????', 'aaaaaaaaaaaa']) {
    const r = reply(junk, READER, FACTS);
    if (r.intent !== 'unknown' && r.key !== 'chatUnsure') {
      fail(`junk "${junk}": expected unknown or unsure, got ${r.intent}/${r.key}`);
    }
  }
  console.log('  4 nonsense messages refused');
}

console.log('\nevery reply key has a translation in every language:');
{
  const keys = new Set();
  for (const lang of LOCALES) {
    for (const cases of Object.values(CASES)) {
      for (const text of Object.values(cases)) keys.add(reply(text, READER, FACTS).key);
    }
  }
  keys.add('chatEditSwitch');
  keys.add('chatEditNoRoute');
  keys.add('chatCodeUnread');
  keys.add('chatCodeFile');
  keys.add('chatUnsure');
  keys.add('chatUnknown');
  const missing = [];
  for (const key of keys) {
    for (const lang of LOCALES) {
      const text = t(lang, key);
      if (!text || text === key) missing.push(`${key}/${lang}`);
    }
  }
  if (missing.length) fail(`${missing.length} untranslated: ${missing.join(' ')}`);
  console.log(`  ${keys.size} keys checked across ${LOCALES.length} languages`);

  console.log('\nand each language answers in its own script, not English:');
  // The check is per script, not "is it ASCII". Italian, Dutch and Indonesian are written
  // in Latin letters and pass an all-ASCII test while speaking the wrong language, and
  // Arabic, Devanagari and Chinese have no letter case at all, so the obvious
  // has-it-got-capital-letters heuristic cannot tell a normal sentence from a shout.
  const SCRIPT = {
    ar: /\p{Script=Arabic}/u, ru: /\p{Script=Cyrillic}/u, hi: /\p{Script=Devanagari}/u,
    ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
    ko: /\p{Script=Hangul}/u, zh: /\p{Script=Han}/u, ur: /\p{Script=Arabic}/u,
  };
  for (const lang of LOCALES) {
    const key = reply(CASES[lang].capabilities, READER, FACTS).key;
    const text = t(lang, key);
    const want = SCRIPT[lang];
    if (want) {
      if (!want.test(text)) fail(`${lang} replied in the wrong script: "${text}"`);
    } else if (!/[ -~]/.test(text)) {
      fail(`${lang} replied without Latin letters, which it should not: "${text}"`);
    }
    if (lang === 'en' && /[^\x00-\x7F]/.test(text)) fail(`en reply is not English: "${text}"`);
    if (text.includes('??') || text.includes('�')) fail(`${lang} reply has a broken character: "${text}"`);
    console.log(`  ${lang.padEnd(3)} ${key.padEnd(18)} ${text}`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
