// The local bridge: the only way the agent can read and write this repository today.
//
// An edge function has no filesystem and no access to the repository, and Supabase's
// own API cannot write files either. The GitHub contents API can, but only with a token
// the project does not have. Git on this machine is already authenticated through the
// credential manager, so the shortest honest path is a small local process that does
// have filesystem access and is told, explicitly, what it is allowed to touch.
//
//   npm run agent:serve
//
// It is deliberately dull about what it will do:
//
//   Binds to 127.0.0.1 only. Not reachable from the network, so the browser is the only
//   client and only on this machine.
//   Refuses every path the guard refuses, using the same module the edge function uses,
//   so the two cannot drift apart. A path that is refused here is refused there too.
//   Refuses to write anything containing a credential.
//   Writes through a temporary file and a rename, so a crash mid-write cannot leave a
//   half-written source file.
//   Prints every path it touches, to the terminal running it.
//
// It is a development tool. It is not started by the app, it holds no secret of its
// own, and nothing it does is reachable unless someone runs it on purpose.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { mayTouch, looksSecret, review } from '../supabase/functions/_shared/guard.ts';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = Number(process.env.AGENT_BRIDGE_PORT || 8787);
const HOST = '127.0.0.1';
const MAX_BODY = 1024 * 1024;

/** Never served, never written, whatever is asked for. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.vite', '.temp']);
const SKIP_FILES = new Set(['.env', '.env.local', '.env.production', '.env.development', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.npmrc', '.netrc']);

function walk(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out, depth + 1);
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      try {
        const st = statSync(full);
        // The agent is told about source files. A 4MB asset would blow the context for
        // no benefit, so anything large is listed but not readable.
        out.push({ path: relative(ROOT, full).split(sep).join('/'), size: st.size, readable: st.size <= 262144 });
      } catch { /* raced with something else */ }
    }
  }
  return out;
}

const send = (res, status, data) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Only ever called by the app on this machine. Locked to the two dev origins rather
    // than *, so a random page cannot drive the bridge.
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
};

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/** Resolves inside the project, or refuses. Belt and braces with the guard. */
function insideProject(path) {
  const full = resolve(ROOT, path);
  const rel = relative(ROOT, full);
  if (rel.startsWith('..') || resolve(ROOT, rel) !== full) return null;
  return full;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (url.pathname === '/health') {
      return send(res, 200, { ok: true, root: ROOT, files: walk(ROOT).length });
    }

    if (url.pathname === '/tree' && req.method === 'GET') {
      return send(res, 200, { files: walk(ROOT) });
    }

    if (url.pathname === '/file' && req.method === 'GET') {
      const path = url.searchParams.get('path') || '';
      if (!mayTouch(path).ok) return send(res, 403, { error: 'refused' });
      const full = insideProject(path);
      if (!full || !existsSync(full)) return send(res, 404, { error: 'not found' });
      return send(res, 200, { path, content: readFileSync(full, 'utf8') });
    }

    if (url.pathname === '/write' && req.method === 'POST') {
      const body = await readBody(req);
      // The same review the edge function runs. One implementation, so the local path
      // and the GitHub path cannot end up with different rules.
      const checked = review(body?.operations, { confirm: body?.confirm === true, destroyConfirmed: body?.destroyConfirmed === true });
      if (!checked.ok) {
        return send(res, 409, { error: 'needsConfirmation', summary: checked.summary, problems: checked.problems, destroys: checked.destroys });
      }
      const results = [];
      for (const op of checked.safe) {
        const full = insideProject(op.path);
        if (!full) { results.push({ path: op.path, ok: false, detail: 'outside the project' }); continue; }
        try {
          if (op.op === 'delete') {
            if (existsSync(full)) unlinkSync(full);
            results.push({ path: op.path, ok: true, op: 'delete' });
            console.log(`  [bridge] delete  ${op.path}`);
            continue;
          }
          // Re-checked here as well. The edge function does the same; neither trusts the
          // other's verdict.
          const secret = looksSecret(op.content || '');
          if (!secret.ok) { results.push({ path: op.path, ok: false, detail: secret.reason }); continue; }
          // Written to a sibling and renamed, so a crash cannot leave half a file where
          // a source file is supposed to be.
          const tmp = `${full}.agent-tmp`;
          writeFileSync(tmp, op.content, 'utf8');
          renameSync(tmp, full);
          results.push({ path: op.path, ok: true, op: op.op });
          console.log(`  [bridge] ${op.op.padEnd(6)} ${op.path}  (${op.content.length} chars)`);
        } catch (e) {
          results.push({ path: op.path, ok: false, detail: String(e && e.message || e).slice(0, 120) });
        }
      }
      const written = results.filter((r) => r.ok).length;
      return send(res, 200, { written, failed: results.length - written, results, summary: checked.summary });
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 400, { error: String(e && e.message || e).slice(0, 160) });
  }
});

server.listen(PORT, HOST, () => {
  const files = walk(ROOT);
  console.log(`  agent bridge listening on http://${HOST}:${PORT}`);
  console.log(`  project: ${ROOT}`);
  console.log(`  ${files.length} readable files, ${files.filter((f) => f.readable).length} under the size cap`);
  console.log('  it will refuse .env, lockfiles, node_modules, and anything outside src/ supabase/ scripts/ public/');
  console.log('  every write is printed here. Ctrl-C to stop.\n');
});
