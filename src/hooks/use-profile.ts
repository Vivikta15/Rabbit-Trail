'use client';

import { ArchetypeId } from '../types';
import { LOCAL_CHANGE_EVENT } from '../lib/accounts/local-state';
import { loadProfileArchetype, saveProfileArchetype } from '../lib/profile/profile-store';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadArchetype(): ArchetypeId | null {
  return loadProfileArchetype(browserStorage());
}

export function saveArchetype(archetypeId: ArchetypeId): void {
  saveProfileArchetype(browserStorage(), archetypeId);
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}
