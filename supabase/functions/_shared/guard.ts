// What the agent is allowed to touch, and what it must never be talked into writing.
//
// This is the part of a self-modifying agent that has to be right before anything else
// is built, so it lives on its own, has no dependency on the model or on any request,
// and is unit tested against the real cases rather than trusted.
//
// Three separate questions, deliberately kept separate because they have different
// failure modes:
//
//   mayTouch(path)      is this a file the agent is allowed to write at all?
//   looksSecret(text)   does this content contain something that must never be written?
//   review(ops)         is this set of operations safe to apply, and what is being
//                       destroyed?
//
// Pure and dependency-free, so it runs identically under Deno and under Node with the
// types stripped, and so scripts/test-agent-guard.mjs can exercise it without spending a
// single free-model request.

/** Directories and files that are never writable, whatever the instruction says. */
const BLOCKED_SEGMENTS = [
  'node_modules', '.git', 'dist', 'build', '.next', '.vercel', '.turbo',
  'coverage', '.cache', '.vite', 'supabase/.temp',
];

/**
 * Files that hold credentials or are generated. `.env` is the important one: the brief
 * is that the agent adds features, and a feature is never the reason to rewrite a
 * secret store. The lock files are here because a rewritten lockfile breaks installs
 * in a way that is very hard to see and very easy to cause.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,          // .env, .env.local, .env.production
  /(^|\/)\.env(\..*)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /yarn\.lock$/i,
  /bun\.lockb$/i,
];

/**
 * Where the agent may write. Deliberately a small allowlist of source roots rather than
 * a denylist of bad paths: a denylist fails open for anything nobody thought of, and
 * the cost of getting that wrong is writing to something that should not exist.
 */
const WRITABLE_ROOTS = [
  'src', 'supabase', 'scripts', 'public',
  // Root-level files the agent may edit. Named one by one rather than "any file in the
  // project root", because a root is also where .env and the lockfiles live.
  'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json', 'README.md', '.gitignore',
];

/** Extensions the agent may produce. Blocks binaries and lockfiles-by-another-name. */
const WRITABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json', '.sql', '.md', '.txt', '.yml', '.yaml', '.toml'];

export type Verdict = { ok: true } | { ok: false; reason: string };

const verdict = (ok: boolean, reason = ''): Verdict => (ok ? { ok: true } : { ok: false, reason });

/** Normalises to forward slashes and strips any leading "./" or "/". */
function normalise(path: string): string {
  return String(path || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/{2,}/g, '/').trim();
}

export function mayTouch(rawPath: string): Verdict {
  const path = normalise(rawPath);
  if (!path) return verdict(false, 'no path given');
  if (path.includes('..')) return verdict(false, 'a path may not step outside the project');
  if (path.startsWith('/')) return verdict(false, 'a path may not be absolute');

  const segments = path.split('/');
  const blocked = segments.find((s) => BLOCKED_SEGMENTS.includes(s));
  if (blocked) return verdict(false, `${blocked}/ is generated or managed by git`);
  if (BLOCKED_PATTERNS.some((re) => re.test(path))) {
    return verdict(false, 'that file holds credentials or a lockfile and is never written by the agent');
  }
  // An extensionless file is only ever one of the named roots; anything else is a
  // binary or something with no business here.
  const root = segments[0];
  const hasExt = /\.[a-z0-9]+$/i.test(segments[segments.length - 1]);
  if (!WRITABLE_ROOTS.includes(root)) {
    return verdict(false, `${root}/ is not a directory the agent writes to`);
  }
  if (root !== 'index.html' && hasExt && !WRITABLE_EXTENSIONS.some((e) => path.toLowerCase().endsWith(e))) {
    return verdict(false, 'that file type is not something the agent writes');
  }
  return verdict(true);
}

/**
 * Credential shapes, in the order they are worth reporting. These are the patterns
 * scan-secrets.mjs already enforces on the committed tree, kept in step deliberately:
 * the scanner is what stops a secret reaching the repository, and this is what stops
 * the agent handing one to the writer in the first place.
 */
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['Supabase service_role JWT', /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{20,}/],
  ['Supabase personal access token', /sbp_[A-Za-z0-9]{20,}/],
  ['OpenRouter key', /sk-or-v1-[A-Za-z0-9]{20,}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Postgres connection string', /postgres(ql)?:\/\/[^\s:@/]+:[^\s:@/]+@/],
  ['a long assignment that looks like a password', /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
];

export function looksSecret(text: string): Verdict {
  if (typeof text !== 'string' || !text) return verdict(true);
  for (const [label, re] of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) {
      // Report the label, never the value. The agent's own output goes into a log and
      // into the UI, and a credential echoed there is a credential leaked.
      return verdict(false, `the content contains what looks like ${label}`);
    }
  }
  return verdict(true);
}

export type Operation = {
  /** 'write' creates the file if absent and replaces it if present. */
  op: 'create' | 'update' | 'delete';
  path: string;
  /** Required for create and update. Ignored for delete. */
  content?: string;
  /** The caller's own words for what this operation is for, shown in the review. */
  note?: string;
};

export type Review = {
  ok: boolean;
  /** Per-operation problems, keyed by index, so the UI can mark the offending row. */
  problems: Record<number, string>;
  /** Operations that are safe to apply, in the order given. */
  safe: Operation[];
  /** Paths this would destroy. Never applied without destroyConfirmed. */
  destroys: string[];
  summary: string;
};

/**
 * The gate every apply passes through. Nothing is written on the strength of the model's
 * own say-so: the path has to be writable, the content has to be free of credentials,
 * a delete has to be named as a delete, and a write may not be larger than the body
 * limit allows.
 */
export function review(ops: unknown, opts: { confirm?: boolean; destroyConfirmed?: boolean; maxBytes?: number } = {}): Review {
  const problems: Record<number, string> = {};
  const safe: Operation[] = [];
  const destroys: string[] = [];
  const maxBytes = opts.maxBytes ?? 262144;
  const list = Array.isArray(ops) ? ops : [];

  list.forEach((raw, i) => {
    const o = raw as Partial<Operation>;
    const op = o?.op;
    const path = normalise(o?.path || '');
    if (op !== 'create' && op !== 'update' && op !== 'delete') {
      problems[i] = 'unknown operation';
      return;
    }
    const touch = mayTouch(path);
    if (!touch.ok) { problems[i] = touch.reason; return; }

    if (op === 'delete') {
      destroys.push(path);
      // A delete carries no content to scan, so it is gated purely on being declared.
      safe.push({ op: 'delete', path, note: o?.note });
      return;
    }
    const content = typeof o?.content === 'string' ? o.content : '';
    if (!content.trim()) { problems[i] = 'no content'; return; }
    if (Buffer.byteLength(content, 'utf8') > maxBytes) {
      problems[i] = `too large to write in one request (limit ${Math.round(maxBytes / 1024)}KB)`;
      return;
    }
    const secret = looksSecret(content);
    if (!secret.ok) { problems[i] = secret.reason; return; }
    safe.push({ op: op as 'create' | 'update', path, content, note: o?.note });
  });

  const creates = safe.filter((o) => o.op === 'create').length;
  const updates = safe.filter((o) => o.op === 'update').length;
  const summary = `${creates} new, ${updates} changed, ${destroys.length} removed`;

  // The whole set is refused if confirmation is missing, and the deletes are refused
  // separately from the writes, so approving "add a feature" can never quietly take a
  // file with it.
  let ok = safe.length > 0;
  if (ok && !opts.confirm) ok = false;
  if (ok && destroys.length && !opts.destroyConfirmed) ok = false;

  return { ok, problems, safe, destroys, summary };
}

/** The refusal list, so the UI can show the user exactly what the agent will not touch. */
export function boundaries() {
  return {
    writableRoots: WRITABLE_ROOTS,
    blockedSegments: BLOCKED_SEGMENTS,
    neverWritten: ['.env and any .env.*', 'private keys and certificates', 'npm token files', 'lockfiles'],
    secretsRefused: SECRET_PATTERNS.map(([label]) => label),
  };
}
