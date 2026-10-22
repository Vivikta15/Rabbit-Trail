---
title: Deploy on Vercel with Supabase storage - Plan
type: feat
date: 2026-10-22
origin: plans/2026-10-21-feat-daily-story-feed-plan.md
execution: code
---

## Goal

Run the app on Vercel with stories stored in Supabase, and generate a new story every day automatically.
Vercel's servers cannot keep files, so the file-based story store only works on a developer's machine.

## Settled decision (from the user)

Vercel for the app, Supabase for the database. (Firebase was the alternative offered and not chosen.)

## Scope of this plan (phase 1) and what is deferred

In: stories, rejected topics, the run lock and a run log move to Supabase Postgres; the app reads them there; the
generator writes them there; a daily schedule; checks and a deploy guide.
Deferred (phase 2, separate decision): reader accounts and server-side reader state (streak, trail, trial,
archetype currently live in each browser's localStorage).

## Design

**Storage interface.** One `StoryRepository` (list, save, rejected topics, lock, housekeeping, run log) with two
implementations: the existing file store (local development and tests) and Supabase. The pipeline and the pages
depend only on the interface.

**Supabase access.** Plain HTTPS calls to Supabase's REST API (PostgREST) with the service key, reusing the retry
and timeout layer. No extra dependency, and it can be tested with a fake fetch. The service key is server-only:
it is never given to the browser, and tests fail if browser code imports the database code or a key appears in a
committable file. All tables have row-level security on with no public policy, so the public (anon) key can read
nothing even if it leaks.

**Tables.** `stories` (id, date, summary columns for the feed, full story as JSON), `rejected_topics`,
`generation_lock` (one row, taken and released by atomic SQL functions, taken over after 30 minutes),
`generation_runs` (a log of each run). Created by `supabase/migrations/0001_stories.sql`.

**Safety on read.** Rows are validated with the same story check as files; a bad row is skipped and reported by the
doctor. Listing pages through results so more than 1000 stories work.

**Choosing the backend.** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` both set -> Supabase; neither -> local
files; only one -> a clear error. On Vercel (production) without Supabase the app refuses to start serving stories
instead of silently showing one story forever.

**Daily generation** runs as a GitHub Action (`stories:generate`), not a Vercel function: it takes a minute or
two, which risks Vercel's function time limit, and keeping the Anthropic key only in GitHub means the website
never holds it. It exits non-zero on outages or failures so GitHub emails the owner.

## Units

- **S1** storage interface, file backend, async catalog, pipeline moved onto the interface
- **S2** Supabase client and repository, SQL migration
- **S3** backend selection, config checks, doctor database checks, one-time import tool, CLI exit codes
- **S4** daily workflow, deploy guide, Node engine pin

## Verification

Unit tests with a fake Supabase (PostgREST responses) and the existing suites; build; browser check on the file
backend. A real Supabase project cannot be exercised until the owner creates one: `npm run doctor` then proves the
connection, tables and functions, and `npm run db:import` uploads any local stories.

## Out of scope (needs the owner)

Creating the Supabase and Vercel projects, pasting keys into their dashboards, pushing to GitHub and adding the
GitHub secrets.
