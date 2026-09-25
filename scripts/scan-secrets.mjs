// Pre-push secret scan. Fails loudly if any known credential or credential-shaped
// string is present in a file git would actually track.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.temp', '.vite']);
const ALLOWED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html', '.sql', '.toml', '.md', '.yml', '.yaml', '.txt', '']);

// Credentials are supplied through the environment so this scanner never becomes a
// second copy of the secret it is looking for.
//   $env:SCAN_SECRET_DB_PASSWORD='...'  node scripts/scan-secrets.mjs
const SECRETS = [
  ['OpenRouter API key', /sk-or-v1-[A-Za-z0-9]{20,}/],
  ['Supabase PAT', /sbp_[A-Za-z0-9]{20,}/],
  ['Supabase service_role JWT', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ['AWS access key id', /AKIA[0-9A-Z]{16}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['generic sk- key', /\bsk-[A-Za-z0-9]{32,}/],
  ['assigned secret literal', /\b(?:password|secret|api_?key|token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i],
];
for (const [label, value] of [
  ['Postgres password (from env)', process.env.SCAN_SECRET_DB_PASSWORD],
  ['Supabase PAT (from env)', process.env.SCAN_SECRET_PAT],
  ['OpenRouter key (from env)', process.env.SCAN_SECRET_OPENROUTER],
]) {
  if (value) SECRETS.push([label, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))]);
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (ALLOWED_EXT.has(extname(entry))) acc.push(full);
  }
  return acc;
}

const files = walk('.');
let problems = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [label, re] of SECRETS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (!m) continue;
    // The anon/publishable key is a public, RLS-limited credential and is meant to
    // ship to browsers, so it is reported but not treated as a failure.
    const isPublicKey = label === 'Supabase service_role JWT' && /role["']?:\s*["']?anon/.test(text);
    const shown = m[0].slice(0, 18) + '...';
    if (isPublicKey) {
      console.log(`note  ${relative('.', file)}: anon/publishable JWT (public by design) ${shown}`);
      continue;
    }
    problems++;
    console.log(`FAIL  ${relative('.', file)}: ${label}  ${shown}`);
  }
}

console.log(`\nscanned ${files.length} trackable files`);
console.log(problems ? `${problems} SECRET(S) MUST NOT BE COMMITTED` : 'no secrets found in trackable files');
process.exit(problems ? 1 : 0);
