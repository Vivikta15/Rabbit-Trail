// Prints the launch funnel: how many people came, from which channel, and how far they got. Run with `npm run stats`
// (or `npm run stats -- --days 30`). Reads only the anonymous counts in launch_events.
import { chooseBackend } from '../lib/config/backend';
import { createSupabaseRest } from '../lib/db/supabase-rest';
import { FunnelRow, summarizeEvents } from '../lib/analytics/events';

function parseDays(args: string[]): number {
  const i = args.indexOf('--days');
  const n = i === -1 ? 10 : Number(args[i + 1]);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 365) : 10;
}

const pct = (part: number, whole: number) => (whole === 0 ? '  -  ' : `${Math.round((part / whole) * 100)}%`.padStart(5));
const line = (row: FunnelRow) =>
  `${row.source.padEnd(16)} ${String(row.visit).padStart(6)} ${String(row.quiz_started).padStart(8)} ${String(row.quiz_completed).padStart(10)} ${pct(row.quiz_completed, row.visit)} ${String(row.story_finished).padStart(9)} ${String(row.signed_in).padStart(7)} ${String(row.shared).padStart(7)}`;

async function main(): Promise<number> {
  const backend = chooseBackend(process.env, process.cwd());
  if (backend.kind !== 'supabase') {
    console.error('Counting needs Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).');
    return 1;
  }

  const days = parseDays(process.argv.slice(2));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rest = createSupabaseRest({ url: backend.url, serviceKey: backend.serviceKey });
  const rows = await rest.selectAll('launch_events', `select=day,name,visitor,source&day=gte.${since}&order=day.asc,name.asc,visitor.asc`);
  const { bySource, total } = summarizeEvents(rows);

  console.log(`People who reached each step, last ${days} day${days === 1 ? '' : 's'} (since ${since}). Counted once per person.`);
  console.log(`${'channel'.padEnd(16)} ${'visited'.padStart(6)} ${'started'.padStart(8)} ${'completed'.padStart(10)} ${'rate'.padStart(5)} ${'finished'.padStart(9)} ${'signed'.padStart(7)} ${'shared'.padStart(7)}`);
  bySource.forEach((r) => console.log(line(r)));
  console.log('-'.repeat(72));
  console.log(line({ ...total, source: 'ALL CHANNELS' }));
  console.log(`\n"Users" for the launch goal = people who completed the quiz: ${total.quiz_completed}.`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`Could not read the counts: ${(err as Error).message}`);
    process.exitCode = 1;
  },
);
