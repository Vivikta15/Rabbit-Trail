'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { localDateString } from '../lib/habit/activity-log';
import { CALM_STORAGE_KEY, parseCalmSetting, streakMood, StreakMood } from '../lib/mascot/mood';
import { useActivityLog } from './use-activity-log';

const CALM_EVENT = 'rabbit:calm';

// The reader's choice to see only friendly faces. Kept in this browser, and shared by every rabbit on the page.
export function useCalmRabbit() {
  const [calm, setCalmState] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setCalmState(parseCalmSetting(window.localStorage.getItem(CALM_STORAGE_KEY)));
      } catch {
        setCalmState(false);
      }
    };
    read();
    window.addEventListener(CALM_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(CALM_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  const setCalm = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(CALM_STORAGE_KEY, String(value));
    } catch {
      // Blocked storage: the choice still applies until the page is closed.
    }
    setCalmState(value);
    window.dispatchEvent(new Event(CALM_EVENT));
  }, []);

  return { calm, setCalm };
}

// null until the browser has been read, so nothing flashes the wrong mood.
export function useStreakMood(): StreakMood | null {
  const { log } = useActivityLog();
  return useMemo(() => {
    if (!log) return null;
    const readingDates = log.filter((e) => e.type === 'story').map((e) => e.date);
    return streakMood({ readingDates, today: localDateString() });
  }, [log]);
}
