const test = require('node:test');
const assert = require('node:assert/strict');

const { VERIFIED_STORIES } = require('../dist/data/stories.js');
const { ARCHETYPES } = require('../dist/data/archetypes.js');
const { renderPersonalizedStory } = require('../dist/lib/llm/rewrite-engine.js');

const story = VERIFIED_STORIES[0];

test('Fact Preservation - locked claims and citations survive every archetype', () => {
  for (const id of Object.keys(ARCHETYPES)) {
    const result = renderPersonalizedStory(story, id);
    assert.deepEqual(result.facts, story.facts, `facts changed for ${id}`);
    assert.ok(result.facts.every((f) => f.sourceUrl && f.sourceTitle), `missing citation for ${id}`);
  }
});

test('Persona Adaptation - detective and cartographer get different hook and framing', () => {
  const detective = renderPersonalizedStory(story, 'detective');
  const cartographer = renderPersonalizedStory(story, 'cartographer');

  assert.equal(detective.hook, story.presentationVariants.detective.hook);
  assert.equal(cartographer.hook, story.presentationVariants.cartographer.hook);
  assert.notEqual(detective.hook, cartographer.hook);
  assert.notEqual(detective.framing, cartographer.framing);
  assert.match(detective.headline, /Detective/);
  assert.match(cartographer.headline, /Cartographer/);
});

test('Counter-Argument - counter-argument and unprovable boundary are separate fields', () => {
  const result = renderPersonalizedStory(story, 'magpie');

  assert.deepEqual(result.counterArgument, story.counterArgument);
  assert.equal(result.whatWeCantProve, story.whatWeCantProve);
});

test('Reading Time - estimates whole minutes from the rendered text', () => {
  const result = renderPersonalizedStory(story, 'apprentice');

  assert.ok(Number.isInteger(result.readingMinutes));
  assert.ok(result.readingMinutes >= 1 && result.readingMinutes <= 5);
});

test('Rewrite Prompt - injects locked facts verbatim and the archetype definition', () => {
  const { buildRewritePrompt } = require('../dist/lib/llm/prompts.js');
  const { system, user } = buildRewritePrompt(story, ARCHETYPES.detective);

  for (const fact of story.facts) {
    assert.ok(user.includes(fact.claim), 'claim missing from prompt');
    assert.ok(user.includes(fact.sourceUrl), 'source url missing from prompt');
  }
  assert.ok(user.includes(ARCHETYPES.detective.name));
  assert.ok(user.includes(ARCHETYPES.detective.framingPreference));
  assert.match(system, /do not (add|alter|change|remove)/i);
  assert.match(user, /counter-argument/i);
  assert.match(user, /What We Can't Prove/);
});
