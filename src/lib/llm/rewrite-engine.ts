import { Story, ArchetypeId } from '../../types';
import { ARCHETYPES } from '../../data/archetypes';

const WORDS_PER_MINUTE = 200;

export interface PersonalizedStory {
  headline: string;
  hook: string;
  framing: string;
  context: string;
  pacing: string;
  analogy: string;
  facts: Story['facts'];
  counterArgument: Story['counterArgument'];
  whatWeCantProve: string;
  readingMinutes: number;
}

export function renderPersonalizedStory(story: Story, archetypeId: ArchetypeId): PersonalizedStory {
  const archetype = ARCHETYPES[archetypeId] || ARCHETYPES.cartographer;
  const variant = story.presentationVariants[archetypeId] || story.presentationVariants.cartographer;

  // Only the presentation layer varies by archetype; facts, counter-argument and
  // the unprovable boundary are passed through untouched.
  const text = [
    variant.hook,
    variant.introFraming,
    story.decisionContext,
    variant.narrativePacing,
    ...story.facts.map((f) => f.claim),
    variant.analogy,
    story.counterArgument.thesis,
    story.counterArgument.evidence,
    story.counterArgument.unresolvedPoints,
    story.whatWeCantProve,
  ].join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;

  return {
    headline: `${story.title} (${archetype.name} Perspective)`,
    hook: variant.hook,
    framing: variant.introFraming,
    context: story.decisionContext,
    pacing: variant.narrativePacing,
    analogy: variant.analogy,
    facts: story.facts,
    counterArgument: story.counterArgument,
    whatWeCantProve: story.whatWeCantProve,
    readingMinutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
  };
}
