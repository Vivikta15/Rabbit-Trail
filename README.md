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

Stories are JSON files in `content/stories/` (override the folder with `STORIES_DIR`), plus one hand-written seed
story built into `src/data/stories.ts`. `/today` picks each reader's story from that catalog:

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

2. Check the whole setup:

   ```bash
   npm run doctor
   ```

   It tests Node, the key, the model, Wikipedia, the stories folder, the story files and leftovers from a crashed
   run, and tells you exactly what to fix.

3. Generate:

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
- **One run at a time:** a lock stops two runs from overlapping. A lock left by a crashed run is taken over
  automatically.
- **No half-written stories:** files are written to a temp name and renamed. Leftovers are cleaned up. A story
  whose id could escape the folder is refused, and a file with a bad shape or a non-web link is ignored by the
  feed (and listed by `npm run doctor`).
- **Secrets:** the tests fail if an API key appears in any file git would commit, if a `.env` file would be
  committed, or if browser code imports the server-side key handling.
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

The command is a one-shot. To make it daily, schedule `npm run stories:generate` with whatever you deploy on (a
cron job, a GitHub Action, or your host's scheduled jobs). That part is not set up yet.

## Project notes

- Reader state (streak, trail, trial, saved archetype) lives in the browser's localStorage for now.
- The plans in `plans/` record the product requirements and the decisions behind them.
