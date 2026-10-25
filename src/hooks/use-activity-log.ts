'use client';

import { useCallback, useEffect, useState } from 'react';
import { LOCAL_CHANGE_EVENT, SYNCED_EVENT } from '../lib/accounts/local-state';
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
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  return next;
}

// `log` is null until the browser has been read, so pages render nothing stale on the server.
export function useActivityLog() {
  const [log, setLog] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    const read = () => setLog(loadActivity(browserStorage()));
    read();
    // A sign-in sync can add history from another device.
    window.addEventListener(SYNCED_EVENT, read);
    return () => window.removeEventListener(SYNCED_EVENT, read);
  }, []);

  const record = useCallback((entry: ActivityEntry) => setLog(recordActivity(entry)), []);

  return { log, record };
}
