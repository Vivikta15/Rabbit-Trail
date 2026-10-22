// Query-string input for the public API routes: trimmed, non-empty, bounded, and free of control characters.
// Returns null for anything unusable so a route answers with a clean 400 instead of working on junk.
export function cleanParam(value: string | null, maxLength: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}
