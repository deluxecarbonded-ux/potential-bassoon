// Finds JSX expressions that render a number without going through num/pad/toNumerals.
import { readFileSync } from "node:fs";
const src = readFileSync("src/App.tsx", "utf8");
const WRAPPED = /\b(num|pad|toNumerals|fromNumerals|t|String|length|Math)\s*[({]/;
const lines = src.split("\n");
const hits = [];
lines.forEach((line, i) => {
  for (const m of line.matchAll(/\{([^{}]{1,70})\}/g)) {
    const e = m[1].trim();
    if (WRAPPED.test(e)) continue;
    // a bare identifier or simple member that is plausibly numeric
    if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*|\[\d+\])*$/.test(e)) {
      const NUMERIC_NAME = /^(level|levels|round|rounds|score|coins|reward|attempts|seconds|elapsed|remaining|balance|quantity|wins|total|count|index|nonce|attempt|misses|steps|progress)$/i;
      if (NUMERIC_NAME.test(e.split(".").pop() || e)) {
        hits.push(`L${i + 1}  {${e}}`);
      }
    }
  }
});
console.log(hits.length ? hits.join("\n") : "all numeric JSX renders are wrapped");
console.log(`\n${hits.length} unwrapped site(s)`);
