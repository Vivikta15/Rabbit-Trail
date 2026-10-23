# Rabbit mascot, reader accounts, shields and payments

Decided with the owner on 2026-10-23.

## Pricing

- $3 per month subscription (Dodo Payments, a merchant of record, so tax is handled for India and the US).
- 2 streak shields included every month. A reader can also earn a shield (7-day run).
- Extra shields are sold as a pack (about $2 for 5), never singly: Dodo's published standard fee is about 4% + $0.40 per
  transaction (confirm in the Dodo dashboard), which leaves about $0.08 of a single $0.50 purchase.
- Shields are a quiet bonus, "pause your trail for a day when life gets busy". The trail is never lost, and nothing is locked.

## Mascot rules (a soft nudge, never a punishment)

- A rabbit is on every page. Its mood comes from the reader's own reading history.
- Missing days makes the rabbit sad, never angry. The only angry face is the joke when the 2 included shields are used up
  and a pack is offered.
- A "Calm rabbit" setting removes the sad and angry faces; the rabbit is simply friendly.
- Mood logic is a pure function with tests; the rabbit is SVG (no image files).

| Where | Rabbit |
|---|---|
| Reading a story | reads on a little phone; cheers on "I've finished this story" |
| Dashboard / Today | streak mood: thrilled, happy, hopeful, sad |
| Quiz and onboarding | curious |
| Connections | detective |
| Shield pack offer | cute angry |

## Order

1. Mascot and mood engine, using the data already in the browser (this step).
2. Reader accounts: Google and email magic link through Supabase Auth, optional "Save your trail", browser data moved to the server.
3. Shields: 2 a month, earnable, "pause your trail", stored on the server.
4. Dodo checkout for the subscription and the shield pack, with a webhook; the trial and subscription state move to the server.

Open questions: regional price for India (the old price was Rs 49 against about Rs 250 for $3), and the exact Dodo fee.
