-- Rabbit Trail: launch measurement and social posting memory.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Access model, as for the other tables: row-level security on and NO policy, so the public key and signed-in readers
-- can read and write nothing directly. Only the server (secret service key) touches these tables.

-- ---------------------------------------------------------------------------------------------------------------
-- Anonymous funnel events: which step a visitor reached, and which channel sent them. A visitor is a random id made
-- in the browser; no address, device details or account is stored. One row per visitor, per step, per day, so
-- repeats cost nothing and a count of distinct visitors is a count of people.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.launch_events (
  day        date not null,
  name       text not null check (name in ('visit', 'quiz_started', 'quiz_completed', 'story_finished', 'signed_in', 'shared')),
  visitor    uuid not null,
  source     text not null default 'direct' check (source ~ '^[a-z0-9][a-z0-9_-]{0,29}$'),
  created_at timestamptz not null default now(),
  primary key (day, name, visitor)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Which story has been posted to which channel, so the twice-daily run never posts the same story twice.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.social_posts (
  story_id  text not null check (story_id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  channel   text not null check (channel in ('telegram', 'bluesky', 'discord')),
  posted_at timestamptz not null default now(),
  primary key (story_id, channel)
);

alter table public.launch_events enable row level security;
alter table public.social_posts  enable row level security;

revoke all on public.launch_events, public.social_posts from anon, authenticated;
