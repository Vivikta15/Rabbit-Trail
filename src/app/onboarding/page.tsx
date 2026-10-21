import QuizWizard from '../../components/quiz/QuizWizard';
import { parseSharedArchetype } from '../../lib/share/archetype-share';

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
        <h1 className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
          Rabbit Trail
        </h1>
      </header>
      <QuizWizard sharedArchetypeId={parseSharedArchetype(shared)} />
    </main>
  );
}
