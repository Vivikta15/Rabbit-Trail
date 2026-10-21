export type ArchetypeId = 
  | 'cartographer' 
  | 'detective' 
  | 'archaeologist' 
  | 'magpie' 
  | 'alchemist' 
  | 'apprentice';

export interface Archetype {
  id: ArchetypeId;
  name: string;
  tagline: string;
  description: string;
  entryStyle: string;
  learningPace: string;
  framingPreference: string;
  iconName: string;
  accentColor: string;
  traits: string[];
}

export interface QuizScenario {
  id: number;
  question: string;
  context: string;
  options: {
    text: string;
    archetypeWeights: Partial<Record<ArchetypeId, number>>;
  }[];
}

export interface UserReadingProfile {
  archetypeId: ArchetypeId;
  assignedAt: string;
  curiosityRadius: number; // 0-100 score
  longestRabbitHole: number; // in steps / concepts
  counterArgumentReadCount: number;
  totalStoriesRead: number;
  streakDays: number;
  isStreakPaused: boolean;
  lastReadDate?: string;
  trialStartDate: string;
  isSubscribed: boolean;
}

export interface StoryFact {
  claim: string;
  sourceTitle: string;
  sourceUrl: string;
  isVerified: boolean;
  // Generated stories carry the verbatim passage the claim was taken from; the pipeline refuses to
  // publish a fact whose quote is not found in the fetched source.
  evidenceQuote?: string;
}

// The encyclopedia page a story is built from. Its outbound links are the rabbit-hole graph.
export interface StorySource {
  title: string;
  url: string;
  revisionId?: number;
}

export interface Story {
  id: string;
  date: string;
  title: string;
  protagonist: string;
  topic: string; // Trail Map label
  era: string; // Trail Map era
  source: StorySource;
  relatedTopics: string[]; // titles this story links onward to, used to follow a reader's trail
  decisionContext: string;
  facts: StoryFact[];
  counterArgument: {
    thesis: string;
    evidence: string;
    unresolvedPoints: string;
    evidenceQuote?: string; // generated stories: verbatim source passage behind the counter-argument
  };
  whatWeCantProve: string;
  // Archetype-tailored presentation variants
  presentationVariants: Record<ArchetypeId, {
    hook: string;
    narrativePacing: string;
    introFraming: string;
    analogy: string;
  }>;
}

export interface ConnectionNode {
  id: string;
  title: string;
  domain: string;
  summary: string;
}

export interface ConnectionStep {
  from: string;
  to: string;
  relationship: string;
  historicalOrScientificBasis: string;
  sourceCitation: string;
}

export interface ConnectionTrail {
  conceptA: string;
  conceptB: string;
  hopsCount: number;
  nodes: ConnectionNode[];
  steps: ConnectionStep[];
}
