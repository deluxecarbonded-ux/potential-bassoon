// Validates the locales table for the failure mode that matters: a cell carrying
// text from the wrong script, which is what a mangled translation looks like
// (German words inside the French cell, Han characters inside the German one).
// Punctuation, acronyms such as "AI", and the \n escape are all allowed through.
import { readFileSync } from "node:fs";

const LANGS = ["en","ar","es","fr","de","pt","it","nl","ru","tr","hi","ja","ko","zh","id","ur"];

// Written with \u escapes so the ranges cannot be mangled by file encoding.
const SCRIPTS = [
  ["latin",     /[A-Za-z]/],
  ["cyrillic",  /[\u0400-\u04FF]/],
  ["arabic",    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/],
  ["devanagari",/[\u0900-\u097F]/],
  ["hangul",    /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/],
  ["kana",      /[\u3040-\u30FF\u31F0-\u31FF]/],
  ["han",       /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/],
];

const ALLOWED = {
  en: ["latin"], es: ["latin"], fr: ["latin"], de: ["latin"], pt: ["latin"],
  it: ["latin"], nl: ["latin"], tr: ["latin"], id: ["latin"],
  ru: ["cyrillic"],
  ar: ["arabic"], ur: ["arabic"],
  hi: ["devanagari"],
  ja: ["kana", "han"],
  ko: ["hangul"],
  zh: ["han"],
};

const scriptOf = (ch) => {
  for (const [name, re] of SCRIPTS) if (re.test(ch)) return name;
  return null;
};

// Latin proper nouns and acronyms that legitimately appear inside non-Latin cells.
const LATIN_OK = new Set(["supabase", "ai", "exotic", "manrope", "cairo", "noto", "url", "anon"]);

const lines = readFileSync("src/i18n.ts", "utf8").split("\n");
let problems = 0, checked = 0;

for (const line of lines) {
  if (!line.includes("|")) continue;
  if (/^\s*(export|import|const|function|let|declare)\s+[A-Za-z_{[]/.test(line)) continue;
  if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
  const parts = line.split("|");
  const key = parts[0];
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) continue;
  checked++;

  if (parts.length !== 17) {
    console.log(`FAIL  ${key}: ${parts.length - 1} values, expected 16`);
    problems++;
    continue;
  }
  for (let i = 0; i < 16; i++) {
    const v = parts[i + 1];
    const lang = LANGS[i];
    if (!v) { console.log(`FAIL  ${key}[${lang}]: empty`); problems++; continue; }
    // The table stores newlines as a literal \n escape; drop it so the escape's
    // own letters are not read as a stray Latin word.
    const text = v.replace(/\\n/g, " ");
    const allowed = ALLOWED[lang];
    const foreign = new Map();
    let run = "", runScript = null;
    const flush = () => {
      if (run.length >= 2 && runScript && !allowed.includes(runScript) && !LATIN_OK.has(run.toLowerCase())) {
        foreign.set(runScript, (foreign.get(runScript) || 0) + run.length);
      }
      run = ""; runScript = null;
    };
    for (const ch of text) {
      const s = scriptOf(ch);
      if (s !== runScript) { flush(); runScript = s; }
      run += ch;
    }
    flush();
    if (foreign.size) {
      const detail = [...foreign].map(([s, n]) => `${s}x${n}`).join(", ");
      console.log(`FAIL  ${key}[${lang}]: foreign ${detail} -> ${JSON.stringify(v.slice(0, 64))}`);
      problems++;
    }
  }
}

console.log(`\nchecked ${checked} rows across ${LANGS.length} locales`);
console.log(problems ? `${problems} problem(s)` : "table is clean: 16 values per row, no foreign script in any cell");
process.exit(problems ? 1 : 0);
