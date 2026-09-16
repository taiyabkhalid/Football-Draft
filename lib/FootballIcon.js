export const TEAM_COLORS = [
  { hex: '#ff3b30', name: 'Red' },
  { hex: '#0074ff', name: 'Blue' },
  { hex: '#00c853', name: 'Green' },
  { hex: '#ff8c00', name: 'Orange' },
  { hex: '#8e24aa', name: 'Purple' },
  { hex: '#ff2d95', name: 'Pink' },
  { hex: '#ffd60a', name: 'Yellow' },
  { hex: '#00bcd4', name: 'Teal' },
  { hex: '#1a1a1a', name: 'Black' },
  { hex: '#6b7280', name: 'Gray' },
];

// Mixes a team color toward white so it can be used as a light, legible
// background tint (with the full-strength color still used for icons/text)
// — amount is the fraction of white to mix in (0 = original color, 1 = white).
// Grayscale-ish colors (black, gray) wash out to near-white at high lighten
// amounts, becoming indistinguishable from the app's plain neutral surfaces -
// so their lightening is capped lower to keep a visibly gray tint.
export function lightenColor(hex, amount = 0.85, target = [255, 255, 255]) {
  const clean = (hex || '#0074ff').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const [tr, tg, tb] = target;
  const isGrayscale = Math.max(r, g, b) - Math.min(r, g, b) < 30;
  const effectiveAmount = isGrayscale ? Math.min(amount, 0.75) : amount;
  const mix = (channel, targetChannel) => Math.round(channel + (targetChannel - channel) * effectiveAmount);
  return `rgb(${mix(r, tr)}, ${mix(g, tg)}, ${mix(b, tb)})`;
}

export function getLuminance(hex) {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return 255;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export default function FootballIcon({ color = '#0074ff', size = 16, isDarkMode = false }) {
  // A team color close to black is invisible against this app's dark
  // background - rather than stroking the outline in a color that
  // vanishes, this fills the shape with the team's actual color and
  // outlines it in a light color instead, so it stays identifiable
  // without changing anything about how the icon looks in light mode
  // or for any other team's color.
  const needsOutlineTreatment = isDarkMode && getLuminance(color) < 40;
  const strokeColor = needsOutlineTreatment ? '#e2e8f0' : color;
  const fillColor = needsOutlineTreatment ? color : 'none';
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 100 60" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M2 30 C10 10 35 4 50 4 C65 4 90 10 98 30 C90 50 65 56 50 56 C35 56 10 50 2 30 Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M26 30 C36 26 64 26 74 30" fill="none" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" />
      <path
        d="M36 25 L36 35 M45 24 L45 36 M54 24 L54 36 M63 25 L63 35"
        stroke={strokeColor}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// A self-contained inline SVG star, deliberately not relying on any
// third-party icon font class (e.g. "ti-star-filled") - a webfont glyph
// can fail to render for reasons entirely outside our control (CDN
// hiccups, a subset that doesn't include that specific glyph, caching),
// and when it does, the toggle looks exactly like "the star disappeared"
// even though the underlying state is perfectly correct. This SVG has no
// such dependency: it always renders, and switches between outline and
// filled purely via its own fill/stroke attributes.
export function StarIcon({ filled = false, size = 18, filledColor = 'var(--df-warning-accent, #f3c37a)', outlineColor = 'var(--df-text-faint, #8b97a3)' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
        fill={filled ? filledColor : 'none'}
        stroke={filled ? filledColor : outlineColor}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
