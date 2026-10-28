// The browser side of counting. Pure apart from what it is handed (storage, a send function), so it can be tested.
import { EventInput, EventName, sourceFromSearch } from './events';

export const VISITOR_KEY = 'rabbit-trail:visitor:v1';
export const SOURCE_KEY = 'rabbit-trail:source:v1';
export const SENT_KEY = 'rabbit-trail:sent:v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface TrackerOptions {
  storage: StorageLike | null;
  send: (event: EventInput) => void;
  search: string;
  today: string;
  allowed: boolean;
  newId: () => string;
}

function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Blocked or full storage: counting still works for this page, just without remembering.
  }
}

export function createTracker({ storage, send, search, today, allowed, newId }: TrackerOptions) {
  let pageVisitor: string | null = null;

  return {
    track(name: EventName): void {
      // A reader who asked not to be tracked is not counted, and nothing is stored on their device.
      if (!allowed) return;
      try {
        let visitor = read(storage, VISITOR_KEY) ?? pageVisitor;
        if (!visitor) {
          visitor = newId();
          write(storage, VISITOR_KEY, visitor);
        }
        pageVisitor = visitor;

        // The first channel to bring this person is the one that counts.
        let source = read(storage, SOURCE_KEY);
        if (!source) {
          source = sourceFromSearch(search);
          write(storage, SOURCE_KEY, source);
        }

        // Each step is sent once a day from a browser; the server also ignores repeats.
        let sent: { day?: string; names?: string[] } = {};
        try {
          sent = JSON.parse(read(storage, SENT_KEY) ?? '{}') ?? {};
        } catch {
          sent = {};
        }
        const names = sent.day === today && Array.isArray(sent.names) ? sent.names : [];
        if (names.includes(name)) return;
        write(storage, SENT_KEY, JSON.stringify({ day: today, names: [...names, name] }));

        send({ name, visitor, source });
      } catch {
        // Counting must never break the page.
      }
    },
  };
}
