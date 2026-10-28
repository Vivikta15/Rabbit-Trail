import AccountPanel from '../../components/accounts/AccountPanel';

export const metadata = { title: 'Account · Rabbit Trail' };

export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:py-12">
      <header>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">Rabbit Trail</p>
        <h1 className="text-3xl font-bold">Your account</h1>
        <p className="mt-2 text-slate-300">Reading never needs an account. Signing in just keeps your trail safe.</p>
      </header>
      <AccountPanel />
    </main>
  );
}
