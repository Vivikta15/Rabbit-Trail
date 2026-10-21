import { Archetype, Story } from '../../types';

export const REWRITE_SYSTEM_PROMPT = [
  'You adapt the presentation of a verified story for a reader with a specific curiosity style.',
  'You may change only the headline hook, narrative framing, pacing and explanatory analogies.',
  'Do not add, alter, or remove any factual claim, date, number, name, or citation.',
  'Do not introduce facts that are not in the supplied fact list.',
].join(' ');

export function buildRewritePrompt(story: Story, archetype: Archetype): { system: string; user: string } {
  const facts = story.facts
    .map((f, i) => `${i + 1}. ${f.claim}\n   Source: ${f.sourceTitle} (${f.sourceUrl})`)
    .join('\n');

  const user = [
    `Story: ${story.title}`,
    `Protagonist: ${story.protagonist}`,
    `Decision context: ${story.decisionContext}`,
    '',
    'LOCKED FACTS (reproduce verbatim, keep every citation):',
    facts,
    '',
    `Reader archetype: ${archetype.name}`,
    `Entry style: ${archetype.entryStyle}`,
    `Learning pace: ${archetype.learningPace}`,
    `Framing preference: ${archetype.framingPreference}`,
    '',
    'Output constraints:',
    '- Open with a hook, then framing and pacing in this reader\'s style.',
    '- Include one analogy suited to this reader.',
    `- Include a genuine counter-argument section: ${story.counterArgument.thesis}`,
    `- End with an explicit "What We Can't Prove" section: ${story.whatWeCantProve}`,
  ].join('\n');

  return { system: REWRITE_SYSTEM_PROMPT, user };
}
