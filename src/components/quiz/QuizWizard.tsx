'use client';

import Link from 'next/link';
import { useState } from 'react';
import { calculateArchetype, QUIZ_SCENARIOS } from '../../data/quiz-questions';
import { VERIFIED_STORIES } from '../../data/stories';
import { startTrial } from '../../hooks/use-subscription';
import { ArchetypeId } from '../../types';
import ArchetypeCard from './ArchetypeCard';

export default function QuizWizard({ sharedArchetypeId }: { sharedArchetypeId: ArchetypeId | null }) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [started, setStarted] = useState(sharedArchetypeId === null);

  const total = QUIZ_SCENARIOS.length;
  const finished = answers.length === total;

  if (sharedArchetypeId && !started) {
    return (
      <section className="space-y-6">
        <ArchetypeCard archetypeId={sharedArchetypeId} />
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-slate-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Discover your own archetype
        </button>
      </section>
    );
  }

  if (finished) {
    const { topArchetype } = calculateArchetype(answers);
    return (
      <section className="space-y-6">
        <ArchetypeCard archetypeId={topArchetype} />
        <Link
          href={`/story/${VERIFIED_STORIES[0].id}?archetype=${topArchetype}`}
          className="block w-full rounded-lg bg-amber-400 px-4 py-3 text-center font-semibold text-slate-950 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Read today&apos;s story
        </Link>
        <button
          type="button"
          onClick={() => setAnswers([])}
          className="text-sm text-slate-400 underline hover:text-slate-200"
        >
          Retake the quiz
        </button>
      </section>
    );
  }

  const current = answers.length;
  const scenario = QUIZ_SCENARIOS[current];

  return (
    <section aria-labelledby="quiz-question">
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs text-slate-400">
          <span>
            Question {current + 1} of {total}
          </span>
          <span>{scenario.context}</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={current}
          className="h-2 overflow-hidden rounded-full bg-slate-800"
        >
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${(current / total) * 100}%` }}
          />
        </div>
      </div>

      <h2 id="quiz-question" className="mb-6 text-xl font-semibold leading-snug">
        {scenario.question}
      </h2>

      <ul className="space-y-3">
        {scenario.options.map((option, index) => (
          <li key={option.text}>
            <button
              type="button"
              onClick={() => {
                setAnswers([...answers, index]);
                if (answers.length + 1 === total) startTrial();
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4 text-left hover:border-amber-400 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {option.text}
            </button>
          </li>
        ))}
      </ul>

      {current > 0 && (
        <button
          type="button"
          onClick={() => setAnswers(answers.slice(0, -1))}
          className="mt-6 text-sm text-slate-400 underline hover:text-slate-200"
        >
          Back
        </button>
      )}
    </section>
  );
}
