/** @type {import('tailwindcss').Config} */

// Lets a CSS-variable-based color still support Tailwind's opacity
// modifier syntax (e.g. "bg-danger/10", "hover:bg-line/40") - Tailwind's
// default alpha mechanism needs raw RGB channels to apply opacity to,
// which a var() reference can't provide. color-mix() works with any
// valid CSS color value, including one that only resolves at runtime.
function withOpacitySupport(varName, fallback) {
  return ({ opacityValue }) => {
    const parsed = opacityValue !== undefined ? parseFloat(opacityValue) : NaN;
    if (Number.isNaN(parsed)) return `var(${varName}, ${fallback})`;
    return `color-mix(in srgb, var(${varName}, ${fallback}) ${parsed * 100}%, transparent)`;
  };
}

module.exports = {
  content: [
    './app/**/*.js',
    './lib/**/*.js',
    './components/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        navy: withOpacitySupport('--df-text-primary', '#0c2340'),
        royal: {
          DEFAULT: withOpacitySupport('--df-accent', '#185fa5'),
          soft: '#4a86c4',
          pale: withOpacitySupport('--df-info-bg', '#e6f1fb'),
        },
        surface: withOpacitySupport('--df-surface-alt', '#f1f3f6'),
        'df-surface': withOpacitySupport('--df-surface', '#ffffff'),
        line: withOpacitySupport('--df-border', '#d8dde2'),
        ink: withOpacitySupport('--df-text-primary', '#0c2340'),
        muted: withOpacitySupport('--df-text-muted', '#5a6b7d'),
        faint: withOpacitySupport('--df-text-faint', '#8b97a3'),
        danger: withOpacitySupport('--df-error', '#c0392b'),
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
    },
  },
  plugins: [],
};
