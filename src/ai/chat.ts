import {route, CHAT_FEATURE_SIZE, type ChatContext} from './chat-router.ts';
import {CHAT_WEIGHTS} from './chat-weights.ts';

/**
 * The chat's answers.
 *
 * This is the layer the network is allowed to choose from, and it is the whole reason the
 * chat cannot say something false about the project: every reply here is either a fixed
 * sentence in the reader's own language, or one assembled from a number or a path that was
 * read out of the real code. There is no template with a hole in it that gets filled with
 * something plausible.
 *
 * The honest description of what this is: a trained router over a hand-written library of
 * answers. It is not a language model, it cannot write prose, and it is not asked to. What
 * it does well is decide which of these sentences you meant, and answer questions about
 * the project from facts it actually read rather than facts it remembers.
 *
 * Where it has no answer it says so. That is the behaviour worth having, and it is why
 * 'unknown' is a trained class rather than a fallback string: a message that matches
 * nothing should be told that, not answered confidently from the nearest template.
 */

// Same guard as src/ai/hint.ts: a weights file trained against a different feature layout
// would route everything to one class with total confidence, and it would do it at import
// time rather than in a test.
if (CHAT_WEIGHTS.inputSize !== CHAT_FEATURE_SIZE) {
  throw new Error(
    `ai/chat: weights expect ${CHAT_WEIGHTS.inputSize} features but chat-router.ts produces ${CHAT_FEATURE_SIZE}. ` +
    'Run: npm run train:chat',
  );
}

/**
 * Facts the replies are allowed to state, all of them read from the running code.
 *
 * Passed in rather than imported so that this file has no opinion about where the numbers
 * came from, which is what makes the reply library testable without a browser.
 */
export type ChatFacts = {
  /** Parameters in the hint network, from MODEL. */
  parameters: number;
  /** How many edit recipes the planner can choose from. */
  recipes: number;
  /** The files the planner watches, which is the honest answer to "what does it know about". */
  watched: string[];
};

/** A reply, as a translation key plus whatever that sentence needs to fill in. */
export type Reply = { key: string; vars?: Record<string, string | number> };

/**
 * Below this the network is guessing, and a guess is reported as one.
 *
 * The chat would rather say "I did not follow that" than answer a question nobody asked.
 * Note this is a floor on the winning class, not on the runner-up: a real intent at 0.45
 * with 'unknown' holding the rest is a different situation from 0.45 all on its own, and
 * that difference is why both numbers come back from route().
 */
const CONFIDENT = 0.55;

/** Matches a project path named in the message, e.g. "src/Agent.tsx" or "i18n.ts". */
function namedFile(text: string, candidates: string[]): string | null {
  const lower = text.toLowerCase();
  let hit: string | null = null;
  for (const path of candidates) {
    // The basename is what people actually type. "what does Agent.tsx do" should find
    // src/Agent.tsx without the reader having to know the directory it lives in.
    const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    if (lower.includes(base) || lower.includes(path.toLowerCase())) {
      // Prefer the most specific match, so "i18n.ts" does not win over "src/i18n.ts"
      // just because it was checked first.
      if (!hit || path.length > hit.length) hit = path;
    }
  }
  return hit;
}

/**
 * A question about the project, answered from what is actually in hand.
 *
 * The four branches are the point of this function. A chat that could not read the files
 * would have to answer from memory, and a plausible answer from memory is worse than no
 * answer; being able to say "I have not read that file" is what makes the other three
 * branches worth anything.
 *
 * "In hand" is narrower than it sounds, and the narrowing is deliberate. The chat compiles
 * in the list of paths the planner watches and reads nothing: it is told the names, not
 * the contents. So the four answers are about names, and none of them claims otherwise.
 */
function aboutCode(text: string, ctx: ChatContext, facts: ChatFacts): Reply {
  const asked = namedFile(text, [...ctx.files, ...facts.watched]);
  if (asked) {
    return ctx.files.includes(asked)
      ? {key: 'chatCodeFile', vars: {path: asked, watched: ctx.files.length}}
      : {key: 'chatCodeUnread', vars: {path: asked}};
  }
  if (!ctx.files.length) return {key: 'chatCodeNoFiles'};
  return {
    key: 'chatCodeHere',
    vars: {files: ctx.files.length, watched: facts.watched.length, parameters: facts.parameters, recipes: facts.recipes},
  };
}

/**
 * A request to change something, which is the agent's job and not the chat's.
 *
 * Routed rather than answered, and the reply says so plainly instead of pretending to
 * have done something. The switch is named in the sentence because the reader is looking
 * at the toggle that does it.
 */
function aboutEdit(ctx: ChatContext): Reply {
  return ctx.canWrite ? {key: 'chatEditSwitch'} : {key: 'chatEditNoRoute'};
}

/** Picks the answer. The only place an intent becomes a sentence. */
export function reply(text: string, ctx: ChatContext, facts: ChatFacts): Reply & {intent: string; confidence: number} {
  const r = route(text, ctx);
  let out: Reply;
  if (r.confidence < CONFIDENT) out = {key: 'chatUnsure'};
  else if (r.intent === 'code') out = aboutCode(text, ctx, facts);
  else if (r.intent === 'edit') out = aboutEdit(ctx);
  else if (r.intent === 'greeting') out = {key: 'chatGreeting'};
  else if (r.intent === 'capabilities') out = {key: 'chatCapabilities'};
  else if (r.intent === 'privacy') out = {key: 'chatPrivacy'};
  else if (r.intent === 'thanks') out = {key: 'chatThanks'};
  else if (r.intent === 'smalltalk') out = {key: 'chatSmalltalk'};
  else out = {key: 'chatUnknown'};
  return {...out, intent: r.intent, confidence: r.confidence};
}

export const CHAT_MODEL = {
  name: 'Exotic Chat Router',
  parameters: CHAT_WEIGHTS.layers.reduce((n, l) => n + l.w.length + l.b.length, 0),
  layers: CHAT_WEIGHTS.layers.map((l) => `${l.in}→${l.out}`).join(', '),
  features: CHAT_FEATURE_SIZE,
} as const;

export type {ChatContext};
