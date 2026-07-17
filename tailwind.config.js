/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        field: {
          950: '#0b1f16',
          900: '#0f2b1e',
          800: '#163a28',
          700: '#1e4a34',
        },
        chalk: '#f4f1e8',
        lights: {
          DEFAULT: '#e8a339',
          soft: '#f3c37a',
        },
        flag: '#c0392b',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
    },
  },
  plugins: [],
};
