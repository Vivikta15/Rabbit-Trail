import ConnectionFinder from '../../components/connections/ConnectionFinder';
import AccessGate from '../../components/subscription/AccessGate';
import { CONCEPT_NODES } from '../../data/concept-network';

export default function ConnectionsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Rabbit Trail</p>
      <h1 className="text-3xl font-bold">Connection Finder</h1>
      <p className="mb-8 mt-2 text-slate-300">
        Pick any two concepts and follow a sourced chain of links between them.
      </p>
      <AccessGate feature="connections">
        <ConnectionFinder suggestions={Object.values(CONCEPT_NODES).map((n) => n.title)} />
      </AccessGate>
    </main>
  );
}
