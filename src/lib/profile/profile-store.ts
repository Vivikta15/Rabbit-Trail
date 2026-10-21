import { ArchetypeId } from '../../types';
import { parseSharedArchetype } from '../share/archetype-share';

export const PROFILE_STORAGE_KEY = 'rabbit-trail:profile:v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadProfileArchetype(storage: StorageLike | null): ArchetypeId | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(PROFILE_STORAGE_KEY) ?? 'null');
    return parseSharedArchetype(parsed?.archetypeId);
  } catch {
    return null;
  }
}

export function saveProfileArchetype(storage: StorageLike | null, archetypeId: ArchetypeId): void {
  if (!storage) return;
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ archetypeId }));
  } catch {
    // Storage can be full or blocked; the reader just gets the default style next time.
  }
}
