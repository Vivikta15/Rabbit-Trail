-- Rabbit Trail: what a signed-in reader has saved (reading history, reading style, trial start).
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Run 0001_stories.sql first.
-- It is safe to run again; nothing is dropped or overwritten.
--
-- Access model, as for the stories tables: row-level security is on and there is NO policy, so the public key and
-- signed-in readers can read and write nothing directly. Only the server (using the secret service key) touches this
-- table, after it has checked who is asking. `subscribed` is written only by the server, never by a reader's browser.

create table if not exists public.reader_state (
  -- The reader's Supabase Auth id. Deleting the account deletes this row too.
  user_id          uuid primary key references auth.users (id) on delete cascade,
  archetype        text check (archetype is null or archetype ~ '^[a-z][a-z-]{1,29}$'),
  trial_start_date date,
  -- The reading history: a JSON array of activity entries, capped so one account cannot grow without limit.
  activity         jsonb not null default '[]'::jsonb check (jsonb_typeof(activity) = 'array' and jsonb_array_length(activity) <= 5000),
  subscribed       boolean not null default false,
  updated_at       timestamptz not null default now()
);

alter table public.reader_state enable row level security;

revoke all on public.reader_state from anon, authenticated;
