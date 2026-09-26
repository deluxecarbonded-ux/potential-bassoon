// Pre-push secret scan. Fails loudly if any known credential or credential-shaped
// string is present in a file git would actually track.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { execFileSync } from "node:child_process";

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

// The role claim of any JWT in this file, or '' if there is none. The claim list below
// was written when a Supabase key was still a plaintext JSON object in a config file,
// so the file was searched for a literal `role: "anon"`. A JWT carries that claim
// base64-encoded in its payload, where a text search cannot see it, so every anon key
// ever written tripped the "must not be committed" branch - including the one in .env,
// which is ignored precisely because it is safe to keep.
function jwtRoles(text) {
  const roles = new Set();
  for (const m of text.matchAll(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const claim = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString('utf8'));
      if (claim && typeof claim.role === 'string') roles.add(claim.role);
    } catch { /* not a JWT we can read */ }
  }
  return roles;
}

// Only files git would actually track, per the header comment. That is everything
// already tracked plus everything untracked-but-not-ignored: a file about to be added
// is the dangerous case and still has to be scanned, while .env must not be, and
// walk() cannot tell the two apart because it never consults .gitignore.
function trackable() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return out.split('\0').filter(Boolean)
    // git lists a tracked file that has been deleted from the working tree but not yet
    // staged, so confirm the file is actually there before trying to read it.
    .filter((f) => existsSync(f))
    .filter((f) => !IGNORED_DIRS.has(f.split(/[\\/]/)[0]) && ALLOWED_EXT.has(extname(f)));
}

const files = trackable();
let problems = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [label, re] of SECRETS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (!m) continue;
    // The anon/publishable key is a public, RLS-limited credential and is meant to
    // ship to browsers, so it is reported but not treated as a failure.
    const isPublicKey = label === 'Supabase service_role JWT' &&
      (jwtRoles(text).has('anon') || /role["']?:\s*["']?anon/.test(text));
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
