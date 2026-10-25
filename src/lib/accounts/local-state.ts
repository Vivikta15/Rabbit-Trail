// Moves a reader's data between this browser's storage and a ReaderState, so the two can be merged when they sign in.
import { loadActivity, saveActivity, StorageLike } from '../habit/activity-log';
import { loadProfileArchetype, saveProfileArchetype } from '../profile/profile-store';
import { loadSubscription, saveSubscription, startTrialIfNeeded } from '../subscription/subscription-store';
import { ReaderState } from './reader-state';

// Sent on the window whenever something worth saving changes in this browser (a story finished, a style chosen).
export const LOCAL_CHANGE_EVENT = 'rabbit:local-change';
// Sent after a sync changed what this browser holds, so open pages can re-read it.
export const SYNCED_EVENT = 'rabbit:synced';

export function readLocalState(storage: StorageLike | null): ReaderState {
  return {
    archetype: loadProfileArchetype(storage),
    trialStartDate: loadSubscription(storage)?.trialStartDate ?? null,
    activity: loadActivity(storage),
  };
}

// Writes a merged copy back. It only adds: an empty field never erases what is here, and the trial start only moves
// earlier. Whether this browser thinks it has subscribed is not touched; that is a separate matter.
export function writeLocalState(storage: StorageLike | null, merged: ReaderState): void {
  if (!storage) return;

  saveActivity(storage, merged.activity.length > 0 ? merged.activity : loadActivity(storage));

  if (merged.archetype) {
    const valid = merged.archetype as Parameters<typeof saveProfileArchetype>[1];
    saveProfileArchetype(storage, valid);
  }

  if (merged.trialStartDate) {
    const existing = loadSubscription(storage);
    const base = startTrialIfNeeded(existing, merged.trialStartDate);
    const earliest = [base.trialStartDate, merged.trialStartDate].sort()[0];
    if (!existing || earliest !== existing.trialStartDate) saveSubscription(storage, { ...base, trialStartDate: earliest });
  }
}
