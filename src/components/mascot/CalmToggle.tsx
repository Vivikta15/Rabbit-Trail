'use client';

import { useCalmRabbit } from '../../hooks/use-mascot';

export default function CalmToggle({ className = '' }: { className?: string }) {
  const { calm, setCalm } = useCalmRabbit();

  return (
    <label className={`flex cursor-pointer items-center gap-2 text-xs text-slate-300 ${className}`}>
      <input
        type="checkbox"
        checked={calm}
        onChange={(e) => setCalm(e.target.checked)}
        className="h-4 w-4 accent-amber-400"
      />
      Calm rabbit (friendly faces only)
    </label>
  );
}
