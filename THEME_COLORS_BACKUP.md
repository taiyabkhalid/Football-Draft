# Original (Light Mode) Color Palette — Backup

This documents the exact hardcoded colors used throughout the app before
dark mode was introduced via CSS variables, specifically as used in
`app/draft/page.js`. These become the LIGHT-mode (default) values of the
new CSS variables — if dark mode ever needs to be fully reverted, setting
every variable back to these exact values restores the original look
precisely.

| Token | Original Hex | Usage |
|---|---|---|
| `--df-surface` | `#ffffff` | Card / panel backgrounds |
| `--df-accent` | `#185fa5` | Primary buttons, links, active states |
| `--df-accent-secondary` | `#0074ff` | Secondary accent (default team color, highlights) |
| `--df-text-muted` | `#5a6b7d` | Secondary/muted body text |
| `--df-text-primary` | `#0c2340` | Primary text, headings |
| `--df-border` | `#d8dde2` | Card borders, dividers |
| `--df-text-secondary` | `#3d4a57` | Secondary dark text variant |
| `--df-text-faint` | `#8b97a3` | Faint/disabled text |
| `--df-surface-alt` | `#f1f3f6` | Alternate light surface |
| `--df-surface-subtle` | `#e9ecef` / `#f7f9fb` | Subtle background tint |
| `--df-warning-text` | `#854f0b` / `#633806` | Warning banner text |
| `--df-warning-bg` | `#faeeda` / `#faf3e3` | Warning banner background |
| `--df-warning-accent` | `#f3c37a` | Warning accent |
| `--df-accent-dark` | `#0c447c` | Pressed/dark accent state |
| `--df-accent-darkest` | `#042c53` | Darkest accent shade |
| `--df-info-bg` | `#e6f1fb` | Info banner background |
| `--df-info-text` | `#b5d4f4` | Info banner text |
| `--df-error` | `#c0392b` | Error text/state |
| `--df-success` | `#3b6d11` | Success text/state |

## Original `tailwind.config.js` colors (before dark mode)

These custom Tailwind color names were plain hardcoded hex values before
dark mode was introduced. To fully revert, replace the current
`withOpacitySupport(...)` function calls in `tailwind.config.js` with
these exact original values:

```js
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
```

Note: the `'df-surface'` color and the `withOpacitySupport` helper
function itself were both added specifically for dark mode and have no
"original" equivalent — removing them entirely is part of a full revert,
along with changing `bg-df-surface` back to `bg-white` wherever it was
substituted in (see the source files for exact locations).

## How to fully revert to light mode only

If dark mode is ever removed entirely: replace every `var(--df-*)`
reference in the affected files back with its original hex value from
this table, and remove the corresponding CSS variable block from
`globals.css`. The light-mode CSS variable values already equal these
originals exactly, so simply never switching `data-theme` to `"dark"`
achieves the same visual result without removing any code.
