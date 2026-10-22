import { ARCHETYPES } from '../../data/archetypes';
import { Story } from '../../types';
import { LlmClient } from './llm-client';
import { WikiPage } from './wikipedia';

// A quote shorter than this could match almost any article and proves nothing.
const MIN_QUOTE_CHARS = 25;

// Case, whitespace, curly quotes and dash styles differ between a model's copy and the page; nothing else may.
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Deterministic gate: every quote must literally appear in the fetched article.
export function checkQuotes(story: Story, sourceText: string): string[] {
  const haystack = normalizeForMatch(sourceText);
  const failures: string[] = [];

  const check = (label: string, quote: string | undefined) => {
    const q = normalizeForMatch(quote ?? '');
    if (q.length < MIN_QUOTE_CHARS) failures.push(`${label}: quote too short to prove anything`);
    else if (!haystack.includes(q)) failures.push(`${label}: quote not found in the source`);
  };

  story.facts.forEach((fact, i) => check(`fact ${i + 1}`, fact.evidenceQuote));
  check('counter-argument', story.counterArgument.evidenceQuote);
  return failures;
}

const JUDGE_SYSTEM = [
  'You are a strict fact-checking judge. You verify that each claim is fully supported by the quote given for it.',
  'A claim is supported only if the quote states it or it follows directly from the quote alone. Extra detail, a different number, date or name, or a stronger or weaker statement than the quote makes means NOT supported.',
  'Also check the setup text (decisionContext) and the presentation variants: they must add no factual claim about the story\'s subject (a person, event, date, number, place, cause or effect) that is not in the claims.',
  'Analogies and comparisons to something unrelated and familiar are not facts about the subject, so do not flag them. Flag only concrete statements about the subject itself.',
  'Respond with a single JSON object and nothing else: {"claims": [{"index": number, "supported": boolean, "reason": string}], "variantsAddNewFacts": boolean}. Set variantsAddNewFacts to true if the setup text or any variant adds such a fact. Include every claim index exactly once.',
].join('\n');

function claimsOf(story: Story): { text: string; quote: string }[] {
  return [
    ...story.facts.map((f) => ({ text: f.claim, quote: f.evidenceQuote ?? '' })),
    {
      text: `${story.counterArgument.thesis} ${story.counterArgument.evidence}`.trim(),
      quote: story.counterArgument.evidenceQuote ?? '',
    },
  ];
}

function judgeUserPrompt(story: Story): string {
  const claims = claimsOf(story)
    .map((c, i) => `${i}. CLAIM: ${c.text}\n   QUOTE: ${c.quote}`)
    .join('\n');
  const variants = Object.keys(ARCHETYPES)
    .map((id) => {
      const v = story.presentationVariants[id as keyof Story['presentationVariants']];
      return `${id}: ${v.hook} | ${v.introFraming} | ${v.narrativePacing} | ${v.analogy}`;
    })
    .join('\n');
  return [
    `CLAIMS TO CHECK:`,
    claims,
    '',
    'SETUP TEXT (decisionContext; must add no facts beyond the claims):',
    story.decisionContext,
    '',
    'PRESENTATION VARIANTS (must add no new facts):',
    variants,
  ].join('\n');
}

function parseJudge(raw: string, expected: number): { supported: boolean[]; reasons: string[]; variantsAddNewFacts: boolean } | null {
  try {
    const cleaned = raw.replace(/```(?:json)?/gi, '');
    const json = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
    if (!Array.isArray(json.claims) || typeof json.variantsAddNewFacts !== 'boolean') return null;

    const supported: (boolean | undefined)[] = new Array(expected).fill(undefined);
    const reasons: string[] = new Array(expected).fill('');
    for (const c of json.claims) {
      if (!Number.isInteger(c?.index) || c.index < 0 || c.index >= expected || typeof c.supported !== 'boolean') return null;
      if (supported[c.index] !== undefined) return null;
      supported[c.index] = c.supported;
      reasons[c.index] = typeof c.reason === 'string' ? c.reason : '';
    }
    if (supported.some((s) => s === undefined)) return null;
    return { supported: supported as boolean[], reasons, variantsAddNewFacts: json.variantsAddNewFacts };
  } catch {
    return null;
  }
}

export interface Verification {
  ok: boolean;
  failures: string[];
}

// The gate nothing is published without. It fails closed: any doubt, error or unusable answer rejects the story.
export async function verifyStory(story: Story, page: WikiPage, llm: LlmClient): Promise<Verification> {
  const quoteFailures = checkQuotes(story, page.text);
  if (quoteFailures.length > 0) return { ok: false, failures: quoteFailures };

  const claims = claimsOf(story);
  let raw: string;
  try {
    raw = await llm.complete(JUDGE_SYSTEM, judgeUserPrompt(story));
  } catch (err) {
    return { ok: false, failures: [`the verification judge could not be reached: ${(err as Error).message}`] };
  }

  const verdict = parseJudge(raw, claims.length);
  if (!verdict) return { ok: false, failures: ['the verification judge returned an unusable verdict'] };

  const failures: string[] = [];
  verdict.supported.forEach((ok, i) => {
    if (!ok) {
      const label = i < story.facts.length ? claims[i].text : 'counter-argument';
      failures.push(`claim ${i + 1} (${label.slice(0, 60)}) is not supported by its quote${verdict.reasons[i] ? `: ${verdict.reasons[i]}` : ''}`);
    }
  });
  if (verdict.variantsAddNewFacts) failures.push('the setup text or the presentation variants introduce facts that are not in the claims');

  return { ok: failures.length === 0, failures };
}
