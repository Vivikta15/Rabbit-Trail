# Deploying Rabbit Trail (Vercel + Supabase)

How it fits together:

- **Vercel** serves the website.
- **Supabase** (Postgres) holds the stories, the topics already tried, a run lock and a log of generation runs.
- **A GitHub Action** writes one new story a day. It, not the website, holds the AI key (Google Gemini or Anthropic Claude, your choice).

You do five things in your own accounts. Each step ends with a check, so you know it worked before moving on.
Nothing here needs you to paste a key into this chat.

## 0. Before you start

**Windows PowerShell:** if `npm run ...` fails with "running scripts is disabled on this system", type `npm.cmd`
instead of `npm` (for example `npm.cmd run doctor`). It does the same thing and does not change any security
setting on your computer.

- Accounts at supabase.com, vercel.com and github.com (the free plans are enough to begin).
- An AI key, saved with `npm run setup:gemini` (Google Gemini, from aistudio.google.com/apikey) or
  `npm run setup:key` (Anthropic Claude). Pick one; see the README.
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
2. In the repository: **Settings -> Secrets and variables -> Actions**. On the **Secrets** tab add, with exactly
   these names:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - your AI key: `GEMINI_API_KEY` (Google) **or** `ANTHROPIC_API_KEY` (Claude)

   Then on the **Variables** tab add one variable, `LLM_PROVIDER`, with the value `gemini` or `anthropic`, matching
   the key you added.
3. Open the **Actions** tab, choose **Daily story**, and click **Run workflow** once.

**Check:** the run goes green and a new row appears in `stories`. From then on it runs every day at 03:17 UTC
(change the `cron` line in `.github/workflows/daily-stories.yml` to move it). A red run means something needs
attention, and GitHub emails you. The run's log says what.

## 5. Deploy the website on Vercel

1. In Vercel: **Add New -> Project**, import the GitHub repository. Leave the framework as Next.js.
2. Under **Environment Variables** add, for **Production** and **Preview**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Do **not** add the AI key here: the website never writes stories, so it does not need it. Do **not**
   prefix any of these with `NEXT_PUBLIC_`: that would send the key to every visitor's browser.
3. Click **Deploy**.

**Check:** open the site's `/today`. You should be taken to a story. If you see "Something went wrong", open the
deployment's **Logs** in Vercel: the message names the setting that is missing. A deployment without Supabase
settings refuses to run on purpose, rather than quietly showing a single story.

## 6. Reader accounts (optional)

Sign-in lets a reader keep their streak and trail across devices. The site works without it, so do this when you are ready.

1. In the Supabase **SQL Editor**, run `supabase/migrations/0002_reader_state.sql` (after `0001_stories.sql`).
2. **Authentication -> URL Configuration**: set **Site URL** to your site address (for example
   `https://rabbittrail.vercel.app`) and add `https://rabbittrail.vercel.app/account` under **Redirect URLs**.
3. **Email sign-in links:** Supabase's built-in sender allows only a few emails an hour. Under **Authentication ->
   SMTP Settings** connect a sender such as Resend (it has a free tier) before real readers arrive.
4. **Google sign-in (optional, skip it if you like):** email links work on their own. Google asks for a billing account
   when you create a Google Cloud project, so many people leave it out. To add it later, create an OAuth client in Google Cloud (**APIs & Services -> Credentials -> OAuth client ID**,
   type Web application). Add the redirect address Supabase shows under **Authentication -> Providers -> Google**,
   then paste the client ID and secret into that Supabase page and switch Google on. Finally set
   `GOOGLE_SIGNIN_ENABLED` to `1` in Vercel (the button stays hidden until you do).
5. In Vercel add `SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_` key from **Project Settings -> API Keys**) for
   Production and Preview, then redeploy. Never put the secret key here: the app refuses it.

**Check:** `/account` offers "Continue with Google" and an email box. Signing in and finishing a story shows
"Your trail is saved." Whether a reader has paid is only ever set by the server, never by the browser.

## What each setting is for

| Setting | Where it lives | Used by |
|---|---|---|
| `GEMINI_API_KEY` | your `.env.local`, GitHub secret | writing stories with Google Gemini (not the website) |
| `ANTHROPIC_API_KEY` | your `.env.local`, GitHub secret | writing stories with Claude instead (not the website) |
| `LLM_PROVIDER` | your `.env.local` (set for you), GitHub variable | which of the two writes stories: `gemini` or `anthropic` |
| `GEMINI_MODEL` (optional) | `.env.local`, GitHub variable | which Gemini model (default `gemini-3.8-flash`) |
| `GEMINI_JUDGE_MODEL` (optional) | `.env.local`, GitHub variable | a second, lighter model that only checks drafts, e.g. `gemini-3.5-flash-lite`; each model has its own daily allowance |
| `SUPABASE_URL` | `.env.local`, GitHub secret, Vercel | everything that reads or writes stories |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, GitHub secret, Vercel | the same. It can read and write everything: server-side only |
| `SUPABASE_PUBLISHABLE_KEY` (optional) | `.env.local`, Vercel | reader sign-in. The public key, sent to browsers on purpose; never the secret key |
| `GOOGLE_SIGNIN_ENABLED` (optional) | Vercel | set to `1` to show the Google button, once Google is set up in Supabase |
| `STORY_MODEL` (optional) | `.env.local`, GitHub variable | which Claude model (default `claude-sonnet-5-5`) |
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
| `Google rejected the Gemini API key` | Run `npm run setup:gemini`, then update the GitHub secret. Also check the Gemini API is enabled for the key's Google project. |
| `Gemini says the rate or daily quota is used up` | The free tier's limit. Wait (daily quotas reset at midnight Pacific time), set `GEMINI_MODEL` to another model, or enable billing in Google AI Studio. |
| `Both an Anthropic and a Gemini key are set` | Set `LLM_PROVIDER` to `gemini` or `anthropic` (the setup commands do this for you). |
| A red **Daily story** run | Open the run's log: it states the reason (an outage, a spent call budget, a rejected key). |

## Changing a key

Change it in each place it lives (the table above). Old keys keep working until you revoke them in the Gemini (Google AI Studio),
Anthropic or Supabase console, so revoke the old one after the new one is in place.

## Not covered yet

Payments and streak shields. The free trial and "subscribed" state still start in the reader's browser; once
payments are added they move to the server, which is the only place that can mark a reader as paid.
