// Asserts that hosted AI really is gone, rather than merely switched off.
//
//   npm run test:no-ai
//
// Every other test here checks that something works. This one checks that something is
// absent, which is a different kind of claim and needs a different kind of evidence: a
// provider key left in an env file, a router module nothing imports, or a dead function
// still deployed is not a runtime failure, it is a leftover, and leftovers are how a
// project ends up one careless deploy away from spending money again.
//
// The allowlist below is the interesting part. Some mentions must survive, and each one is
// there for a stated reason rather than because the grep was inconvenient.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = '.';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.temp', '.vite', '.claude']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html', '.sql', '.toml', '.md', '.yml', '.yaml']);

/**
 * Mentions that are allowed, each with the reason it is still correct.
 *
 * `file:line` is not a pattern but a location, for the handful of places where the right
 * thing to do was name the thing in order to say it had gone.
 */
const ALLOWED = [
  // The guard refuses to write anything shaped like a provider key. A credential shape does
  // not stop being one because this project stopped issuing it.
  { file: 'supabase/functions/_shared/guard.ts', why: 'SECRET_PATTERNS still detects a leaked OpenRouter key' },
  { file: 'scripts/scan-secrets.mjs', why: 'the pre-push scan still refuses a committed OpenRouter key' },
  // Test fixtures. The guard's refusal tests need a real-looking key, and a key-shaped
  // string is the only thing that exercises the pattern.
  { file: 'scripts/test-agent-guard.mjs', why: 'fixture: proves the guard refuses a key-shaped string' },
  { file: 'scripts/test-agent-plan.mjs', why: 'fixture: proves a smuggled key is dropped from a plan' },
  { file: 'scripts/test-agent.mjs', why: 'fixture: proves the bridge refuses a forged .env' },
  // The migration that removed it has to name what it removed.
  { file: 'supabase/migrations/202609280001_remove_hosted_ai.sql', why: 'the removal migration' },
  // Prose explaining the absence.
  { file: '.env.example', why: 'tells a reader there is deliberately no key and how to revoke the old one' },
  { file: 'supabase/.env.example', why: 'same, for the edge function secrets' },
  { file: 'scripts/prune-vault.mjs', why: 'finds and removes a provider key left in the vault' },
  { file: 'scripts/db-rls-sim.mjs', why: 'asserts the AI objects are absent from the database' },
  { file: 'scripts/solo-e2e.mjs', why: 'asserts the AI counter table is absent' },
  // This file, which necessarily spells every one of them out in order to look for it.
  { file: 'scripts/test-no-ai.mjs', why: 'this check' },
];

/**
 * Applied on top of the allowlist, by path prefix.
 *
 * Migration history is immutable. The four migrations that created the provider ledger and
 * the hint context function have to keep naming them, because a migration that no longer
 * described what it did would be a lie about the past, and because a database part-way
 * through the sequence applies them in order. The removal is a new migration at the end,
 * which is the only correct way to undo anything.
 */
const SKIP_PREFIXES = ['supabase/migrations/'];

const PATTERNS = [
  { re: /OPENROUTER_API_KEY/, label: 'the OpenRouter key name' },
  { re: /OPENROUTER_FREE_MODELS/, label: 'the OpenRouter model list' },
  { re: /GOOGLE_AI_API_KEY|GROQ_API_KEY|CEREBRAS_API_KEY|MISTRAL_API_KEY/, label: 'a provider key name' },
  { re: /openrouter\.ai/, label: 'the OpenRouter endpoint' },
  { re: /@mlc-ai\/web-llm|webllm|WebLLM/i, label: 'WebLLM' },
  { re: /CreateMLCEngine/, label: 'the WebLLM engine factory' },
  { re: /askFree|accountVia|ai_provider_today|record_ai_provider_use/, label: 'the provider router' },
  { re: /localAiReady|loadLocalAi|localAiStatus|localAiSupported/, label: 'the WebLLM status API' },
  { re: /onDeviceWebGpu|onDeviceDownload|onDeviceReady|onDeviceOff/, label: 'a removed on-device AI string' },
  { re: /op:\s*'plan'/, label: 'the server-side planning op' },
];

let problems = 0;
const fail = (m) => { problems++; console.log(`FAIL  ${m}`); };

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(entry))) acc.push(full);
  }
  return acc;
}

console.log('FILES THAT MUST NOT EXIST');
const mustBeGone = [
  'supabase/functions/_shared/router.ts',
  'supabase/functions/_shared/providers.ts',
  'supabase/functions/_shared/hint.ts',
  'supabase/functions/ai-hint',
  'src/local-ai.ts',
  'scripts/test-router.mjs',
  'scripts/test-providers.mjs',
  'scripts/test-ai-hint.mjs',
  'scripts/test-local-ai.mjs',
  'scripts/test-hint-tidy.mjs',
];
for (const f of mustBeGone) {
  if (existsSync(f)) fail(`${f} still exists`);
}
if (!problems) console.log(`OK    all ${mustBeGone.length} are gone`);

console.log('\nDEPENDENCIES');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const banned = Object.keys(deps).filter((d) => /web-llm|openai|anthropic|@google\/generative|langchain|transformers/i.test(d));
if (banned.length) fail(`model runtime still in package.json: ${banned.join(', ')}`);
else console.log(`OK    none of the ${Object.keys(deps).length} dependencies is a model runtime`);
const lock = readFileSync('package-lock.json', 'utf8');
if (/@mlc-ai\/web-llm/.test(lock)) fail('package-lock.json still resolves @mlc-ai/web-llm');
else console.log('OK    the lockfile does not resolve it either');

console.log('\nSOURCE MENTIONS');
const files = walk(ROOT).filter((f) => !/[\\/]\.env$/.test(f) && relative(ROOT, f) !== '.env');
let scanned = 0;
let skippedHistory = 0;
for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) { skippedHistory++; continue; }
  if (ALLOWED.some((a) => a.file === rel)) continue;
  const text = readFileSync(file, 'utf8');
  scanned++;
  for (const { re, label } of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const line = text.slice(0, m.index).split('\n').length;
    fail(`${rel}:${line} mentions ${label} ("${m[0]}")`);
  }
}
if (!problems) {
  console.log(`OK    ${scanned} files scanned, no mention of hosted AI`);
  console.log(`OK    ${skippedHistory} migration(s) skipped, history is immutable`);
}

console.log('\nMIGRATIONS');
const mig = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const removing = mig.find((f) => /remove_hosted_ai/.test(f));
if (!removing) fail('there is no migration removing the hosted-AI objects');
else console.log(`OK    ${removing} drops them`);

console.log('\nALLOWLIST');
for (const a of ALLOWED) {
  const present = existsSync(a.file);
  if (!present) fail(`allowlisted file ${a.file} no longer exists - drop the entry`);
  else console.log(`OK    ${a.file}  (${a.why})`);
}

console.log(`\n${problems ? `${problems} problem(s)` : 'hosted AI is gone: no provider, no runtime, no leftovers'}`);
process.exit(problems ? 1 : 0);
