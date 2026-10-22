import { ARCHETYPES } from '../../data/archetypes';
import { Story } from '../../types';
import { isStory } from '../stories/catalog';
import { rankTopicsByMention } from './topics';
import { WikiPage } from './wikipedia';

const MAX_SOURCE_CHARS = 60000;
const MAX_RELATED = 40;
const MIN_FACTS = 3;

export type GenerationResult =
  | { ok: true; story: Story }
  | { ok: false; declined: true; reason: string }
  | { ok: false; declined?: undefined; reason: string };

const archetypeGuide = () =>
  Object.values(ARCHETYPES)
    .map((a) => `- ${a.id}: ${a.name}. Entry style: ${a.entryStyle}. Framing: ${a.framingPreference}.`)
    .join('\n');

export function buildGenerationPrompt(page: WikiPage): { system: string; user: string } {
  const system = [
    'You write one short, sourced story for a curious reader from a single encyclopedia article.',
    'Use only the supplied source text. Never use outside knowledge, and never state anything the source does not say.',
    'The story centers on ONE person and ONE pivotal decision they made. If the article has no such person and decision, answer with {"suitable": false, "reason": "<one sentence>"} and nothing else.',
    'Every fact and the counter-argument must carry an "evidenceQuote": a contiguous passage copied verbatim, character for character, from the source text. Do not paraphrase inside a quote. Quotes are checked by machine against the source; a quote that is not found rejects the whole story.',
    'Each claim must be fully supported by its OWN quote alone, and a strict checker reads them together. Every date, year, number, name, place and cause or effect stated in the claim must appear in that quote or follow directly from it. Never combine details from different parts of the article into one claim. Do not generalise: avoid words like "always", "strictly", "completely", "nearly" and "longstanding" unless the quote says so. If a detail you want is in a neighbouring sentence, extend the quote to include it (a passage of one to three sentences is fine), or leave the detail out. A modest claim that closely restates its quote is better than an ambitious one that will be rejected.',
    'The counter-argument must be a genuine opposing view or dispute that the source itself reports, and it follows the same rule: its "thesis" and "evidence" may state only what its quote supports. "whatWeCantProve" must name a real uncertainty or contested point the source reveals.',
    'The decisionContext (setup) may state only what the facts already say; add no new date, number, name or event to it.',
    'Presentation variants only change tone, order, hook, pacing and analogy for each reader type. An analogy may compare the story to something unrelated and familiar, but any concrete statement about the story\'s own subject (who, what, when, where, how many, why) must already appear in the facts. Do not add any new date, number, name or event.',
    'Respond with a single JSON object and nothing else, with exactly these keys:',
    '{"suitable": true, "title": string, "protagonist": string, "topic": string (2-4 word subject label), "era": string (e.g. "16th century"), "decisionContext": string (2-3 sentences of setup, using only what the facts say), "facts": [{"claim": string, "evidenceQuote": string}] (3 to 6 items), "counterArgument": {"thesis": string, "evidence": string, "unresolvedPoints": string, "evidenceQuote": string}, "whatWeCantProve": string, "presentationVariants": {"<archetype id>": {"hook": string, "narrativePacing": string, "introFraming": string, "analogy": string}}} with one variant for each archetype id listed in the user message.',
  ].join('\n');

  const body = page.text.length > MAX_SOURCE_CHARS ? `${page.text.slice(0, MAX_SOURCE_CHARS)}\n[source truncated]` : page.text;
  const user = [
    `SOURCE ARTICLE: ${page.title} (Wikipedia revision ${page.revisionId})`,
    '',
    'ARCHETYPES (write one presentation variant for each id):',
    archetypeGuide(),
    '',
    'SOURCE TEXT:',
    body,
  ].join('\n');

  return { system, user };
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Turns the model's answer into an UNVERIFIED story. Nothing here makes a claim true; verify.ts does that.
export function parseGeneratedStory(raw: string, page: WikiPage, today: string): GenerationResult {
  let draft: any;
  try {
    draft = extractJson(raw);
  } catch {
    return { ok: false, reason: 'the model output was not valid JSON' };
  }

  if (draft?.suitable === false) {
    return { ok: false, declined: true, reason: str(draft.reason) || 'the model declined this page' };
  }

  const facts = Array.isArray(draft?.facts) ? draft.facts : [];
  if (facts.length < MIN_FACTS) return { ok: false, reason: `needs at least ${MIN_FACTS} facts, got ${facts.length}` };
  if (!facts.every((f: any) => str(f?.claim) && str(f?.evidenceQuote))) {
    return { ok: false, reason: 'every fact needs a claim and a verbatim evidence quote' };
  }
  const counter = draft?.counterArgument;
  if (!str(counter?.evidenceQuote)) return { ok: false, reason: 'the counter-argument needs a verbatim evidence quote' };

  const permalink = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(page.title.replace(/ /g, '_'))}&oldid=${page.revisionId}`;

  const variants: Record<string, unknown> = {};
  for (const id of Object.keys(ARCHETYPES)) {
    const v = draft?.presentationVariants?.[id];
    if (v) variants[id] = { hook: str(v.hook), narrativePacing: str(v.narrativePacing), introFraming: str(v.introFraming), analogy: str(v.analogy) };
  }

  const story = {
    id: `story-${slug(page.title)}`,
    date: today,
    title: str(draft.title),
    protagonist: str(draft.protagonist),
    topic: str(draft.topic),
    era: str(draft.era),
    source: { title: page.title, url: page.url, revisionId: page.revisionId },
    relatedTopics: rankTopicsByMention(page.links, page.text).slice(0, MAX_RELATED),
    decisionContext: str(draft.decisionContext),
    facts: facts.map((f: any) => ({
      claim: str(f.claim),
      sourceTitle: `${page.title} (Wikipedia, revision ${page.revisionId})`,
      sourceUrl: permalink,
      isVerified: false,
      evidenceQuote: str(f.evidenceQuote),
    })),
    counterArgument: {
      thesis: str(counter.thesis),
      evidence: str(counter.evidence),
      unresolvedPoints: str(counter.unresolvedPoints),
      evidenceQuote: str(counter.evidenceQuote),
    },
    whatWeCantProve: str(draft.whatWeCantProve),
    presentationVariants: variants,
  };

  if (!isStory(story)) return { ok: false, reason: 'the story is missing required fields or an archetype variant' };
  return { ok: true, story };
}
