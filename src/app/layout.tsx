import type { Metadata } from 'next';
import ReaderProvider from '../components/accounts/ReaderProvider';
import MascotDock from '../components/mascot/MascotDock';
import SiteNav from '../components/SiteNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rabbit Trail',
  description: 'One deeply sourced daily story, written the way your curiosity works.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="pb-28">
        <ReaderProvider>
          <SiteNav />
          {children}
          <MascotDock />
        </ReaderProvider>
      </body>
    </html>
  );
}
