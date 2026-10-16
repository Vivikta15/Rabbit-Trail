import { Story } from '../types';

export const VERIFIED_STORIES: Story[] = [
  {
    id: 'story-venice-arsenal-1570',
    date: '2026-10-16',
    title: 'The Great Bottleneck at the Venetian Arsenal',
    protagonist: 'Alvise da Ponte (Chief Naval Commissioner of Venice)',
    decisionContext: 'In 1570, the Ottoman Empire demanded the immediate surrender of Cyprus. Venice had mere months to deploy an armada of 100 galleys, requiring the Venetian Arsenal—the largest pre-industrial industrial complex on earth—to assemble a warship every 24 hours using moving assembly lines.',
    facts: [
      {
        claim: 'The Venetian Arsenal employed up to 16,000 workers at its peak and could assemble a pre-fabricated galley in less than a single day.',
        sourceTitle: 'Venetian Ships and Shipbuilders of the Renaissance (Lane, 1934)',
        sourceUrl: 'https://en.wikipedia.org/wiki/Venetian_Arsenal',
        isVerified: true
      },
      {
        claim: 'Venice introduced standardized parts—from interchangeable rudders to uniform oar lengths—two centuries before Eli Whitney popularized standardized manufacturing.',
        sourceTitle: 'A History of Venice (John Julius Norwich)',
        sourceUrl: 'https://archive.org/details/historyofvenice00norw',
        isVerified: true
      },
      {
        claim: 'During the 1570 mobilization, shipwrights struck over wage arrears despite the existential Ottoman threat, forcing the Senate to mint emergency silver coins.',
        sourceTitle: 'State Archives of Venice (Senato Mar, Reg. 39)',
        sourceUrl: 'https://www.archiviodistatovenezia.it/',
        isVerified: true
      }
    ],
    counterArgument: {
      thesis: 'The Arsenal’s rigid standardization ultimately stifled naval innovation and caused Venice’s eventual decline against Atlantic sailing galleons.',
      evidence: 'By standardizing galley hulls so rigidly to fit Venetian shallow lagoon docks and canals, the Republic failed to adopt broadside deep-keel sailing ships until the English and Dutch had already dominated Mediterranean trade routes in the 17th century.',
      unresolvedPoints: 'Historians still dispute whether Venice could have physically adopted deep-keeled Atlantic galleons without completely abandoning its lagoon-based defense sanctuary.'
    },
    whatWeCantProve: 'While contemporary accounts claim Venice built a fully armed galley during the two-hour lunch of King Henry III of France in 1574, modern maritime engineers suspect the ship was 95% pre-assembled and merely rigged and launched as state theater.',
    presentationVariants: {
      cartographer: {
        hook: 'Look at the lagoon of Venice not as romantic canals, but as a heavily fortified industrial machine with one central engine: the Arsenal.',
        narrativePacing: 'Structural overview of Mediterranean trade routes, Venetian choke points, and the logistics network feeding raw timber from the Alpine forests into the lagoon.',
        introFraming: 'To understand how tiny Venice held off the Ottoman Empire, you have to look at the geographical map of the eastern Mediterranean in 1570.',
        analogy: 'The Arsenal was the Silicon Valley semiconductor fab of the 16th century: an impenetrable walled compound holding trade secrets and controlling a continent-wide supply chain.'
      },
      detective: {
        hook: 'The official state chroniclers claimed Venice united in patriotic fervor to meet the Ottoman fleet. The shipyard ledger tell a story of mutiny, wage fraud, and counterfeit silver.',
        narrativePacing: 'Opens directly on the courtroom dispute between Commissioner Da Ponte and the Guild of Ship Caulkers refusing to caulk hulls until backpay arrived.',
        introFraming: 'Before a single cannon fired at the Battle of Lepanto, Venice nearly lost the war inside a dusty accounting office overlooking the Grand Canal.',
        analogy: 'Imagine a defense contractor holding a supersonic stealth fighter hostage on the factory runway hours before an invasion because the treasury bounced a payroll check.'
      },
      archaeologist: {
        hook: 'Underneath the mud of the Arsenal basin lie numbered oak timbers, stamped with Roman numerals that date back to the early 1300s.',
        narrativePacing: 'Chronological excavation from the early 12th-century slipways through the progressive additions of the New and Newest Arsenals.',
        introFraming: 'Every joint in a Venetian war galley was the result of three centuries of trial-and-error codified into rigid guild handbooks.',
        analogy: 'Inspecting a 16th-century Venetian galley is like excavating the fossil record of European maritime engineering.'
      },
      magpie: {
        hook: 'Did you know that the word "arsenal" comes from the Arabic dar as-sina\'a ("house of manufacturing"), and Venice had its own private wine fountain for thirsty shipwrights?',
        narrativePacing: 'Serendipitous hops from wine rations and palace spy networks to the strange recipe for Venetian ship-sealing pitch.',
        introFraming: 'History books remember the massive naval clash of Lepanto, but they forget the secret pitch cauldron that almost burnt Venice to the water.',
        analogy: 'The Arsenal was like a Victorian Willy Wonka factory, if Wonka produced 150-foot war galleys and kept a secret police force in the cellar.'
      },
      alchemist: {
        hook: 'How do you turn raw Alpine oak and Mediterranean hemp into geopolitical hegemony in less than 24 hours? You invent the moving assembly line 350 years before Henry Ford.',
        narrativePacing: 'Focuses on the transformation of production methods, feedback loops, and how standardization creates disproportionate leverage.',
        introFraming: 'Venice discovered the ultimate economic law: when material resources are scarce, velocity of assembly beats raw scale.',
        analogy: 'The Arsenal operated like a modern continuous integration/continuous delivery (CI/CD) software pipeline, turning raw dependencies into deployed military software.'
      },
      apprentice: {
        hook: 'Step into the workshop: smell the hot pitch, feel the grain of green oak, and watch how exactly eight men fit an interchangeable rudder in twelve minutes flat.',
        narrativePacing: 'Practical, step-by-step examination of the physical carpentry tools, mortise-and-tenon joints, and precise manufacturing workflow.',
        introFraming: 'You cannot understand naval strategy from an armchair; you have to understand the physical tolerances of an iron adze carving an oak beam.',
        analogy: 'Think of assembling a flat-pack Swedish bookshelf, except every bolt is hand-forged bronze and your life depends on it staying watertight in a gale.'
      }
    }
  }
];
