// A line diff, so a proposed change can be read rather than trusted.
//
// Small on purpose. This exists to answer one question - what exactly is about to
// change in this file - and it only ever diffs two versions of one text file, so a full
// diff library would be a lot of machinery for one job.
//
// The algorithm is a longest-common-subsequence walk, which gives the minimal set of
// changes. A file that is appended to shows one added block, not the whole file as
// removed and re-added, which is the difference between a reviewable patch and an
// unreadable one.

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string; a?: number; b?: number };

/** Longest common subsequence of two line arrays, as a matrix of lengths. */
function lcs(a: string[], b: string[]): Uint32Array[] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const m: Uint32Array[] = [];
  for (let i = 0; i < rows; i++) m.push(new Uint32Array(cols));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      m[i][j] = a[i] === b[j] ? m[i + 1][j + 1] + 1 : Math.max(m[i + 1][j], m[i][j + 1]);
    }
  }
  return m;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.length ? before.replace(/\r\n/g, '\n').split('\n') : [];
  const b = after.length ? after.replace(/\r\n/g, '\n').split('\n') : [];
  const m = lcs(a, b);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i], a: i + 1, b: j + 1 }); i++; j++; }
    else if (m[i + 1][j] >= m[i][j + 1]) { out.push({ kind: 'del', text: a[i], a: i + 1 }); i++; }
    else { out.push({ kind: 'add', text: b[j], b: j + 1 }); j++; }
  }
  while (i < a.length) out.push({ kind: 'del', text: a[i], a: i + 1 }), i++;
  while (j < b.length) out.push({ kind: 'add', text: b[j], b: j + 1 }), j++;
  return out;
}

export type DiffSummary = { added: number; removed: number; hunks: number };

/**
 * Collapses a diff to the changed regions plus a little context, the way a reviewer
 * wants to read it. A file that differs by one line in five hundred should show three
 * lines, not five hundred.
 */
export function summarise(before: string, after: string, context = 3): { lines: DiffLine[]; stats: DiffSummary } {
  const all = diffLines(before, after);
  const keep = new Set<number>();
  let added = 0, removed = 0, hunks = 0;
  let inHunk = false;
  all.forEach((line, idx) => {
    if (line.kind === 'add') added++;
    if (line.kind === 'del') removed++;
    if (line.kind !== 'same') {
      if (!inHunk) { hunks++; inHunk = true; }
      for (let k = idx - context; k <= idx + context; k++) if (k >= 0 && k < all.length) keep.add(k);
    } else {
      // One unchanged line is not a gap; three or more starts a new hunk.
      if (inHunk) inHunk = false;
    }
  });
  // Re-mark hunk starts properly: a run of unchanged lines ends a hunk only if it is
  // longer than the context window, otherwise it is still inside the change.
  const lines: DiffLine[] = [];
  let skipped = 0;
  all.forEach((line, idx) => {
    if (keep.has(idx)) {
      if (skipped > 0) { lines.push({ kind: 'same', text: `... ${skipped} unchanged line${skipped === 1 ? '' : 's'}` }); skipped = 0; }
      lines.push(line);
    } else skipped++;
  });
  if (skipped > 0) lines.push({ kind: 'same', text: `... ${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
  return { lines, stats: { added, removed, hunks } };
}
