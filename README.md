# Rabbit Trail

A daily reading app: one deeply sourced story a day, written in the reader's curiosity style, chosen to follow
where their curiosity has been heading.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (builds src/{data,lib,types,scripts} to dist first)
npm run build      # production build
```

Needs Node 22 or newer.

## Where the stories come from

Stories live in one of two places, chosen by settings:

- **Supabase** when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are both set. This is what the deployed website
  uses. See **DEPLOY.md** for the full Vercel + Supabase setup.
- **Local files** in `content/stories/` (override with `STORIES_DIR`) when neither is set. Fine for development; a
  website on Vercel cannot keep files. Setting only one of the two Supabase values is an error, and a Vercel
  deployment without Supabase refuses to run, so a half-finished setup can never silently show one story.

Either way there is also one hand-written story built into `src/data/stories.ts`. `/today` picks each reader's
story from the catalog:

- the story they already finished today, if any (so a reload never swaps it);
- otherwise the unread story most connected to what they have read, where a link in either direction between two
  stories' source pages counts, ties going to the oldest;
- a reader with no history gets the oldest unread story.

### Generating new stories

New stories are written by Claude from a Wikipedia article and published only if they pass a verification gate.

1. Save your Anthropic API key (get one at console.anthropic.com):

   ```bash
   npm run setup:key
   ```

   You paste the key at a hidden prompt. It is checked with Anthropic, then written to `.env.local`, which is
   gitignored. It is never printed, and the command refuses to run if `.env.local` is not gitignored. See
   `.env.example` for the other settings (`STORY_MODEL`, `STORIES_DIR`).

2. For the website, save your Supabase settings (details in DEPLOY.md):

   ```bash
   npm run setup:supabase
   ```

3. Check the whole setup:

   ```bash
   npm run doctor
   ```

   It tests Node, both keys, the model, Wikipedia, where stories are stored (and that the tables exist), the
   stored stories and leftovers from a crashed run, and tells you exactly what to fix.

4. Generate:

   ```bash
   npm run stories:generate              # one new story
   npm run stories:generate -- --count 3  # up to three
   ```

   It prints how many model calls and tokens it used.

### What protects you when things go wrong

- **Outages and rate limits:** requests to Wikipedia and Anthropic are retried with growing delays and have time
  limits. A rejected key, an unknown model or a service that stays down stops the run at once with a plain message,
  and never counts against the topic being tried.
- **Cost:** each story is capped at 12 model calls, and token usage is reported.
- **One run at a time:** a lock stops two runs from overlapping (a file lock locally, an atomic database lock on
  Supabase). A lock left by a crashed run is taken over automatically after 30 minutes.
- **No half-written or bad stories:** files are written to a temp name and renamed; the database refuses a story
  with an unsafe id, an id that does not match its record, or a source page that already has a story. A story whose
  shape is wrong or whose link is not a web link is ignored by the feed (and listed by `npm run doctor`).
- **Closed database:** every Supabase table has row-level security on with no policy, so the public key can read
  nothing even if it leaks. Only the server's secret key can, and it never goes to the browser.
- **Secrets:** the tests fail if an Anthropic or Supabase key appears in any file git would commit, if a `.env`
  file would be committed, or if browser code imports the server-side key or database code.
- **Page crashes:** a page that fails to render shows a friendly error page instead of a blank screen.

Each run follows the links of the stories you already have: it picks the page they link to most often that has no
story yet, so the catalog grows along the paths readers follow.

### How a story is checked before it is published

1. The model may only use the fetched article text and must copy a **verbatim quote** for every fact and for the
   counter-argument.
2. Every quote must be found in the article (ignoring case, spacing, curly quotes and dash styles), and must be long
   enough to prove something.
3. A second model call, acting as a strict judge, must find each claim supported by its own quote and the six
   archetype versions free of new facts.
4. Any failure, error or unusable answer rejects the story. Nothing is written unless all of this passes.

Limits to know about: step 3 is a model, so it lowers the chance of a wrong claim rather than removing it. Read a
few published stories yourself before relying on this unattended. Pages the model declines (no person and
decision to centre on), missing pages and disambiguation pages are remembered in
`content/stories/rejected-topics.jsonl` so later runs do not pay for them again.

### Running it every day

`.github/workflows/daily-stories.yml` runs the generator every day on GitHub (and on demand from the Actions tab).
It needs three GitHub secrets; DEPLOY.md, step 4, lists them. It refuses to run without Supabase, and a red run
means something needs attention.

## Project notes

- Reader state (streak, trail, trial, saved archetype) lives in the browser's localStorage for now.
- The plans in `plans/` record the product requirements and the decisions behind them.
