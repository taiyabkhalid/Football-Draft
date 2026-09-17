// Shared SIZE/LAYOUT constants for the Draft Board and "View by Team"
// panels - used by BOTH app/draft/page.js (GM view) and app/live/page.js
// (spectator view), so a future size change only has to be made here,
// once, rather than requiring anyone to remember to update both files.
//
// This file deliberately contains no colors at all. draft.js is
// dark-mode aware and uses CSS variables (var(--df-*)) for every color;
// live.js is not dark-mode aware and keeps its own original hardcoded
// colors. Keeping color entirely out of this file means it can safely
// stay identical between the two pages without ever fighting that
// difference - if a change is about color, it does NOT belong here.

// Draft Board: the mini player card shown in each round/team cell.
export const BOARD_CARD_WIDTH = 98; // includes the card's own p-1 padding
export const BOARD_CARD_MIN_HEIGHT = 66;

// Draft Board: table column sizing.
export const BOARD_TEAM_COLUMN_MIN_WIDTH = 105;
export const BOARD_ROUND_COLUMN_MIN_WIDTH = 110;

// Draft Board: outer scroll container height, as a Tailwind class string
// (kept as a class rather than a number since it's a responsive
// breakpoint pair, not a single value).
export const BOARD_CONTAINER_HEIGHT_CLASS = 'max-h-[65vh] sm:max-h-[82vh]';

// "View by Team": width of each team-selector button in the tab strip.
export const TEAM_BUTTON_WIDTH = 140;
