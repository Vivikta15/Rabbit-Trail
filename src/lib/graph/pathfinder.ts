import { CONCEPT_NODES, CONCEPT_EDGES, ConceptGraphEdge } from '../../data/concept-network';
import { ConnectionTrail, ConnectionNode, ConnectionStep } from '../../types';

export function findConnectionPath(startKey: string, targetKey: string): ConnectionTrail | null {
  const normStart = startKey.trim().toLowerCase().replace(/\s+/g, '_');
  const normTarget = targetKey.trim().toLowerCase().replace(/\s+/g, '_');

  if (!CONCEPT_NODES[normStart] || !CONCEPT_NODES[normTarget]) {
    // Graceful fallback for demo if concept not indexed
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
