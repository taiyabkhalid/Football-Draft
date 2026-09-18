# Original (Light Mode) Color Palette — Backup

This documents the exact hardcoded colors used throughout the app before
dark mode was introduced via CSS variables. These become the LIGHT-mode
(default) values of the CSS variables — if dark mode ever needs to be
fully reverted, setting every variable back to these exact values
restores the original look precisely, for every page listed below.

## Pages currently covered by dark mode

- `app/draft/page.js` (GM Draft page)
- `app/live/page.js` (Spectator page)
- `app/commissioner/page.js`
- `app/profile/page.js`
- `app/register/page.js`
- `app/archive/[id]/page.js`

Deliberately excluded (per explicit decision): `app/login/page.js`,
`app/print/page.js`, `app/reset-password/page.js`. The toggle itself
remains Commissioner-only for now; extending it to GMs/proxies was
discussed but not yet built.

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
| `--df-accent-dark` | `#0c447c` | Pressed/dark accent state (never used as text on a tinted background — see note below) |
| `--df-accent-darkest` | `#042c53` | Darkest accent shade |
| `--df-info-bg` | `#e6f1fb` | Info banner background |
| `--df-info-text` | `#b5d4f4` | Info banner text |
| `--df-error` | `#c0392b` | Error text/state |
| `--df-error-text-strong` | `#791f1f` | Stronger error text, e.g. inside an error message box |
| `--df-error-bg` | `#fceded` / `#fcebeb` | Error message box background |
| `--df-success` | `#3b6d11` | Success text/state |
| `--df-success-bg` | `#eaf3de` | Success message box background |
| `--df-success-text-strong` | `#27500a` | Stronger success text, e.g. inside a success message box |

### Important recurring bug, fixed everywhere it was found

`--df-accent-dark` and `--df-accent-darkest` darken further in dark mode
(they were designed as pressed-button shades for light backgrounds).
Several places on `draft.js`, `profile.js`, `commissioner.js`, and
`live.js` originally used one of these as *text* color sitting on a
`bg-royal-pale`/`--df-info-bg` tinted background — correct in light mode,
but produces unreadably low contrast once that background goes dark.
Every instance found was changed to use `--df-accent` (the bright accent,
which correctly brightens in dark mode) instead. If restoring the
original hex values, this distinction doesn't matter since there's no
dark background to contrast against.

## The `lightenColor()` / `teamTint()` pastel-background fix

`lightenColor()` (in `lib/FootballIcon.js`) mixes a team's color toward
white to make a soft card background — correct in light mode, wrong in
dark mode (produces a bright pastel card on a dark page). Both
`draft.js` and `live.js` wrap it in a local `teamTint(hex, amount)`
function that mixes toward the app's own dark surface color
(`[23, 33, 46]`) instead of white whenever dark mode is active. The
original function itself is unchanged and still defaults to mixing
toward white — reverting just means removing the `teamTint` wrapper and
calling `lightenColor` directly again, as both files did originally.

## The black/very-dark team color fix

`FootballIcon` accepts an `isDarkMode` prop. When a team's actual color
is close to black (luminance < 40) and dark mode is active, the icon
fills the shape with that color and outlines it in a light gray
(`#e2e8f0`) instead of just stroking it in a color that would be
invisible against the dark page. The "View by Team" selector buttons on
both `draft.js` and `live.js` have the same treatment for their own
background/border when a black-colored team is selected. Reverting:
this only ever activates when `isDarkMode` is true, so no action is
needed to restore light-mode appearance — the black-team logic simply
never engages in light mode.

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
substituted in. This substitution was made in: `app/draft/page.js`,
`app/live/page.js`, `app/profile/page.js`, `app/commissioner/page.js`,
`app/register/page.js`, `lib/OnboardingTour.js`, and
`lib/HeadshotCapture.js`.

## How to fully revert to light mode only

If dark mode is ever removed entirely: replace every `var(--df-*)`
reference in the affected files back with its original hex value from
this table, remove the `teamTint`/`isDarkMode` logic described above,
remove the `data-theme={...}` attribute from each page's root element,
and remove the corresponding CSS variable block from `globals.css`. The
light-mode CSS variable values already equal these originals exactly, so
simply never switching `data-theme` to `"dark"` achieves the same visual
result on every page without removing any code.

