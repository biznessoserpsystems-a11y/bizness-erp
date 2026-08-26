// A distinctive, hand-drawn hero graphic for the top of the Executive
// Dashboard — an abstract ascending "growth pulse" rendered as pure SVG,
// so it stays genuinely crisp at any display resolution (a raster image
// would visibly soften or pixelate on a 4K/UHD screen; vector art never
// does, at any zoom level). Colors read from the real theme variables
// (--color-primary / --color-gold), so this follows light/dark mode and
// any future accent-color change automatically, the same discipline
// already used for the login page's brand panel.
//
// Also carries the personalized greeting — placed here rather than as a
// separate element because the graphic's own line path is deliberately
// quiet in the top-left (it starts low and only rises further right), so
// text overlaid there reads cleanly without needing a scrim behind it.
function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return { text: 'Still up', emoji: '🌙' };
  if (hour < 12) return { text: 'Good morning', emoji: '🌅' };
  if (hour < 17) return { text: 'Good afternoon', emoji: '☀️' };
  if (hour < 21) return { text: 'Good evening', emoji: '🌆' };
  return { text: 'Good evening', emoji: '🌙' };
}

export default function DashboardHeroGraphic({ firstName }) {
  const { text, emoji } = getTimeGreeting();
  return (
    <div className="dashboard-hero" aria-hidden="false">
      <svg viewBox="0 0 1200 220" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true">
        <defs>
          <linearGradient id="heroAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="heroLineStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-gold)" />
          </linearGradient>
        </defs>

        {/* Faint dot grid for texture — deliberately sparse, reads as
            data/analytics without competing with the KPI cards below it */}
        <g fill="var(--color-text-muted)" opacity="0.10">
          {Array.from({ length: 14 }).map((_, col) =>
            Array.from({ length: 4 }).map((_, row) => (
              <circle key={`${col}-${row}`} cx={40 + col * 86} cy={26 + row * 52} r="1.6" />
            ))
          )}
        </g>

        {/* The ascending growth pulse: a smooth area + line, rising
            left-to-right with a natural, non-uniform rhythm rather than a
            straight diagonal, so it reads as real movement, not a ramp */}
        <path
          d="M0,182 C90,178 150,150 220,152 C300,154 340,110 420,104 C500,98 540,140 620,128 C700,116 750,60 830,54 C910,48 950,86 1030,70 C1090,58 1140,40 1200,30 L1200,220 L0,220 Z"
          fill="url(#heroAreaFill)"
        />
        <path
          d="M0,182 C90,178 150,150 220,152 C300,154 340,110 420,104 C500,98 540,140 620,128 C700,116 750,60 830,54 C910,48 950,86 1030,70 C1090,58 1140,40 1200,30"
          fill="none"
          stroke="url(#heroLineStroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* A few accent points along the line — quiet, not literal data
            labels, just enough to suggest "this is a real series" */}
        {[[220, 152], [420, 104], [620, 128], [830, 54], [1030, 70]].map(([cx, cy]) => (
          <circle key={cx} cx={cx} cy={cy} r="4.5" fill="var(--color-surface)" stroke="var(--color-gold)" strokeWidth="2" />
        ))}
      </svg>
      <div className="dashboard-hero-greeting">
        <span className="dashboard-hero-emoji" role="img" aria-label="">{emoji}</span>
        <span>{text}{firstName ? `, ${firstName}` : ''}</span>
      </div>
    </div>
  );
}
