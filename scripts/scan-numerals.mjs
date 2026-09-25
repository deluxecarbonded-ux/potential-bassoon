// Inventories every user-facing numeral in the app, filtering out non-display numerics
// (icon size, grid keys, stroke widths, etc). Read-only analysis.
import { readFileSync } from 'node:fs';

const files = ['src/App.tsx', 'src/state.tsx', 'src/i18n.ts'];
const IGNORE_PROP = /\b(size|key|width|height|strokeWidth|opacity|viewBox|fillRule|zIndex|index|colSpan|rowSpan|tabIndex|radius|weight|offset|gap|dash|stroke|opacity|itemProp|srcSet)\s*=\s*\{?\s*-?\d/;
const IGNORE_EXPR = /\b(size|length|key|index|idx|i|j|charCodeAt|codePointAt|slice|substr|substring)\b/;

const found = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, ln) => {
    // 1) digits sitting directly in text nodes or string literals
    for (const m of line.matchAll(/(^|>|\})\s*([^{}<>()]*\d[^{}<>()]*)\s*(?=<|\{|$)/g)) {
      const text = m[2].trim();
      if (!text) continue;
      if (IGNORE_PROP.test(text)) continue;
      found.push({ f, ln: ln + 1, kind: 'literal text', code: text.slice(0, 60) });
    }
    // 2) interpolations that evaluate to a number-ish value
    for (const m of line.matchAll(/\{([^{}]{0,140})\}/g)) {
      const e = m[1];
      if (IGNORE_PROP.test(e)) continue;
      if (IGNORE_EXPR.test(e) && !/\d/.test(e)) continue;
      if (!/\d|toLocaleString|padStart|Math\.|balance|score|level|coin|round|wins|total|count|remaining|timer|progress|length|index|\.map\(/.test(e)) continue;
      if (/^\s*(size|key)\s*=/.test(e)) continue;
      found.push({ f, ln: ln + 1, kind: 'expression', code: e.replace(/\s+/g, ' ').trim().slice(0, 80) });
    }
  });
}

const seen = new Set();
const uniq = found.filter((x) => {
  const k = `${x.kind}|${x.code}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log(`${uniq.length} distinct user-facing numeral sites\n`);
for (const x of uniq) console.log(`${x.f}:${x.ln}  [${x.kind}]  ${x.code}`);
