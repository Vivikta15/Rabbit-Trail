import { CONCEPT_NODES, CONCEPT_EDGES, ConceptGraphEdge } from '../../data/concept-network';
import { ConnectionTrail, ConnectionNode, ConnectionStep } from '../../types';

export type ConnectionResult =
  | { status: 'path'; trail: ConnectionTrail }
  | { status: 'unconnected'; verified: false; conceptA: string; conceptB: string; narrative: string }
  | { status: 'unknown'; unknownTerms: string[]; suggestions: string[] };

// Accepts a node id ("freeze_drying"), a title ("The Moon") or loose casing/spacing.
export function resolveConceptKey(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const asId = cleaned.replace(/ /g, '_');
  if (CONCEPT_NODES[asId]) return asId;
  return Object.keys(CONCEPT_NODES).find((k) => CONCEPT_NODES[k].title.toLowerCase() === cleaned) ?? null;
}

function nearestNeighbors(key: string): string[] {
  const titles = new Set<string>();
  CONCEPT_EDGES.forEach((e) => {
    if (e.from === key) titles.add(CONCEPT_NODES[e.to].title);
    if (e.to === key) titles.add(CONCEPT_NODES[e.from].title);
  });
  return Array.from(titles);
}

function describeSide(key: string): string {
  const node = CONCEPT_NODES[key];
  const neighbors = nearestNeighbors(key);
  const nearby = neighbors.length ? ` Its documented neighbors are ${neighbors.join(', ')}.` : ' It has no documented neighbors yet.';
  return `${node.title} (${node.domain}): ${node.summary}${nearby}`;
}

export function exploreConnection(termA: string, termB: string): ConnectionResult {
  const keyA = resolveConceptKey(termA);
  const keyB = resolveConceptKey(termB);

  if (!keyA || !keyB) {
    const unknownTerms = [keyA ? null : termA.trim(), keyB ? null : termB.trim()].filter((t): t is string => t !== null);
    return {
      status: 'unknown',
      unknownTerms,
      suggestions: Object.values(CONCEPT_NODES).map((n) => n.title),
    };
  }

  const trail = findConnectionPath(keyA, keyB);
  if (trail) return { status: 'path', trail };

  return {
    status: 'unconnected',
    verified: false,
    conceptA: CONCEPT_NODES[keyA].title,
    conceptB: CONCEPT_NODES[keyB].title,
    narrative:
      `We have no documented chain between ${CONCEPT_NODES[keyA].title} and ${CONCEPT_NODES[keyB].title}, ` +
      `so this is a starting point rather than a verified path. ${describeSide(keyA)} ${describeSide(keyB)}`,
  };
}

export function findConnectionPath(startKey: string, targetKey: string): ConnectionTrail | null {
  const normStart = resolveConceptKey(startKey);
  const normTarget = resolveConceptKey(targetKey);

  if (!normStart || !normTarget) {
    return null;
  }

  if (normStart === normTarget) {
    const node = CONCEPT_NODES[normStart];
    return {
      conceptA: node.title,
      conceptB: node.title,
      hopsCount: 0,
      nodes: [node],
      steps: []
    };
  }

  // Build bidirectional adjacency list
  const adj = new Map<string, { neighbor: string; edge: ConceptGraphEdge; forward: boolean }[]>();
  Object.keys(CONCEPT_NODES).forEach(k => adj.set(k, []));

  CONCEPT_EDGES.forEach(edge => {
    adj.get(edge.from)?.push({ neighbor: edge.to, edge, forward: true });
    adj.get(edge.to)?.push({ neighbor: edge.from, edge, forward: false });
  });

  // Breadth-First Search (BFS) for shortest path
  const queue: string[] = [normStart];
  const visited = new Set<string>([normStart]);
  const parentMap = new Map<string, { parent: string; edge: ConceptGraphEdge; forward: boolean }>();

  let found = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === normTarget) {
      found = true;
      break;
    }

    const neighbors = adj.get(current) || [];
    for (const { neighbor, edge, forward } of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parentMap.set(neighbor, { parent: current, edge, forward });
        queue.push(neighbor);
      }
    }
  }

  if (!found) return null;

  // Reconstruct path
  const pathNodes: ConnectionNode[] = [];
  const steps: ConnectionStep[] = [];
  let curr = normTarget;

  while (curr !== normStart) {
    const record = parentMap.get(curr)!;
    pathNodes.unshift(CONCEPT_NODES[curr]);

    const step: ConnectionStep = {
      from: CONCEPT_NODES[record.parent].title,
      to: CONCEPT_NODES[curr].title,
      relationship: record.edge.relationship,
      historicalOrScientificBasis: record.edge.basis,
      sourceCitation: record.edge.citation
    };
    steps.unshift(step);

    curr = record.parent;
  }
  pathNodes.unshift(CONCEPT_NODES[normStart]);

  return {
    conceptA: CONCEPT_NODES[normStart].title,
    conceptB: CONCEPT_NODES[normTarget].title,
    hopsCount: steps.length,
    nodes: pathNodes,
    steps
  };
}
