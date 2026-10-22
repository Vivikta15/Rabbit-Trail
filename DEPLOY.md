# Deploying Rabbit Trail (Vercel + Supabase)

How it fits together:

- **Vercel** serves the website.
- **Supabase** (Postgres) holds the stories, the topics already tried, a run lock and a log of generation runs.
- **A GitHub Action** writes one new story a day. It, not the website, holds the Anthropic key.

You do five things in your own accounts. Each step ends with a check, so you know it worked before moving on.
Nothing here needs you to paste a key into this chat.

## 0. Before you start

**Windows PowerShell:** if `npm run ...` fails with "running scripts is disabled on this system", type `npm.cmd`
instead of `npm` (for example `npm.cmd run doctor`). It does the same thing and does not change any security
setting on your computer.

- Accounts at supabase.com, vercel.com and github.com (the free plans are enough to begin).
- An Anthropic API key, saved with `npm run setup:key` (see the README).
- This project in a GitHub repository (step 4 covers pushing it).

## 1. Create the Supabase project

1. In Supabase, **New project**. Pick a name and a region near your readers, and save the database password
   somewhere safe (you will not need it again here).
2. Open **SQL Editor -> New query**, paste the whole of `supabase/migrations/0001_stories.sql`, and click **Run**.
   It is safe to run twice.
3. Save the connection settings on your computer. In your terminal:

   ```bash
   npm run setup:supabase
   ```

   It asks for the **Project URL** (Project Settings -> API) and the **secret key** (Project Settings -> API Keys:
   the one starting `sb_secret_`, or on older projects the long `service_role` key). The secret key is typed at a
   hidden prompt. It is checked against your project, then saved to `.env.local`, which git never sees.
   **Never use the public (publishable / anon) key**: the command refuses it.

**Check:** `npm run doctor` shows `[ok] Story storage` (Supabase) and `[ok] Storage access` (4 tables and the lock
functions are in place).

## 2. Move any local stories into Supabase

If you generated stories on your computer before this:

```bash
npm run db:import
```

It copies them across and never overwrites anything, so running it twice is harmless.

## 3. Generate once to see real stories

```bash
npm run stories:generate
```

It prints the story it wrote and how many tokens it used. Read it. The verification gate catches stories that
quote their source wrongly, but a model can still misjudge, so check a few before trusting it unattended.

**Check:** the story appears in Supabase under **Table Editor -> stories**.

## 4. Put the code on GitHub and set the schedule

1. Create a GitHub repository and push this project to it.
2. In the repository: **Settings -> Secrets and variables -> Actions -> New repository secret**. Add three
   secrets, with exactly these names:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Open the **Actions** tab, choose **Daily story**, and click **Run workflow** once.

**Check:** the run goes green and a new row appears in `stories`. From then on it runs every day at 03:17 UTC
(change the `cron` line in `.github/workflows/daily-stories.yml` to move it). A red run means something needs
attention, and GitHub emails you. The run's log says what.

## 5. Deploy the website on Vercel

1. In Vercel: **Add New -> Project**, import the GitHub repository. Leave the framework as Next.js.
2. Under **Environment Variables** add, for **Production** and **Preview**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Do **not** add the Anthropic key here: the website never writes stories, so it does not need it. Do **not**
   prefix any of these with `NEXT_PUBLIC_`: that would send the key to every visitor's browser.
3. Click **Deploy**.

**Check:** open the site's `/today`. You should be taken to a story. If you see "Something went wrong", open the
deployment's **Logs** in Vercel: the message names the setting that is missing. A deployment without Supabase
settings refuses to run on purpose, rather than quietly showing a single story.

## What each setting is for

| Setting | Where it lives | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | your `.env.local`, GitHub secret | writing stories (not the website) |
| `SUPABASE_URL` | `.env.local`, GitHub secret, Vercel | everything that reads or writes stories |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, GitHub secret, Vercel | the same. It can read and write everything: server-side only |
| `STORY_MODEL` (optional) | `.env.local`, GitHub variable | which Claude model writes stories |
| `STORIES_DIR` (optional) | `.env.local` | folder for local story files; ignored once Supabase is set |
| `REQUIRE_SUPABASE` (optional) | set to `1` by the daily workflow | makes a run refuse to write to local files, so stories can only ever go to Supabase |

## If something goes wrong

Run `npm run doctor`. It tests each piece and prints the fix. The usual causes:

| Message | Meaning and fix |
|---|---|
| `Supabase does not have "stories"` | The SQL in step 1 has not been run (or `SUPABASE_URL` points at another project). |
| `Supabase rejected the service key` | Wrong key, or the public key was used. Run `npm run setup:supabase` again. |
| `This is a Vercel deployment but Supabase is not configured` | Add the two Supabase variables in Vercel and redeploy. |
| `Another story run is already in progress` | Two runs overlapped. The lock frees itself after 30 minutes if a run crashed. |
| `Anthropic rejected the API key` | Run `npm run setup:key`, then update the GitHub secret. |
| A red **Daily story** run | Open the run's log: it states the reason (an outage, a spent call budget, a rejected key). |

## Changing a key

Change it in each place it lives (the table above). Old keys keep working until you revoke them in the Anthropic
or Supabase console, so revoke the old one after the new one is in place.

## Not covered yet

Reader accounts and server-side reader data (streak, trail, free trial, saved archetype) still live in each
reader's browser. That is the next piece.
