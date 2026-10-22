-- Rabbit Trail: stories, rejected topics, the run lock and a run log.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again; nothing is dropped or overwritten.
--
-- Access model: every table has row-level security switched on and NO policy, so the public (anon) key and signed-in
-- users can read and write nothing. Only the server, using the secret service key (which bypasses row-level
-- security), touches these tables. Never put the service key in browser code.

-- ---------------------------------------------------------------------------------------------------------------
-- Stories. The whole story is kept as JSON in `data`; the other columns are what the daily feed needs to choose a
-- story without downloading every body.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.stories (
  id             text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  date           date not null,
  title          text not null check (length(title) > 0),
  topic          text not null,
  era            text not null,
  source_title   text not null check (length(source_title) > 0),
  related_topics text[] not null default '{}',
  -- The stored story must be an object that carries this row's own id. (coalesce: a check that evaluates to NULL
  -- passes, so a story with no id at all would otherwise slip through.)
  data           jsonb not null check (jsonb_typeof(data) = 'object' and coalesce(data ->> 'id' = id, false)),
  created_at     timestamptz not null default now()
);

create index if not exists stories_date_id_idx on public.stories (date, id);

-- One story per source page, enforced here so two overlapping runs can never publish the same page twice.
create unique index if not exists stories_source_title_uniq on public.stories (lower(source_title));

-- ---------------------------------------------------------------------------------------------------------------
-- Topics that can never become a story (missing page, declined by the model, duplicate), so later runs do not pay
-- for the same dead end again.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.rejected_topics (
  title_lower text primary key,
  title       text not null,
  reason      text not null,
  date        date not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------------
-- One row at most: who is generating right now. Taken and released only through the two functions below.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.generation_lock (
  name       text primary key,
  owner      uuid not null,
  started_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------------
-- A record of every generation run: when, how it ended, and what it cost.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.generation_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null,
  finished_at  timestamptz not null,
  status       text not null,
  published_id text,
  details      jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------------------------------------------
-- Row-level security on, no policies: closed to everyone except the service key.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.stories          enable row level security;
alter table public.rejected_topics  enable row level security;
alter table public.generation_lock  enable row level security;
alter table public.generation_runs  enable row level security;

revoke all on public.stories, public.rejected_topics, public.generation_lock, public.generation_runs from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The run lock. Atomic: the insert either creates the row, or takes over a lock whose run has gone quiet for longer
-- than p_stale_seconds (it crashed), or leaves someone else's live lock alone. Returns true only if the caller now
-- holds it.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.acquire_generation_lock(p_owner uuid, p_stale_seconds integer)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  insert into public.generation_lock as l (name, owner, started_at)
  values ('generate', p_owner, now())
  on conflict (name) do update
    set owner = excluded.owner, started_at = now()
    where l.started_at < now() - make_interval(secs => p_stale_seconds);

  return exists (select 1 from public.generation_lock where name = 'generate' and owner = p_owner);
end;
$$;

-- Releases the lock only if the caller still owns it, so a run that outlived its lock can never free someone else's.
create or replace function public.release_generation_lock(p_owner uuid)
returns void
language sql
set search_path = public
as $$
  delete from public.generation_lock where name = 'generate' and owner = p_owner;
$$;

revoke all on function public.acquire_generation_lock(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_generation_lock(uuid)          from public, anon, authenticated;
grant execute on function public.acquire_generation_lock(uuid, integer) to service_role;
grant execute on function public.release_generation_lock(uuid)          to service_role;
