import { Story } from '../../types';
import { explainStoryProblem } from './catalog';
import { assertSafeStoryId } from './story-id';

// Every storage backend refuses to write a story that readers could not safely be shown.
export function validateForSave(story: Story): void {
  assertSafeStoryId(story?.id); // first, so a hostile id is named as such rather than as a generic shape problem
  const problem = explainStoryProblem(story);
  if (problem) throw new Error(`Refusing to save an invalid story: ${problem}.`);
}
