const CONCEPT_NODES = {
  cheese: { id: 'cheese', title: 'Cheese', domain: 'Food & Fermentation' },
  fermentation: { id: 'fermentation', title: 'Fermentation & Preservation', domain: 'Microbiology' },
  freeze_drying: { id: 'freeze_drying', title: 'Freeze-Drying', domain: 'Food Tech' },
  apollo_11: { id: 'apollo_11', title: 'Apollo 11 Rations', domain: 'Aerospace' },
  moon: { id: 'moon', title: 'The Moon', domain: 'Astronomy' }
};

const CONCEPT_EDGES = [
  { from: 'cheese', to: 'fermentation', relationship: 'relies on biochemical process', basis: 'Early cheese storage', citation: 'Kindstedt 2012' },
  { from: 'fermentation', to: 'freeze_drying', relationship: 'evolved storage technique into', basis: 'Industrial preservation', citation: 'Fellows 2009' },
  { from: 'freeze_drying', to: 'apollo_11', relationship: 'engineered mission nutrition for', basis: 'NASA astronaut cheese rations', citation: 'NASA SP-368' },
  { from: 'apollo_11', to: 'moon', relationship: 'landed humans directly on', basis: 'Mare Tranquillitatis landing', citation: 'NASA 1969' }
];

function findConnectionPath(startKey, targetKey) {
  const normStart = startKey.trim().toLowerCase().replace(/\s+/g, '_');
  const normTarget = targetKey.trim().toLowerCase().replace(/\s+/g, '_');

  if (!CONCEPT_NODES[normStart] || !CONCEPT_NODES[normTarget]) return null;

  const adj = new Map();
  Object.keys(CONCEPT_NODES).forEach(k => adj.set(k, []));
  CONCEPT_EDGES.forEach(e => {
    adj.get(e.from)?.push({ neighbor: e.to, edge: e });
    adj.get(e.to)?.push({ neighbor: e.from, edge: e });
  });

  const queue = [normStart];
  const visited = new Set([normStart]);
  const parentMap = new Map();
  let found = false;

  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === normTarget) {
      found = true;
      break;
    }
    const neighbors = adj.get(curr) || [];
    for (const { neighbor, edge } of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parentMap.set(neighbor, { parent: curr, edge });
        queue.push(neighbor);
      }
    }
  }

  if (!found) return null;

  const pathNodes = [];
  const steps = [];
  let curr = normTarget;

  while (curr !== normStart) {
    const record = parentMap.get(curr);
    pathNodes.unshift(CONCEPT_NODES[curr]);
    steps.unshift({
      from: CONCEPT_NODES[record.parent].title,
      to: CONCEPT_NODES[curr].title,
      relationship: record.edge.relationship,
      basis: record.edge.basis,
      citation: record.edge.citation
    });
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

module.exports = { findConnectionPath };
