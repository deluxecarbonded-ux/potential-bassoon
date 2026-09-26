// Tests the diff the build agent shows before anything is written.
//
//   npm run test:diff
//
// This is the surface a person approves a change on. If it lies - shows a file as
// unchanged when it is not, hides the middle of a large edit, or reports line counts
// that do not match what will be written - then the review is worse than no review,
// because it looks like a review.
import { diffLines, summarise } from '../src/diff.ts';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};
// s = same, a = added, d = removed, so an expected sequence reads like the change it
// describes.
const kinds = (d) => d.map((l) => ({ same: 's', add: 'a', del: 'd' })[l.kind]).join('');

console.log('IDENTICAL FILES');
let d = diffLines('a\nb\nc', 'a\nb\nc');
ok('every line is unchanged', kinds(d) === 'sss', kinds(d));
ok('and nothing is added or removed', d.every((l) => l.kind === 'same'));

console.log('\nA SINGLE CHANGED LINE');
d = diffLines('a\nb\nc', 'a\nB\nc');
ok('one removal and one addition', kinds(d) === 'sdas', kinds(d));
ok('the old text is shown', d[1].text === 'b' && d[1].kind === 'del');
ok('the new text is shown', d[2].text === 'B' && d[2].kind === 'add');
let s = summarise('a\nb\nc', 'a\nB\nc');
ok('the counts match the diff', s.stats.added === 1 && s.stats.removed === 1, JSON.stringify(s.stats));
ok('it is one hunk', s.stats.hunks === 1, String(s.stats.hunks));

console.log('\nCREATING A FILE');
d = diffLines('', 'one\ntwo');
ok('everything is an addition', kinds(d) === 'aa', kinds(d));
s = summarise('', 'one\ntwo');
ok('two added, none removed', s.stats.added === 2 && s.stats.removed === 0, JSON.stringify(s.stats));

console.log('\nDELETING A FILE');
d = diffLines('one\ntwo', '');
ok('everything is a removal', kinds(d) === 'dd', kinds(d));
s = summarise('one\ntwo', '');
ok('none added, two removed', s.stats.added === 0 && s.stats.removed === 2, JSON.stringify(s.stats));

console.log('\nAPPENDING IS AN APPEND, NOT A REWRITE');
// The case a naive diff gets most wrong, and the one that makes a review unreadable.
const big = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
d = diffLines(big, big + '\nadded at the end');
ok('only the new line is marked', kinds(d) === 's'.repeat(200) + 'a', `${d.filter((l) => l.kind !== 'same').length} changed line(s)`);
s = summarise(big, big + '\nadded at the end', 3);
ok('the summary counts one addition', s.stats.added === 1 && s.stats.removed === 0, JSON.stringify(s.stats));
ok('and collapses the rest', s.lines.length < 20, `${s.lines.length} lines shown for 201`);

console.log('\nA CHANGE IN THE MIDDLE OF A LARGE FILE IS SURVIVABLE');
const mid = [...Array.from({ length: 100 }, (_, i) => `a${i}`), 'TARGET', ...Array.from({ length: 100 }, (_, i) => `b${i}`)].join('\n');
const midAfter = mid.replace('TARGET', 'CHANGED');
s = summarise(mid, midAfter, 3);
ok('the counts are right', s.stats.added === 1 && s.stats.removed === 1, JSON.stringify(s.stats));
ok('the change is visible in the shown lines', s.lines.some((l) => l.kind === 'add' && l.text === 'CHANGED'), 'CHANGED not shown');
ok('and a gap marker stands in for the rest', s.lines.some((l) => /unchanged lines/.test(l.text)), s.lines.map((l) => l.text).join('|').slice(0, 90));

console.log('\nSEVERAL SEPARATE EDITS');
const two = ['x\ny', 'p\nq', 'r\ns'].join('\n');
const twoAfter = ['x\nY', 'p\nq', 'r\nS'].join('\n');
s = summarise(two, twoAfter, 1);
ok('two hunks are counted', s.stats.hunks === 2, JSON.stringify(s.stats));
ok('two additions and two removals', s.stats.added === 2 && s.stats.removed === 2, JSON.stringify(s.stats));
ok('both changes are shown', ['Y', 'S'].every((t) => s.lines.some((l) => l.text === t)));

console.log('\nLINE NUMBERS');
d = diffLines('a\nb', 'a\nb');
ok('unchanged lines carry both numbers', d[0].a === 1 && d[0].b === 1);
d = diffLines('a\nb', 'a\nc');
const added = d.find((l) => l.kind === 'add');
ok('an added line knows where it lands in the new file', added.b === 2 && added.a === undefined);
const removed = d.find((l) => l.kind === 'del');
ok('a removed line knows where it was in the old file', removed.a === 2 && removed.b === undefined);

console.log('\nODD INPUTS');
ok('two empty files produce nothing', diffLines('', '').length === 0);
ok('an empty line count is handled', summarise('', '').lines.length === 0);
ok('windows line endings do not become changes', diffLines('a\r\nb', 'a\nb').every((l) => l.kind === 'same'));
ok('a trailing newline difference is one change',
  diffLines('a\n', 'a').filter((l) => l.kind !== 'same').length <= 1);
ok('unicode survives intact', diffLines('日本語\nEnglish', '日本語\n中文').find((l) => l.kind === 'add')?.text === '中文');
ok('a very long line is diffed like any other', diffLines('x'.repeat(5000), 'y'.repeat(5000)).length === 2);

console.log('\nTHE COUNTS AGREE WITH THE LINES SHOWN');
// The number a person reads at the top of the card must be the number of changed lines
// in the body, or the card is lying by omission.
for (const [a, b] of [
  ['one\ntwo\nthree', 'one\ntwo\nthree'],
  ['one\ntwo', 'one\nTWO'],
  ['', 'a\nb\nc'],
  ['a\nb\nc', ''],
  ['a\nb\nc\nd\ne', 'A\nb\nc\nd\nE'],
  ['same\nmiddle\nsame', 'same\nCHANGED\nsame'],
]) {
  const r = summarise(a, b, 2);
  const shownAdds = r.lines.filter((l) => l.kind === 'add').length;
  const shownDels = r.lines.filter((l) => l.kind === 'del').length;
  ok(`counts match for ${JSON.stringify(a).slice(0, 24)}`, shownAdds === r.stats.added && shownDels === r.stats.removed,
    `counted +${r.stats.added}/-${r.stats.removed}, showed +${shownAdds}/-${shownDels}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
