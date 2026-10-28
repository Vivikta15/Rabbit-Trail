// The look of the site: a soft sage sky, deep green text and coral buttons, in the spirit of a calm pixel-art game.
//
// The app was written with a dark theme, using Tailwind's `slate` scale (950 = page, 900 = cards, 100 = main text) and
// `amber` for accents. Instead of rewriting every class, the two scales are redefined here: `slate` runs the other way
// round (950 is now the palest, 100 the darkest), and `amber` becomes coral. Every page changes look at once, and
// tests/theme.test.js keeps the pairs readable.

export const SLATE = {
  50: '#08211c',
  100: '#0f2f28', // main text
  200: '#1b3a32',
  300: '#284a40', // body text
  400: '#35584c', // muted text
  500: '#3b5f52',
  600: '#7fa395', // strong borders
  700: '#9dbcab',
  800: '#b7d1c2', // borders, hover surfaces
  900: '#eef3e4', // cards and panels
  950: '#cfe3d9', // page background (the sky)
} as const;

export const AMBER = {
  50: '#fdecea',
  100: '#fbd5d1',
  200: '#f4a9a2',
  300: '#ec8179',
  400: '#c4423a', // buttons
  500: '#b0372f', // button hover
  600: '#9f322c',
  700: '#8a2b26', // accent text
  800: '#6f221f',
  900: '#521a17',
} as const;

// Words and icons for the few softer status colours used for success, warnings and errors.
export const STATUS = {
  success: '#1d5c3a',
  warning: '#7a4a07',
  danger: '#8a2323',
  info: '#1f4f78',
} as const;

export const CREAM = '#fffaf0'; // text on coral buttons
export const INK = '#0f2f28'; // outlines and strong text in the pixel art

// A scene palette, shared by the pixel sprites.
export const SCENE = {
  sky: '#cfe3d9',
  cloud: '#f6f3e6',
  cloudShade: '#dfe6d6',
  lake: '#8fb5b0',
  lakeDeep: '#7aa3a0',
  lakeShine: '#c9e1dc',
  pineDark: '#5f8576',
  pineMid: '#7fa392',
  pineLight: '#aac7ae',
  pineTip: '#d6e4c4',
  outline: '#5b4552',
  trunk: '#8a5f6a',
  trunkDark: '#6a4553',
  soil: '#b48790',
  soilDark: '#8f6672',
  grass: '#5d8466',
  grassDark: '#47695a',
  flower: '#e0645e',
  fur: '#fdf9ef',
  furShade: '#ddd5c6',
  earInner: '#f4a3b5',
  sweater: '#e8605a',
  sweaterDark: '#b94640',
  eye: '#2a2230',
} as const;

// WCAG contrast ratio of two hex colours (1 to 21).
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channel = (i: number) => {
      const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
