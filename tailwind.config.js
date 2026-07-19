/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.js',
    './lib/**/*.js',
    './components/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#0c2340',
        royal: {
          DEFAULT: '#185fa5',
          soft: '#4a86c4',
          pale: '#e6f1fb',
        },
        surface: '#f1f3f6',
        line: '#d8dde2',
        ink: '#0c2340',
        muted: '#5a6b7d',
        faint: '#8b97a3',
        danger: '#c0392b',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
    },
  },
  plugins: [],
};
