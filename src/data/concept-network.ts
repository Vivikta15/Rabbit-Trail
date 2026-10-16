import { ConnectionNode, ConnectionStep } from '../types';

export interface ConceptGraphEdge {
  from: string;
  to: string;
  relationship: string;
  basis: string;
  citation: string;
}

export const CONCEPT_NODES: Record<string, ConnectionNode> = {
  cheese: {
    id: 'cheese',
    title: 'Cheese',
    domain: 'Food & Fermentation',
    summary: 'A dairy product formed by coagulation of milk protein casein, dating back over 4,000 years to early Neolithic pastoralism.'
  },
  fermentation: {
    id: 'fermentation',
    title: 'Fermentation & Preservation',
    domain: 'Microbiology & Chemistry',
    summary: 'Metabolic process that produces chemical changes in organic substrates through enzyme action, critical for ancient food storage.'
  },
  freeze_drying: {
    id: 'freeze_drying',
    title: 'Lyophilization (Freeze-Drying)',
    domain: 'Food Technology & Chemistry',
    summary: 'Dehydration process that removes water from frozen material through sublimation, perfected by NASA for extended space flights.'
  },
  apollo_11: {
    id: 'apollo_11',
    title: 'Apollo 11 & Space Rations',
    domain: 'Aerospace History',
    summary: 'The 1969 NASA mission that landed the first humans on the Moon, requiring specialized shelf-stable dehydrated food rations.'
  },
  moon: {
    id: 'moon',
    title: 'The Moon',
    domain: 'Astronomy & Planetary Science',
    summary: 'Earth’s only natural satellite, formed 4.51 billion years ago, covered in basaltic regolith.'
  },
  folklore: {
    id: 'folklore',
    title: 'The Green Cheese Myth',
    domain: 'Mythology & Literature',
    summary: 'A 16th-century English proverb ("the moon is made of green cheese") coined by John Heywood in 1546 as an example of absurd credulity.'
  },
  silicon: {
    id: 'silicon',
    title: 'Silicon & Semiconductors',
    domain: 'Materials Science',
    summary: 'Semiconductor material fundamental to integrated circuits and modern computer processors.'
  },
  sand: {
    id: 'sand',
    title: 'Silica Sand',
    domain: 'Geology & Glassmaking',
    summary: 'Granular material composed of silicon dioxide, melted for thousands of years to forge glass and refined for electronics.'
  },
  pyramids: {
    id: 'pyramids',
    title: 'Giza Pyramids',
    domain: 'Ancient Architecture',
    summary: 'Monumental limestone and granite tombs constructed during Egypt’s Old Kingdom, requiring desert sand lubrication for sledges.'
  }
};

export const CONCEPT_EDGES: ConceptGraphEdge[] = [
  {
    from: 'cheese',
    to: 'fermentation',
    relationship: 'relies on biochemical process',
    basis: 'Early cheese production was humanity’s first systematic exploitation of bacterial fermentation to store surplus dairy calories.',
    citation: 'Kindstedt, P. Cheese and Culture: A History of Cheese and its Place in Western Civilization (2012)'
  },
  {
    from: 'fermentation',
    to: 'freeze_drying',
    relationship: 'evolved storage technique into',
    basis: 'As civilizations industrialized, bacterial curing was supplemented by high-vacuum freeze-drying to preserve food indefinitely without refrigeration.',
    citation: 'Fellows, P. Food Processing Technology: Principles and Practice (2009)'
  },
  {
    from: 'freeze_drying',
    to: 'apollo_11',
    relationship: 'engineered mission nutrition for',
    basis: 'NASA engineers adapted commercial freeze-drying to develop bite-sized compressed cubes and rehydratable pasteurized cheese spreads for Apollo 11 astronauts.',
    citation: 'NASA Technical Reports: Biomedical Results of Apollo (SP-368, Section IV)'
  },
  {
    from: 'apollo_11',
    to: 'moon',
    relationship: 'landed humans directly on',
    basis: 'Neil Armstrong and Buzz Aldrin stepped onto Mare Tranquillitatis on July 20, 1969, having consumed freeze-dried rations en route.',
    citation: 'First on the Moon: A Voyage with Neil Armstrong, Michael Collins, Edwin E. Aldrin Jr. (1970)'
  },
  {
    from: 'cheese',
    to: 'folklore',
    relationship: 'inspired the literary metaphor of',
    basis: 'John Heywood wrote in 1546: "The moon is made of a green cheese", referring not to color, but to fresh unaged curds.',
    citation: 'Heywood, J. A Dialogue of the Effectual Proverbs in the English Tongue (1546)'
  },
  {
    from: 'folklore',
    to: 'moon',
    relationship: 'became an iconic cultural misconception about',
    basis: 'Centuries of folk satire transformed the proverb into an enduring humorous myth about lunar composition.',
    citation: 'The Oxford Dictionary of Nursery Rhymes (Opie & Opie)'
  },
  {
    from: 'silicon',
    to: 'sand',
    relationship: 'is chemically extracted and purified from',
    basis: 'Electronic-grade polysilicon is produced by carbothermic reduction of pure quartz silica sand at 1900°C.',
    citation: 'Sze, S. M. Semiconductor Devices: Physics and Technology'
  },
  {
    from: 'sand',
    to: 'pyramids',
    relationship: 'served as logistical slipway for',
    basis: 'A tomb painting of Djehutihotep demonstrates workers pouring water onto desert sand ahead of a colossus sledge, halving the pulling friction.',
    citation: 'Fall et al., Physical Review Letters: "Sliding Friction on Wet and Dry Sand" (2014)'
  }
];
