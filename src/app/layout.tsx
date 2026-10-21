import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rabbit Trail',
  description: 'One deeply sourced daily story, written the way your curiosity works.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
