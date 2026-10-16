import { Story, ArchetypeId } from '../types';
import { ARCHETYPES } from '../data/archetypes';

export function renderPersonalizedStory(story: Story, archetypeId: ArchetypeId): {
  headline: string;
  hook: string;
  body: string;
  counterArgumentSection: string;
  unprovableSection: string;
  citations: Story['facts'];
} {
  const archetype = ARCHETYPES[archetypeId] || ARCHETYPES.cartographer;
  const variant = story.presentationVariants[archetypeId] || story.presentationVariants.cartographer;

  const headline = `${story.title} (${archetype.name} Perspective)`;
  const hook = variant.hook;

  // Compose body preserving all facts verbatim while wrapping with archetype framing & analogy
  const body = `
${variant.introFraming}

${story.decisionContext}

${variant.narrativePacing}

---

### Core Factual Foundation
${story.facts.map((f, i) => `**Fact ${i + 1}:** ${f.claim} *(Source: [${f.sourceTitle}](${f.sourceUrl}))*`).join('\n\n')}

### The Operational Analogy
${variant.analogy}
`.trim();

  const counterArgumentSection = `
### The Other Side of the Ledger
**Counter-Thesis:** ${story.counterArgument.thesis}

**The Historical Evidence:** ${story.counterArgument.evidence}

**What Remains Contested:** ${story.counterArgument.unresolvedPoints}
`.trim();

  const unprovableSection = `
### What the Story Can't Prove
${story.whatWeCantProve}
`.trim();

  return {
    headline,
    hook,
    body,
    counterArgumentSection,
    unprovableSection,
    citations: story.facts
  };
}
