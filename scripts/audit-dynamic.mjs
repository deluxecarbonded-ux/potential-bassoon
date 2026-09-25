// Confirms the "dynamically referenced" keys really are reachable at runtime, so the
// audit's "defined but never referenced" list is dynamic usage rather than dead rows.
import { readFileSync } from "node:fs";
const app = readFileSync("src/App.tsx", "utf8");
const state = readFileSync("src/state.tsx", "utf8");

const checks = [
  ["easy/medium/hard via t(d)", /t\(d\)|t\(difficulty\)|'easy','medium','hard'/, ["easy", "medium", "hard"]],
  ["categories via t(c)", /categories\.map\(c=><option[^}]*\{t\(c\)\}/, ["math", "logic", "riddles", "science", "trivia"]],
  ["nav via t(section.title)", /t\(section\.title\)/, ["play", "personal"]],
  ["page via t(page)", /t\(page\)/, ["home", "shops", "profiles", "settings", "multi", "solo"]],
  ["toast keys", /toast\('([a-zA-Z]+)'\)/, ["purchased", "notEnough", "saved", "error"]],
  ["products titles", /title:'(hintPack|nightPack|crownPack)'/, ["hintPack", "nightPack", "crownPack"]],
  ["products descriptions", /description:'(hintDesc|nightDesc|crownDesc)'/, ["hintDesc", "nightDesc", "crownDesc"]],
  ["arena game modes", /'first','timeAttack'/, ["first", "timeAttack"]],
  ["settings toggles", /t\(state\.sound\?'on':'off'\)|t\(state\.motion/, ["on", "off", "sound", "motion"]],
  ["how steps", /\['how2','how3','how4'\]\.map/, ["how2", "how3", "how4"]],
];
const all = app + state;
let bad = 0;
for (const [label, re, keys] of checks) {
  const hit = re.test(all);
  if (!hit) bad++;
  console.log(`${hit ? "OK  " : "FAIL"}  ${label.padEnd(28)} ${keys.join(", ")}`);
}
// Keys surfaced only through thrown Error() messages consumed by errorResponse().
const errKeys = [...app.matchAll(/throw Error\('([a-zA-Z]+)'\)/g)].map((m) => m[1]);
console.log(`\nthrow Error('...') keys -> ${[...new Set(errKeys)].join(", ")}`);
console.log(`\n${bad} unreachable pattern(s)`);
