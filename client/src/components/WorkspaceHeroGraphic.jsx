// A hero graphic reused by School Management's own launcher — pure SVG,
// so it stays crisp at any display resolution (a raster image softens
// past its own pixel density; vector art never does), with every color
// read from the real theme variables so it follows light/dark mode
// automatically, the same discipline used for the Dashboard's own hero
// graphic and the login page's brand panel.
//
// This used to carry eight other motifs too, one for every other
// workspace launcher (Accounting, Sales, Procurement, Manufacturing,
// Inventory, HR, Reports, Settings). Removed at the request that only
// School Management and the Dashboard keep this treatment — the other
// eight motif functions and their entries in MOTIFS were deleted
// outright rather than just unhooking the render calls that used them,
// so this file doesn't carry eight unused functions as dead weight.
const DOT_GRID = (cols, rows, spacingX, spacingY, offsetX = 40, offsetY = 26) => (
  <g fill="var(--color-text-muted)" opacity="0.10">
    {Array.from({ length: cols }).map((_, col) =>
      Array.from({ length: rows }).map((_, row) => (
        <circle key={`${col}-${row}`} cx={offsetX + col * spacingX} cy={offsetY + row * spacingY} r="1.6" />
      ))
    )}
  </g>
);

// School Management — an ascending achievement line (the same "real
// progress, not a ramp" rhythm as the Dashboard's own growth pulse) with
// a graduation cap sitting at its peak — a distinct motif for a distinct
// domain, tied directly to education rather than reusing Accounting's
// or the Dashboard's own shape wholesale.
function SchoolMotif() {
  return (
    <>
      {DOT_GRID(14, 4, 86, 52)}
      <path
        d="M20,180 C160,175 220,150 320,145 C420,140 460,110 560,95 C660,80 700,110 800,90 C880,74 900,55 960,50"
        fill="none" stroke="url(#heroLineStroke)" strokeWidth="2.5" strokeLinecap="round"
      />
      {[[320, 145], [560, 95], [800, 90]].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="4" fill="var(--color-surface)" stroke="var(--color-gold)" strokeWidth="2" />
      ))}
      {/* Graduation cap, sitting at the line's peak */}
      <g transform="translate(960, 50)">
        <path d="M-50,-6 L0,-24 L50,-6 L0,12 Z" fill="var(--color-primary)" />
        <path d="M-50,-6 L0,12 L50,-6" fill="none" stroke="var(--color-primary)" strokeWidth="2" />
        <rect x="-8" y="12" width="16" height="14" rx="2" fill="var(--color-gold)" />
        <path d="M38,-2 L38,22" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="38" cy="24" r="3.5" fill="var(--color-gold)" />
      </g>
    </>
  );
}

const MOTIFS = {
  school: SchoolMotif,
};

export default function WorkspaceHeroGraphic({ variant }) {
  const Motif = MOTIFS[variant];
  if (!Motif) return null;

  return (
    <div className="dashboard-hero" aria-hidden="true">
      <svg viewBox="0 0 1200 220" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <linearGradient id="heroLineStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-gold)" />
          </linearGradient>
        </defs>
        <Motif />
      </svg>
    </div>
  );
}
