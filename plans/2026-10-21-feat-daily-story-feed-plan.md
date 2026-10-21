---
title: Daily story feed and generation pipeline - Plan
type: feat
date: 2026-10-21
origin: plans/2026-10-16-1800-feat-rabbit-trail-mvp-plan.md
execution: code
---

## Goal

Today the app has one hardcoded story and no feed. Make the daily story real: a pipeline that produces new
verified stories automatically, and a feed that picks each reader's story by following their trail
("rabbit hole") rather than showing one fixed piece.

## Settled decisions (from the user, this session)

- **Automated pipeline first** (no human editor), matching MVP KD1: facts are pinned to a cited source and the
  model only adapts presentation.
- **Follows your trail:** the story shown for a day is chosen from topics connected to what the reader has
  already read; a new reader starts from the first unread story.

## Design

**Sources.** Wikipedia (encyclopedic, R5). A page is fetched as plain text with its revision id and its outbound
links. The links are the rabbit-hole graph: a story's `relatedTopics` are the pages it links to.

**Generation (server-side, CLI).** For a chosen topic page the model returns one story as JSON: a person and one
pivotal decision, 3+ facts, a counter-argument, a "What We Can't Prove" boundary, and six archetype
presentation variants. Every fact and the counter-argument must carry a verbatim `evidenceQuote` from the page.
The model may decline a page (`suitable: false`).

**Verification gate (nothing is published without passing).**
1. Deterministic: every `evidenceQuote` must appear in the fetched page text (whitespace/quote-normalized), and
   every fact must have one.
2. Judge pass (second model call): each claim is supported by its quote, and the presentation variants add no
   new factual claims. Any failure rejects the story.
Limits to state honestly: the judge is a model, not proof; it reduces, not removes, the chance of a wrong claim.

**Topic frontier.** Next topic = the page linked from the most existing stories that has no story yet and was
not rejected. Cheap pre-filter drops lists, bare years and similar.

**Catalog.** Stories live as JSON in `content/stories/` (override with `STORIES_DIR`); the existing Venice story
stays as the built-in seed. Loaded server-side only.

**Feed (`/today`).** Pure `pickDailyStory(index, readStoryIds, today)`:
- finished a story today -> that story (stable on reload);
- else the unread story most connected to what was read (a read story links to it, or it links to a read
  story), ties broken by oldest first; a reader with no history gets the oldest unread story;
- none unread -> a friendly "you've read everything, new stories arrive daily" state.
The reader's archetype is now saved when the quiz completes so `/today` can open the story in their style.

## Units

- **F1 Catalog and feed:** story model (`topic`, `era`, `source`, `relatedTopics`, `evidenceQuote`), catalog
  loader, `pickDailyStory`, saved archetype, `/today`, nav and quiz links.
- **F2 Pipeline:** Wikipedia fetch, prompt and parse, verification gate, frontier, publish, Anthropic client,
  `npm run stories:generate`.

## Verification

- Unit tests (node --test) with a fake model client and a fake fetch for everything deterministic.
- Real Wikipedia fetch run once by hand.
- Browser check of `/today` against throwaway fixture stories in a temp `STORIES_DIR` (not committed).
- The live Claude call needs the user's `ANTHROPIC_API_KEY` and is NOT verified by the author.

## Out of scope

Scheduling the daily run (cron / GitHub Action / Vercel cron), server-side persistence of reader state,
non-English sources, images.
