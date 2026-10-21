import TodayPicker from '../../components/today/TodayPicker';
import { loadCatalog, toIndexEntry } from '../../lib/stories/catalog';

// The catalog grows while the app is running, so this must be read on every request, never at build time.
export const dynamic = 'force-dynamic';

export default function TodayPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <TodayPicker index={loadCatalog().map(toIndexEntry)} />
    </main>
  );
}
