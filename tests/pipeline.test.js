const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseWikiResponse, fetchPage } = require('../dist/lib/pipeline/wikipedia.js');
const { isCandidateTopic, chooseFrontierTopic, rankTopicsByMention } = require('../dist/lib/pipeline/topics.js');
const { buildGenerationPrompt, parseGeneratedStory } = require('../dist/lib/pipeline/generate.js');
const { normalizeForMatch, checkQuotes, verifyStory } = require('../dist/lib/pipeline/verify.js');
const { createAnthropicClient } = require('../dist/lib/pipeline/llm-client.js');
const { publishStory, recordRejection, loadRejected } = require('../dist/lib/pipeline/publish.js');
const { generateNextStory } = require('../dist/lib/pipeline/run.js');
const { loadCatalog } = require('../dist/lib/stories/catalog.js');
const { VERIFIED_STORIES } = require('../dist/data/stories.js');
const { ARCHETYPES } = require('../dist/data/archetypes.js');

// ---- fixtures -------------------------------------------------------------------------------

const Q1 = 'In 1571 the allied fleet destroyed most of the Ottoman navy near the Gulf of Patras.';
const Q2 = 'Don John of Austria commanded the Holy League fleet against the advice of several captains.';
const Q3 = 'The Venetian galleasses opened the battle by breaking the Ottoman line with heavy cannon fire.';
const Q4 = 'Historians still dispute how much the victory changed the balance of power in the Mediterranean.';
const PAGE_TEXT = [Q1, Q2, Q3, Q4, 'Many other sentences follow here to make the article look like an article.'].join('\n\n');

const page = (over = {}) => ({
  title: 'Battle of Lepanto (1571)',
  url: 'https://en.wikipedia.org/wiki/Battle_of_Lepanto_(1571)',
  revisionId: 12345,
  text: PAGE_TEXT,
  links: ['Don John of Austria', 'Miguel de Cervantes', 'List of battles', 'ISBN (identifier)', 'Galleass'],
  ...over,
});

const variants = () =>
  Object.fromEntries(
    Object.keys(ARCHETYPES).map((id) => [
      id,
      { hook: `${id} hook`, narrativePacing: `${id} pacing`, introFraming: `${id} framing`, analogy: `${id} analogy` },
    ]),
  );

const draft = (over = {}) => ({
  suitable: true,
  title: 'The Gamble at Lepanto',
  protagonist: 'Don John of Austria',
  topic: 'Naval Warfare',
  era: '16th century',
  decisionContext: 'In 1571 a young commander had to decide whether to engage the Ottoman fleet.',
  facts: [
    { claim: 'The allied fleet destroyed most of the Ottoman navy in 1571.', evidenceQuote: Q1 },
    { claim: 'Don John commanded against the advice of several captains.', evidenceQuote: Q2 },
    { claim: 'Venetian galleasses broke the Ottoman line first.', evidenceQuote: Q3 },
  ],
  counterArgument: {
    thesis: 'The victory changed less than legend claims.',
    evidence: 'Historians still dispute the strategic effect.',
    unresolvedPoints: 'How much power actually shifted is contested.',
    evidenceQuote: Q4,
  },
  whatWeCantProve: 'Whether the outcome would have differed had the captains been obeyed.',
  presentationVariants: variants(),
  ...over,
});

// Three facts plus the counter-argument: four claims the judge must each find supported.
const judgeOk = (n = 4) => ({
  claims: Array.from({ length: n }, (_, i) => ({ index: i, supported: true, reason: 'quote says so' })),
  variantsAddNewFacts: false,
});

// A fake model: answers by inspecting which kind of prompt it received.
function fakeLlm({ generation, judge, onCall } = {}) {
  const calls = [];
  return {
    calls,
    async complete(system, user) {
      calls.push({ system, user });
      if (onCall) onCall(system, user);
      const isJudge = /verif|judge|support/i.test(system) && /CLAIMS TO CHECK/.test(user);
      const reply = isJudge ? judge : generation;
      const value = typeof reply === 'function' ? reply(calls.length) : reply;
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  };
}

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-trail-pipeline-'));

// ---- wikipedia -------------------------------------------------------------------------------

const apiPage = (over = {}) => ({
  pageid: 1,
  ns: 0,
  title: 'Battle of Lepanto (1571)',
  fullurl: 'https://en.wikipedia.org/wiki/Battle_of_Lepanto_(1571)',
  extract: PAGE_TEXT,
  revisions: [{ revid: 12345 }],
  links: [{ title: 'Galleass' }, { title: 'Miguel de Cervantes' }],
  ...over,
});

test('Wikipedia - parses title, url, revision, text and links', () => {
  const result = parseWikiResponse({ query: { pages: { 1: apiPage() } } });

  assert.deepEqual(result, {
    title: 'Battle of Lepanto (1571)',
    url: 'https://en.wikipedia.org/wiki/Battle_of_Lepanto_(1571)',
    revisionId: 12345,
    text: PAGE_TEXT,
    links: ['Galleass', 'Miguel de Cervantes'],
  });
});

test('Wikipedia - a missing page or a disambiguation page is not usable', () => {
  assert.equal(parseWikiResponse({ query: { pages: { '-1': { title: 'Nope', missing: '' } } } }), null);
  assert.equal(parseWikiResponse({ query: { pages: { 1: apiPage({ pageprops: { disambiguation: '' } }) } } }), null);
  assert.equal(parseWikiResponse({ query: { pages: { 1: apiPage({ extract: '   ' }) } } }), null);
  assert.equal(parseWikiResponse({}), null);
});

test('Wikipedia - fetchPage follows continuation for long link lists and identifies itself', async () => {
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url, headers: init && init.headers });
    const first = requests.length === 1;
    return {
      ok: true,
      status: 200,
      json: async () =>
        first
          ? { continue: { plcontinue: 'abc', continue: '||' }, query: { pages: { 1: apiPage({ links: [{ title: 'Galleass' }] }) } } }
          : { query: { pages: { 1: { pageid: 1, ns: 0, title: 'Battle of Lepanto (1571)', links: [{ title: 'Miguel de Cervantes' }] } } } },
    };
  };

  const result = await fetchPage('Battle of Lepanto (1571)', fakeFetch);

  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /plcontinue=abc/);
  assert.match(requests[0].headers['User-Agent'], /RabbitTrail/);
  assert.deepEqual(result.links, ['Galleass', 'Miguel de Cervantes']);
  assert.equal(result.text, PAGE_TEXT);
});

test('Wikipedia - a failed request throws a clear error', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });

  await assert.rejects(() => fetchPage('X', fakeFetch, { retry: { retries: 0 } }), /503/);
});

// ---- topics ----------------------------------------------------------------------------------

test('Topics - filters out lists, identifiers, bare years and other non-story pages', () => {
  for (const bad of ['List of battles', 'ISBN (identifier)', 'Doi (identifier)', '1571', 'Timeline of Venice', 'Index of Venice-related articles', 'Wayback Machine', 'Geographic coordinate system', 'Category:Wars']) {
    assert.equal(isCandidateTopic(bad), false, bad);
  }
  for (const good of ['Battle of Lepanto (1571)', 'Galileo Galilei', 'War of the League of Cambrai']) {
    assert.equal(isCandidateTopic(good), true, good);
  }
});

const story = (id, title, related) => ({ id, date: '2026-10-01', source: { title }, relatedTopics: related });

test('Topics - the frontier is the uncovered page linked from the most stories', () => {
  const stories = [
    story('a', 'A', ['X', 'Y', 'Z']),
    story('b', 'B', ['Y', 'Z']),
    story('c', 'C', ['Z']),
  ];

  assert.equal(chooseFrontierTopic(stories, new Set()), 'Z');
});

test('Topics - skips covered, rejected and filtered topics, and ties go to the first seen', () => {
  const stories = [story('a', 'A', ['B', 'List of things', 'Rejected one', 'First', 'Second'])];
  const covered = story('b', 'B', []);

  assert.equal(chooseFrontierTopic([...stories, covered], new Set(['rejected one'])), 'First');
  assert.equal(chooseFrontierTopic([story('a', 'A', ['B']), covered], new Set()), null);
  assert.equal(chooseFrontierTopic([], new Set()), null);
});

test('Topics - onward links are ranked by when the article first mentions them, not alphabetically', () => {
  const text = 'The war began. Zeta Province fell early. Later Alpha Island was taken, and Gamma is also named.';
  const links = ['Alpha Island', 'Gamma', 'Never Mentioned', 'List of things', 'Zeta Province'];

  assert.deepEqual(rankTopicsByMention(links, text), ['Zeta Province', 'Alpha Island', 'Gamma', 'Never Mentioned']);
});

test('Topics - mention ranking is case-insensitive and keeps unmentioned links, in order, after mentioned ones', () => {
  assert.deepEqual(rankTopicsByMention(['B page', 'A page', 'C page'], 'we saw the c PAGE here'), ['C page', 'B page', 'A page']);
});

// ---- generation ------------------------------------------------------------------------------

test('Generation prompt - gives the model only the source and the quoting rules', () => {
  const { system, user } = buildGenerationPrompt(page());

  assert.match(system, /only (from )?the (supplied )?source/i);
  assert.match(system, /verbatim/i);
  assert.match(system, /suitable/);
  assert.ok(user.includes(Q1), 'the source text must be in the prompt');
  assert.ok(user.includes('Battle of Lepanto (1571)'));
  for (const id of Object.keys(ARCHETYPES)) assert.ok(user.includes(id) || system.includes(id), `missing archetype ${id}`);
});

test('Generation - builds a complete unverified story from a valid draft, including fenced JSON', () => {
  const raw = '```json\n' + JSON.stringify(draft()) + '\n```';
  const result = parseGeneratedStory(raw, page(), '2026-10-22');

  assert.equal(result.ok, true);
  const s = result.story;
  assert.equal(s.id, 'story-battle-of-lepanto-1571');
  assert.equal(s.date, '2026-10-22');
  assert.equal(s.source.revisionId, 12345);
  // Filtered to story-worthy pages and ranked by first mention: Don John (sentence 2) and Galleass (sentence 3)
  // are named in the article; Cervantes is linked but never named, so he comes last.
  assert.deepEqual(s.relatedTopics, ['Don John of Austria', 'Galleass', 'Miguel de Cervantes']);
  assert.ok(s.facts.every((f) => f.isVerified === false), 'nothing is verified until the gate passes');
  assert.ok(s.facts.every((f) => f.sourceUrl.includes('oldid=12345')), 'facts cite the exact revision');
  assert.equal(s.facts[0].evidenceQuote, Q1);
  assert.equal(s.counterArgument.evidenceQuote, Q4);
});

test('Generation - the onward-link cap keeps the pages the article actually mentions', () => {
  // 60 alphabetical filler links, plus one real mention that sorts after all of them.
  const filler = Array.from({ length: 60 }, (_, i) => `Aaa filler ${String(i).padStart(2, '0')}`);
  const withMention = page({ links: [...filler, 'Zzz Galleass Fleet'], text: `${PAGE_TEXT}\n\nThe Zzz Galleass Fleet arrived.` });
  const result = parseGeneratedStory(JSON.stringify(draft()), withMention, '2026-10-22');

  assert.equal(result.ok, true);
  assert.equal(result.story.relatedTopics.length, 40);
  assert.equal(result.story.relatedTopics[0], 'Zzz Galleass Fleet', 'a mentioned page must beat alphabetical filler');
});

test('Generation - a model that declines the page is reported as declined, with its reason', () => {
  const result = parseGeneratedStory(JSON.stringify({ suitable: false, reason: 'No single decision to center on.' }), page(), '2026-10-22');

  assert.deepEqual(result, { ok: false, declined: true, reason: 'No single decision to center on.' });
});

test('Generation - malformed or incomplete output is rejected, never repaired', () => {
  const cases = {
    'not json': 'Sure! Here is a story...',
    'no facts': JSON.stringify(draft({ facts: [] })),
    'two facts': JSON.stringify(draft({ facts: draft().facts.slice(0, 2) })),
    'fact without quote': JSON.stringify(draft({ facts: [{ claim: 'x', evidenceQuote: '' }, ...draft().facts.slice(1)] })),
    'counter-argument without quote': JSON.stringify(draft({ counterArgument: { ...draft().counterArgument, evidenceQuote: '' } })),
    'missing archetype variant': JSON.stringify(draft({ presentationVariants: Object.fromEntries(Object.entries(variants()).filter(([k]) => k !== 'magpie')) })),
  };

  for (const [name, raw] of Object.entries(cases)) {
    const result = parseGeneratedStory(raw, page(), '2026-10-22');
    assert.equal(result.ok, false, name);
    assert.equal(result.declined, undefined, name);
    assert.ok(result.reason, name);
  }
});

// ---- verification ----------------------------------------------------------------------------

test('Verify - normalization ignores case, whitespace, curly quotes and dash styles', () => {
  assert.equal(normalizeForMatch('  The “Holy League”\n  fleet —  won. '), normalizeForMatch('the "holy league" fleet - won.'));
});

function builtStory(over) {
  const result = parseGeneratedStory(JSON.stringify(draft(over)), page(), '2026-10-22');
  assert.equal(result.ok, true);
  return result.story;
}

test('Verify - every quote must appear in the source text', () => {
  assert.deepEqual(checkQuotes(builtStory(), PAGE_TEXT), []);

  const reworded = builtStory({
    facts: [{ claim: 'c', evidenceQuote: 'In 1571 the allied fleet wiped out the Ottoman navy near the Gulf of Patras.' }, ...draft().facts.slice(1)],
  });
  const failures = checkQuotes(reworded, PAGE_TEXT);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /not found in the source/i);
});

test('Verify - a quote too short to prove anything is rejected', () => {
  const trivial = builtStory({ facts: [{ claim: 'c', evidenceQuote: 'the Ottoman' }, ...draft().facts.slice(1)] });

  assert.match(checkQuotes(trivial, PAGE_TEXT).join(' '), /too short/i);
});

test('Verify - the judge must find every claim supported and the variants fact-free', async () => {
  const ok = await verifyStory(builtStory(), page(), fakeLlm({ judge: judgeOk() }));
  assert.deepEqual(ok, { ok: true, failures: [] });

  const unsupported = judgeOk();
  unsupported.claims[1] = { index: 1, supported: false, reason: 'the quote says the opposite' };
  const r1 = await verifyStory(builtStory(), page(), fakeLlm({ judge: unsupported }));
  assert.equal(r1.ok, false);
  assert.match(r1.failures.join(' '), /claim 2/i);

  const r2 = await verifyStory(builtStory(), page(), fakeLlm({ judge: { ...judgeOk(), variantsAddNewFacts: true } }));
  assert.equal(r2.ok, false);
  assert.match(r2.failures.join(' '), /variants/i);
});

test('Verify - fails closed when the judge answers badly or skips a claim', async () => {
  for (const bad of ['not json at all', { claims: [] }, { claims: [{ index: 0, supported: true }], variantsAddNewFacts: false }, { variantsAddNewFacts: false }]) {
    const result = await verifyStory(builtStory(), page(), fakeLlm({ judge: bad }));
    assert.equal(result.ok, false, JSON.stringify(bad));
  }
});

test('Verify - a story that fails the quote check never reaches the judge', async () => {
  const llm = fakeLlm({ judge: judgeOk() });
  const bad = builtStory({ facts: [{ claim: 'c', evidenceQuote: 'A sentence that is nowhere in the source article at all.' }, ...draft().facts.slice(1)] });

  const result = await verifyStory(bad, page(), llm);

  assert.equal(result.ok, false);
  assert.equal(llm.calls.length, 0, 'no model call should be spent on a story that already failed');
});

// ---- llm client ------------------------------------------------------------------------------

test('LLM client - sends an authenticated Messages API request and returns the text', async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'hello' }] }), text: async () => '' };
  };
  const client = createAnthropicClient({ apiKey: 'sk-test-secret', model: 'claude-sonnet-5-5', fetchImpl: fakeFetch });

  const out = await client.complete('SYSTEM', 'USER');

  assert.equal(out, 'hello');
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['x-api-key'], 'sk-test-secret');
  assert.ok(seen.init.headers['anthropic-version']);
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.system, 'SYSTEM');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'USER' }]);
  assert.ok(body.max_tokens > 1000);
});

test('LLM client - an API error becomes a clear error that never includes the key', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => '{"error":{"message":"invalid x-api-key"}}' });
  const client = createAnthropicClient({ apiKey: 'sk-test-secret', model: 'm', fetchImpl: fakeFetch });

  await assert.rejects(
    () => client.complete('s', 'u'),
    (err) => /401/.test(err.message) && !err.message.includes('sk-test-secret'),
  );
});

test('LLM client - refuses to start without a key', () => {
  assert.throws(() => createAnthropicClient({ apiKey: '', model: 'm' }), /ANTHROPIC_API_KEY/);
});

// ---- publish ---------------------------------------------------------------------------------

test('Publish - writes a story the catalog can read, and refuses to overwrite one', () => {
  const dir = tempDir();
  const s = builtStory();

  const file = publishStory(s, dir);

  assert.ok(fs.existsSync(file));
  assert.equal(loadCatalog(dir).some((x) => x.id === s.id), true);
  assert.throws(() => publishStory(s, dir), /already exists/i);
});

test('Publish - remembers rejected topics, one line each', () => {
  const dir = tempDir();

  assert.deepEqual([...loadRejected(dir)], []);
  recordRejection(dir, 'Boring Page', 'no single decision', '2026-10-22');
  recordRejection(dir, 'Another Page', 'disambiguation', '2026-10-22');

  assert.deepEqual([...loadRejected(dir)].sort(), ['another page', 'boring page']);
});

// ---- orchestration ---------------------------------------------------------------------------

function fakeWiki(pages) {
  const asked = [];
  return { asked, fetchPage: async (title) => { asked.push(title); return pages[title] ?? null; } };
}

// The built-in seed story is always in the catalog and links to its own topics. To control which topics the
// frontier offers, add an older clone story (so it sorts first and wins ties) whose links are not the seed's.
function seedCatalogDir(related) {
  const dir = tempDir();
  const clone = structuredClone(VERIFIED_STORIES[0]);
  Object.assign(clone, {
    id: 'story-seed-clone',
    date: '2026-10-01',
    source: { title: 'Seed Clone', url: 'https://en.wikipedia.org/wiki/Seed_Clone' },
    relatedTopics: related,
  });
  fs.writeFileSync(path.join(dir, 'seed-clone.json'), JSON.stringify(clone));
  return dir;
}

const goodPage = () => page({ title: 'Good Page', url: 'https://en.wikipedia.org/wiki/Good_Page' });

test('Run - publishes the first topic that passes generation and verification', async () => {
  const dir = tempDir();
  const wiki = fakeWiki({ 'Battle of Lepanto (1571)': page() });
  const llm = fakeLlm({ generation: draft(), judge: judgeOk() });
  // The seed links to Lepanto, so it is the frontier topic with an empty generated directory.
  const result = await generateNextStory({ dir, today: '2026-10-22', wiki, llm, maxAttempts: 3 });

  assert.equal(result.status, 'published');
  assert.equal(result.id, 'story-battle-of-lepanto-1571');
  const published = loadCatalog(dir).find((s) => s.id === result.id);
  assert.ok(published, 'the new story is in the catalog');
  assert.ok(published.facts.every((f) => f.isVerified === true), 'verified only after the gate passed');
  assert.equal(wiki.asked[0], VERIFIED_STORIES[0].relatedTopics[0]);
});

test('Run - a topic that redirects to the published page is remembered so it is not requested again', async () => {
  const dir = seedCatalogDir(['Good Page (alias)']);
  const wiki = fakeWiki({ 'Good Page (alias)': goodPage() }); // the alias resolves to the page titled "Good Page"
  const llm = fakeLlm({ generation: draft(), judge: judgeOk() });

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki, llm, maxAttempts: 1 });

  assert.equal(result.status, 'published');
  assert.ok(loadRejected(dir).has('good page (alias)'));
});

test('Run - skips a page the model declines, remembers it, and tries the next topic', async () => {
  const dir = seedCatalogDir(['Dull Page', 'Good Page']);
  const wiki = fakeWiki({ 'Dull Page': page({ title: 'Dull Page', url: 'https://en.wikipedia.org/wiki/Dull_Page' }), 'Good Page': goodPage() });
  const llm = fakeLlm({
    generation: (n) => (n === 1 ? { suitable: false, reason: 'No decision to center on.' } : draft()),
    judge: judgeOk(),
  });

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki, llm, maxAttempts: 5 });

  assert.equal(result.status, 'published');
  assert.equal(result.id, 'story-good-page');
  assert.deepEqual(wiki.asked, ['Dull Page', 'Good Page']);
  assert.ok(loadRejected(dir).has('dull page'));
});

test('Run - a story that fails verification is not published and the topic is not blacklisted', async () => {
  const dir = seedCatalogDir(['Good Page']);
  const wiki = fakeWiki({ 'Good Page': goodPage() });
  const unsupported = judgeOk();
  unsupported.claims[0].supported = false;
  const llm = fakeLlm({ generation: draft(), judge: unsupported });

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki, llm, maxAttempts: 2 });

  assert.equal(result.status, 'failed');
  assert.equal(loadCatalog(dir).some((s) => s.id === 'story-good-page'), false, 'nothing unverified may be published');
  assert.equal(loadRejected(dir).has('good page'), false, 'a verification miss should not permanently drop a good topic');
  assert.match(result.reasons.join(' '), /claim 1/i);
});

test('Run - a page that redirects to an already covered story is not published twice', async () => {
  const dir = seedCatalogDir(['Alias Of Seed']);
  // The requested title resolves to a page that is already a story in the catalog (the seed's own page).
  const wiki = fakeWiki({ 'Alias Of Seed': page({ title: VERIFIED_STORIES[0].source.title }) });
  const llm = fakeLlm({ generation: draft(), judge: judgeOk() });

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki, llm, maxAttempts: 1 });

  assert.equal(result.status, 'failed');
  assert.equal(llm.calls.length, 0, 'no model call for a story we already have');
  assert.ok(loadRejected(dir).has('alias of seed'));
});

test('Run - reports when there is no topic left to follow', async () => {
  const dir = seedCatalogDir([]);
  // Cover every seed topic too, so the frontier is empty.
  for (const t of VERIFIED_STORIES[0].relatedTopics) recordRejection(dir, t, 'test', '2026-10-22');

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki: fakeWiki({}), llm: fakeLlm(), maxAttempts: 3 });

  assert.equal(result.status, 'no-topic');
});

test('Run - a missing or unusable page is remembered and skipped', async () => {
  const dir = seedCatalogDir(['Ghost Page', 'Good Page']);
  const wiki = fakeWiki({ 'Good Page': goodPage() });
  const llm = fakeLlm({ generation: draft(), judge: judgeOk() });

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki, llm, maxAttempts: 5 });

  assert.equal(result.status, 'published');
  assert.ok(loadRejected(dir).has('ghost page'));
});

test('Run - gives up after the attempt limit without publishing', async () => {
  const dir = seedCatalogDir(['A One', 'B Two', 'C Three']);
  const wiki = fakeWiki({});
  const llm = fakeLlm({ generation: draft(), judge: judgeOk() });

  const result = await generateNextStory({ dir, today: '2026-10-22', wiki, llm, maxAttempts: 2 });

  assert.equal(result.status, 'failed');
  assert.equal(wiki.asked.length, 2);
});
