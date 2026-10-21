'use client';

import { useCallback, useEffect, useState } from 'react';
import { ActivityEntry, appendEntry, loadActivity, saveActivity, StorageLike } from '../lib/habit/activity-log';

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Read-modify-write against storage so entries from other pages are never overwritten.
export function recordActivity(entry: ActivityEntry): ActivityEntry[] {
  const storage = browserStorage();
  const next = appendEntry(loadActivity(storage), entry);
  saveActivity(storage, next);
  return next;
}

// `log` is null until the browser has been read, so pages render nothing stale on the server.
export function useActivityLog() {
  const [log, setLog] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    setLog(loadActivity(browserStorage()));
  }, []);

  const record = useCallback((entry: ActivityEntry) => setLog(recordActivity(entry)), []);

  return { log, record };
}
