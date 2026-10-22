import TodayPicker from '../../components/today/TodayPicker';
import { getIndex } from '../../lib/stories/catalog';
import { getRepository } from '../../lib/stories/get-repository';

// The catalog grows while the app is running, so this must be read on every request, never at build time.
export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const index = await getIndex(getRepository());

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <TodayPicker index={index} />
    </main>
  );
}
