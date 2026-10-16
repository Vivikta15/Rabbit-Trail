import { Archetype, ArchetypeId } from '../types';

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  cartographer: {
    id: 'cartographer',
    name: 'The Cartographer',
    tagline: 'You see the landscape, the systems, and the hubs before the details.',
    description: 'You make sense of new domains by first understanding the high-level map. You want to see how the pieces interconnect, which factions or forces shaped the borders, and where the core centers of gravity lie before zooming into individual human lives.',
    entryStyle: 'System & Map First',
    learningPace: 'Top-down structural mapping',
    framingPreference: 'Macro-historical patterns, institutional friction, geopolitical context',
    iconName: 'Map',
    accentColor: '#3B82F6', // Blue
    traits: ['Structural thinker', 'Loves conceptual maps', 'Context-driven', 'Sees second-order effects']
  },
  detective: {
    id: 'detective',
    name: 'The Detective',
    tagline: 'You start with the dispute, the contradiction, and the forensic evidence.',
    description: 'When handed a tidy story, your first instinct is to ask: "Wait, who was arguing against this, and why?" You prefer stories that open on the mystery, dispute, or trial, following the paper trail to see who actually had the stronger claim.',
    entryStyle: 'Controversy & Counter-Argument First',
    learningPace: 'Investigative & evidence-first',
    framingPreference: 'Competing claims, forensic records, dissenting factions',
    iconName: 'Search',
    accentColor: '#EF4444', // Red
    traits: ['Skeptical inquirer', 'Counter-argument collector', 'Rigor over tidy narratives', 'Detects unstated motives']
  },
  archaeologist: {
    id: 'archaeologist',
    name: 'The Archaeologist',
    tagline: 'You dig down to the bedrock origins, layer by chronological layer.',
    description: 'To truly grasp why a modern institution or idea exists, you must dig all the way back to the primordial stratum. You love the granular timeline, the physical artifacts, and the linguistic etymologies that explain how we arrived here.',
    entryStyle: 'Origin & Chronology First',
    learningPace: 'Deep evolutionary excavation',
    framingPreference: 'Primary sources, physical artifacts, chronological strata',
    iconName: 'Hourglass',
    accentColor: '#D97706', // Amber
    traits: ['Genealogical thinker', 'Deep historical depth', 'Primary source enthusiast', 'Patience for gradual evolution']
  },
  magpie: {
    id: 'magpie',
    name: 'The Magpie',
    tagline: 'You hunt for shiny lateral curiosities, brilliant anecdotes, and unexpected parallels.',
    description: 'You believe the most profound truths hide in bizarre side alleys and odd biographical footnotes. You thrive on surprising juxtapositions—how a Victorian clockmaker inspired space navigation, or why concrete recipes collapsed with Rome.',
    entryStyle: 'Anecdote & Lateral Spark First',
    learningPace: 'Wide-ranging serendipitous jumps',
    framingPreference: 'Bizarre historical ironies, character eccentricities, unexpected cross-domain links',
    iconName: 'Sparkles',
    accentColor: '#8B5CF6', // Purple
    traits: ['Lateral connector', 'Anecdote collector', 'High curiosity radius', 'Cross-pollinator']
  },
  alchemist: {
    id: 'alchemist',
    name: 'The Alchemist',
    tagline: 'You search for the underlying principles that transform one domain into another.',
    description: 'You want the invariant mental models: the chemical, economic, or psychological laws that remain true whether you are looking at Venetian banking or modern neural networks. You enjoy distilling complex narratives into portable mental formulas.',
    entryStyle: 'First-Principles & Transformation First',
    learningPace: 'Conceptual distillation',
    framingPreference: 'Feedback loops, invariant laws, domain cross-translation',
    iconName: 'FlaskConical',
    accentColor: '#10B981', // Emerald
    traits: ['Model builder', 'Loves potent analogies', 'First-principles seeker', 'Systems synthesizer']
  },
  apprentice: {
    id: 'apprentice',
    name: 'The Apprentice',
    tagline: 'You build from the ground up: clear foundations, pragmatic steps, and tangible craft.',
    description: 'You want clarity, craftsmanship, and grounded execution. You appreciate a story that respects the actual labor, tools, and constraints faced by the protagonist, laying out how each incremental decision was made without hand-waving.',
    entryStyle: 'Foundational & Pragmatic Building',
    learningPace: 'Step-by-step clear progression',
    framingPreference: 'Material realities, craftsmanship, practical trade-offs, clear causality',
    iconName: 'Compass',
    accentColor: '#F59E0B', // Amber/Yellow
    traits: ['Grounded builder', 'Values clarity over jargon', 'Appreciates hard constraints', 'Sequential master']
  }
};
