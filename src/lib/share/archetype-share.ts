import { ArchetypeId } from '../../types';
import { ARCHETYPES } from '../../data/archetypes';

export function buildArchetypeSharePath(archetypeId: ArchetypeId): string {
  return `/onboarding?archetype=${encodeURIComponent(archetypeId)}`;
}

export function parseSharedArchetype(value: string | null | undefined): ArchetypeId | null {
  if (!value || !Object.prototype.hasOwnProperty.call(ARCHETYPES, value)) {
    return null;
  }
  return value as ArchetypeId;
}
