import { QuizScenario } from '../types';

export const QUIZ_SCENARIOS: QuizScenario[] = [
  {
    id: 1,
    question: "You arrive in an ancient walled city you've never visited. What is the very first thing you do?",
    context: "Entering unfamiliar territory",
    options: [
      {
        text: "Climb the highest cathedral spire to view the entire layout, fortifications, and topography from above.",
        archetypeWeights: { cartographer: 3, alchemist: 1 }
      },
      {
        text: "Head straight to the courthouse or town hall archives to see what the citizens are currently suing each other over.",
        archetypeWeights: { detective: 3, magpie: 1 }
      },
      {
        text: "Walk down to the oldest foundational aqueducts and basement ruins to touch the earliest masonry.",
        archetypeWeights: { archaeologist: 3, apprentice: 1 }
      },
      {
        text: "Wander the bazaar alleys looking for the weirdest street performer or the most peculiar local apothecary shop.",
        archetypeWeights: { magpie: 3, cartographer: 1 }
      }
    ]
  },
  {
    id: 2,
    question: "When reading about a historic conflict or major treaty, which section commands your undivided focus?",
    context: "Investigating historical turning points",
    options: [
      {
        text: "The dissenting minority's secret letters arguing that the treaty was a disastrous mistake.",
        archetypeWeights: { detective: 3, archaeologist: 1 }
      },
      {
        text: "The structural incentives: wheat prices, trade routes, and naval choke points that forced their hand.",
        archetypeWeights: { cartographer: 3, alchemist: 2 }
      },
      {
        text: "The psychological and philosophical formula that explains how enemies turned into collaborators.",
        archetypeWeights: { alchemist: 3, magpie: 1 }
      },
      {
        text: "The exact day-to-day timeline and practical logistics of how the envoys drafted each clause.",
        archetypeWeights: { apprentice: 3, archaeologist: 1 }
      }
    ]
  },
  {
    id: 3,
    question: "How do you prefer complex technical concepts (e.g. quantum entanglement or central banking) to be explained to you?",
    context: "Mental model absorption",
    options: [
      {
        text: "Through a vivid, counter-intuitive real-world analogy that makes the hidden mechanism click immediately.",
        archetypeWeights: { alchemist: 3, magpie: 2 }
      },
      {
        text: "A clean, sequential breakdown starting with zero jargon and building up step-by-step from first principles.",
        archetypeWeights: { apprentice: 3, cartographer: 1 }
      },
      {
        text: "Show me the real-world controversy or crisis where this system broke and experts fiercely disagreed.",
        archetypeWeights: { detective: 3, apprentice: 1 }
      },
      {
        text: "Show me the conceptual map: where this fits in the family tree of related ideas and historical predecessors.",
        archetypeWeights: { cartographer: 3, archaeologist: 2 }
      }
    ]
  },
  {
    id: 4,
    question: "You fall into an internet rabbit hole at 11:30 PM. What kind of thread keeps you awake until 2:00 AM?",
    context: "Spontaneous curiosity spikes",
    options: [
      {
        text: "A 40-tweet chain revealing how a bizarre dispute over bird guano reshaped 19th-century naval law.",
        archetypeWeights: { magpie: 3, detective: 1 }
      },
      {
        text: "A comprehensive deep dive uncovering the 2,000-year etymological and archaeological roots of concrete.",
        archetypeWeights: { archaeologist: 3, apprentice: 1 }
      },
      {
        text: "An investigation comparing why Venice's maritime governance succeeded while Genoa's collapsed under the same incentives.",
        archetypeWeights: { cartographer: 3, alchemist: 2 }
      },
      {
        text: "A master artisan dissecting the exact physical tolerances, joinery, and tool marks of Japanese pagoda construction.",
        archetypeWeights: { apprentice: 3, alchemist: 1 }
      }
    ]
  },
  {
    id: 5,
    question: "When a writer presents a seemingly air-tight argument, what is your reflex reaction?",
    context: "Critical evaluation stance",
    options: [
      {
        text: "Immediately look for the strongest opposing view to test where the argument fractures under pressure.",
        archetypeWeights: { detective: 3, alchemist: 1 }
      },
      {
        text: "Check if the underlying model holds when transferred to a completely unrelated industry or era.",
        archetypeWeights: { alchemist: 3, cartographer: 1 }
      },
      {
        text: "Examine whether their historical citations are cherry-picked or true to primary sources.",
        archetypeWeights: { archaeologist: 3, detective: 1 }
      },
      {
        text: "Test whether their thesis actually works in practical, messy day-to-day execution.",
        archetypeWeights: { apprentice: 3, magpie: 1 }
      }
    ]
  },
  {
    id: 6,
    question: "What is your relationship with keeping a daily streak in a learning app?",
    context: "Habit psychology",
    options: [
      {
        text: "I hate streak guilt. If I miss a day because of life, don't punish me—just save where I was and let me resume.",
        archetypeWeights: { magpie: 2, apprentice: 2, detective: 1 }
      },
      {
        text: "I want to see the shape of what I learned: a visual map of territories and eras I explored, not a naked number.",
        archetypeWeights: { cartographer: 3, archaeologist: 2 }
      },
      {
        text: "I love measuring intellectual range: how far out of my comfort zone my curiosity traveled this month.",
        archetypeWeights: { alchemist: 2, magpie: 3 }
      },
      {
        text: "I value depth of understanding: how thoroughly I engaged with the counter-arguments and primary evidence.",
        archetypeWeights: { detective: 2, archaeologist: 2, apprentice: 2 }
      }
    ]
  }
];

export function calculateArchetype(selectedOptionIndices: number[]): {
  topArchetype: import('../types').ArchetypeId;
  scores: Record<import('../types').ArchetypeId, number>;
} {
  const scores: Record<import('../types').ArchetypeId, number> = {
    cartographer: 0,
    detective: 0,
    archaeologist: 0,
    magpie: 0,
    alchemist: 0,
    apprentice: 0
  };

  selectedOptionIndices.forEach((optionIdx, qIdx) => {
    const scenario = QUIZ_SCENARIOS[qIdx];
    if (scenario && scenario.options[optionIdx]) {
      const weights = scenario.options[optionIdx].archetypeWeights;
      Object.entries(weights).forEach(([key, val]) => {
        const archKey = key as import('../types').ArchetypeId;
        scores[archKey] = (scores[archKey] || 0) + (val || 0);
      });
    }
  });

  let topArchetype: import('../types').ArchetypeId = 'cartographer';
  let maxScore = -1;

  Object.entries(scores).forEach(([key, score]) => {
    if (score > maxScore) {
      maxScore = score;
      topArchetype = key as import('../types').ArchetypeId;
    }
  });

  return { topArchetype, scores };
}
