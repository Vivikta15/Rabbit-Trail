'use client';

import { EventName, shouldTrack } from '../lib/analytics/events';
import { createTracker } from '../lib/analytics/tracker';
import { localDateString } from '../lib/habit/activity-log';

type Tracker = ReturnType<typeof createTracker>;
let tracker: Tracker | null = null;

function send(event: unknown) {
  try {
    void fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event), keepalive: true }).catch(() => {});
  } catch {
    // Counting must never break the page.
  }
}

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Counts that this browser reached a step. Anonymous, once per step per day, and silent if the reader asked not to be tracked.
export function trackEvent(name: EventName): void {
  if (typeof window === 'undefined') return;
  if (!tracker) {
    const nav = window.navigator as Navigator & { globalPrivacyControl?: boolean };
    tracker = createTracker({
      storage: browserStorage(),
      send,
      search: window.location.search,
      today: localDateString(),
      allowed: shouldTrack({ doNotTrack: nav.doNotTrack, globalPrivacyControl: nav.globalPrivacyControl }),
      newId: () => window.crypto.randomUUID(),
    });
  }
  tracker.track(name);
}
