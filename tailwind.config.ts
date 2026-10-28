import type { Config } from 'tailwindcss';
import { AMBER, CREAM, SLATE } from './src/lib/theme/palette';

// The site's look lives in src/lib/theme/palette.ts. `slate` runs light-to-dark the other way round from Tailwind's
// default and `amber` is coral, so the whole app takes on the calm sage-and-coral style from one place.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { slate: SLATE, amber: AMBER, cream: CREAM },
      fontFamily: {
        sans: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
