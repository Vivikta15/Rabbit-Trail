import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import VisitTracker from '../components/analytics/VisitTracker';
import ReaderProvider from '../components/accounts/ReaderProvider';
import MascotDock from '../components/mascot/MascotDock';
import AmbientSky from '../components/pixel/AmbientSky';
import SiteNav from '../components/SiteNav';
import { siteUrl } from '../lib/share/share';
import './globals.css';

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

const TITLE = 'Rabbit Trail';
const DESCRIPTION = 'One deeply sourced daily story, written the way your curiosity works. Every claim is checked against its source.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl(process.env)),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: TITLE, type: 'website', images: ['/api/og'] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/api/og'] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="pb-28 font-mono">
        <AmbientSky />
        <ReaderProvider>
          <SiteNav />
          {children}
          <MascotDock />
          <VisitTracker />
        </ReaderProvider>
      </body>
    </html>
  );
}
