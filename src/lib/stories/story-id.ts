// A story id becomes a file name and part of a URL, so it must never be able to point outside a folder or
// smuggle in a path or query. Every storage backend checks it before writing.
export const SAFE_STORY_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

export function assertSafeStoryId(id: string): void {
  if (typeof id !== 'string' || !SAFE_STORY_ID.test(id)) {
    throw new Error(`Unsafe story id "${String(id).slice(0, 60)}": use lowercase letters, digits and dashes only.`);
  }
}
