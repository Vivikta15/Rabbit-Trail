import type { Metadata } from 'next';
import QuizWizard from '../../components/quiz/QuizWizard';
import { ARCHETYPES } from '../../data/archetypes';
import { parseSharedArchetype } from '../../lib/share/archetype-share';

export function generateMetadata({ searchParams }: { searchParams: { archetype?: string | string[] } }): Metadata {
  const raw = Array.isArray(searchParams.archetype) ? searchParams.archetype[0] : searchParams.archetype;
  const id = parseSharedArchetype(raw);
  if (!id) return {};
  const a = ARCHETYPES[id];
  const title = `I'm ${a.name}. What's your curiosity archetype?`;
  const image = `/api/og?archetype=${id}`;
  return {
    title: `${title} · Rabbit Trail`,
    description: a.tagline,
    openGraph: { title, description: a.tagline, images: [image] },
    twitter: { card: 'summary_large_image', title, description: a.tagline, images: [image] },
  };
}

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: { archetype?: string | string[] };
}) {
  const shared = Array.isArray(searchParams.archetype)
    ? searchParams.archetype[0]
    : searchParams.archetype;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
          Rabbit Trail
        </h1>
      </header>
      <QuizWizard sharedArchetypeId={parseSharedArchetype(shared)} />
    </main>
  );
}
