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

1. Create a file named `.env.local` in the project root (it is gitignored) containing:

   ```
   ANTHROPIC_API_KEY=your-key-here
   ```

   Optional: `STORY_MODEL=<model id>` (default `claude-sonnet-5-5`).

2. Run it:

   ```bash
   npm run stories:generate              # one new story
   npm run stories:generate -- --count 3  # up to three
   ```

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
