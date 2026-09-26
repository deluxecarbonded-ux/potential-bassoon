// Cleaning up what a free model hands back before a player ever sees it.
//
// The router behind OPENROUTER_FREE_MODELS lands on whatever model happens to be free,
// which includes reasoning models that narrate their chain of thought into `content`,
// chatty assistants that open with "Sure! Here's a hint:", and markdown formatters that
// bold the label. The app renders a hint as plain text inside a <p>, so all of it is
// read literally by the player, asterisks and prompt text included. Live runs also
// produced hints that stated the code outright, which is the one thing the tutor is
// told never to do.
//
// This tidies rather than rejects, and that distinction is the whole point. An earlier
// version threw unusable output away, and because the router could not replace it
// often enough, players were left with no hint at all - strictly worse than a slightly
// untidy one. A scratchpad dump almost always contains the real hint somewhere inside
// it, so the text is mined for it instead of being discarded. Only output that is not
// an answer at all - a prompt echo, a reflected payload, a plan for answering - comes
// back empty, and the caller retries that.
//
// Deliberately pure and dependency-free so it can be unit-tested off-platform against
// real captured bad output, without spending the flaky free tier to do it.

/** Output that is not an answer at all: a prompt echo, or the request reflected back. */
const REFUSAL =
  /system prompt|my instructions|\bthe user (wants|needs|provides|asks)\b|```|^\s*[\[{]|"locale"\s*:|"lines"\s*:|^\s*\d+\.\s*\*?\*?(analyze|identify|understand)/i;

/**
 * "Hint:", "**Final answer:**", "Provide tip -" and friends. A label is commonly
 * preceded by a space rather than a sentence break, because in a scratchpad it arrives
 * mid-thought: "So maybe: ... But we must not give answer. Provide hint: ...".
 */
const LABEL = /(?:^|[\s.!])\**\s*(?:final\s+|short\s+|brief\s+)?(?:hint|answer|response|tip|clue|guidance)\s*\**\s*[:\-–]\s*/gi;

const OPENER =
  /^\s*(?:(?:sure|ok|okay|of course|certainly|absolutely|great|hello|hi|alright|right)\b[!,.]?\s*)+/i;

const ANNOUNCEMENT =
  /^\s*(?:here'?s|here is|let me give you|i(?:'d| would| will)? be happy to help(?: you)?|happy to help(?: you)?|i think|i believe|it seems)\s+(?:a\s+|the\s+|you\s+with\s+a\s+|you\s+with\s+the\s+|some\s+)?(?:brief\s+|short\s+|quick\s+|simple\s+|helpful\s+)*(?:hint|tip|guidance|advice|solution|thoughts?|answer|reminder)\b\s*[.!:,–-]?\s*/i;

const SELF_REFERENCE = /^\s*(?:as an ai[^.]*|i am an ai[^.]*|being an ai[^.]*|i'?m not able[^.]*)\.\s*/i;

/** Markdown the player would otherwise see as literal characters. */
const MARKDOWN: Array<[RegExp, string]> = [
  [/`{1,3}([^`]*)`{1,3}/g, '$1'],
  [/^\s{0,3}#{1,6}\s*/gm, ''],
  [/\*\*\*([^*]+)\*\*\*/g, '$1'],
  [/\*\*([^*]+)\*\*/g, '$1'],
  [/__([^_]+)__/g, '$1'],
  [/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/g, '$1$2'],
  [/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:!?)])/g, '$1$2'],
];

/**
 * The model announcing a conclusion. "So digits: 3,1,9,1" and "the answer is 3191"
 * are the answer, not a method, and a hint that gives the code defeats the puzzle.
 */
const VERDICT =
  /(?:^|[.!?]\s)(?:so|thus|therefore|hence|in conclusion)[, ]+(?:the\s+|our\s+)?(?:digits?|code|answer|solution|values?)\s*(?:is|are|would\s+be|:|=)[\s\S]*$/i;

/** A bare enumeration of three or more digits is a code, never a hint. */
const ENUMERATED_CODE = /[^.!?]*\b\d\s*,\s*\d\s*,\s*\d\b[^.!?]*[.!?]?/g;

/** Sentence ends, tolerant of closing quotes and brackets after the punctuation. */
const SENTENCE = /[^.!?。！？؟…]+[.!?。！？؟…]+(?=$|[\s"'”’」』)\]】])|[^.!?。！？؟……]+$/g;
const ENDS_A_SENTENCE = /[.!?。！？؟…]["'”’」』)\]】]?\s*$/;

/** Wrapping quotes and brackets, as [open, close]. */
const WRAPPERS: Array<[string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['“', '”'],
  ['「', '」'],
  ['『', '』'],
];

/** Drops a matching pair of wrapping quotes or brackets. */
function unwrap(t: string): string {
  for (let i = 0; i < 2; i++) {
    const trimmed = t.trim();
    const pair = WRAPPERS.find(([open]) => open === trimmed[0]);
    if (!pair || trimmed.length < 3 || trimmed[trimmed.length - 1] !== pair[1]) break;
    t = trimmed.slice(1, -1).trim();
  }
  return t;
}

/** Keeps the last complete sentence, which is where a usable hint ends up. */
function lastSentence(text: string): string {
  const parts = text.match(SENTENCE);
  if (!parts) return text;
  const whole = parts.filter((p) => ENDS_A_SENTENCE.test(p) && p.trim().length > 12);
  return (whole.length ? whole[whole.length - 1] : parts[parts.length - 1]).trim();
}

export function tidyHint(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let t = raw.trim();
  if (!t) return '';

  // Not an answer. Nothing here is salvageable, so say so and let the caller retry.
  if (REFUSAL.test(t)) return '';

  // A scratchpad states the hint last, after the deliberation. Take what follows the
  // final label rather than the whole transcript. No label means it answered directly.
  const labels = [...t.matchAll(LABEL)];
  if (labels.length) {
    const last = labels[labels.length - 1];
    const after = t.slice((last.index ?? 0) + last[0].length);
    if (after.trim().length > 12) t = after;
  }

  t = t.replace(SELF_REFERENCE, '').replace(OPENER, '').replace(ANNOUNCEMENT, '');
  for (const [re, to] of MARKDOWN) t = t.replace(re, to);

  // A verdict clause or a bare digit enumeration gives the code away. Removing it costs
  // nothing: a hint that states the answer is not a hint.
  t = t.replace(VERDICT, '').replace(ENUMERATED_CODE, '');

  // A block quote is the model quoting something, not tutoring.
  t = t.replace(/^\s*>\s?/gm, '');

  // Lists are a transcript, not tutoring. If bullets survived, keep the prose around
  // them; a hint is one or two sentences, so the first substantial prose run wins.
  t = t.replace(/^\s*(?:[-*•‣▪]|\d{1,2}[.)])\s+/gm, '');
  const blocks = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (blocks.length > 1) {
    const prose = blocks.filter((b) => !/^[-*•‣▪]|\d{1,2}[.)]/.test(b) && b.split(/\s+/).length > 4);
    t = (prose.length ? prose : blocks).join(' ');
  }

  // Newlines vanish inside a <p>, so a two-line hint would read as one run-on line.
  t = unwrap(t.replace(/\s+/g, ' ').trim().replace(/^[-–—•*\s]+/, '').replace(/[\s*_`]+$/, ''));

  // Cut off at the token budget, or rambling on past a usable sentence. A fragment with
  // no terminal punctuation at all is still returned: a sentence that stops early is
  // more use to a player than no hint, and the caller judges whether it is long enough.
  t = lastSentence(t);

  // Anything still enormous is a transcript that slipped past the filters. Its first
  // real sentence is more use than four hundred words of noise.
  if (t.length > 320) t = lastSentence(t.slice(0, 320));
  return unwrap(t).trim();
}
