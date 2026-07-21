export const TEAM_COLORS = [
  { hex: '#ff3b30', name: 'Red' },
  { hex: '#0074ff', name: 'Blue' },
  { hex: '#00c853', name: 'Green' },
  { hex: '#ff8c00', name: 'Orange' },
  { hex: '#8e24aa', name: 'Purple' },
  { hex: '#ff2d95', name: 'Pink' },
  { hex: '#ffd60a', name: 'Yellow' },
  { hex: '#00bcd4', name: 'Teal' },
];

export default function FootballIcon({ color = '#0074ff', size = 16 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 100 60" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M2 30 C10 10 35 4 50 4 C65 4 90 10 98 30 C90 50 65 56 50 56 C35 56 10 50 2 30 Z"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M26 30 C36 26 64 26 74 30" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      <path
        d="M36 25 L36 35 M45 24 L45 36 M54 24 L54 36 M63 25 L63 35"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
