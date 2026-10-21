'use client';

import { ArchetypeId } from '../types';
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
}
