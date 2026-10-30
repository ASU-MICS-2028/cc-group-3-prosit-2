// Logo and mascot: hand-written SVG, colours from tokens (DESIGN-SYSTEM section 3).

const BUBBLE =
  "M60 10C32 10 12 29 12 54c0 15 8 28 20 36l-6 20 24-13c3.500.500 7 1 10 1 28 0 48-19 48-44S88 10 60 10z";

/** The "talk bubble" mark. `full` is the colour version; otherwise the ink silhouette. */
export function Logo({ size = 32, full = false, label = "HealthConnect" }: { size?: number; full?: boolean; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label}>
      {full ? (
        <>
          <path d={BUBBLE} fill="var(--cream)" stroke="var(--ink)" strokeWidth="2" />
          <ellipse cx="44" cy="52" rx="7" ry="9" fill="var(--ink)" />
          <ellipse cx="76" cy="52" rx="7" ry="9" fill="var(--ink)" />
          <circle cx="46" cy="48.500" r="2" fill="var(--surface)" />
          <circle cx="78" cy="48.500" r="2" fill="var(--surface)" />
          <path d="M48 70q12 10 24 0" fill="none" stroke="var(--tan)" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d={BUBBLE} fill="var(--ink)" />
          <circle cx="44" cy="54" r="7" fill="var(--cream)" />
          <circle cx="76" cy="54" r="7" fill="var(--cream)" />
          <circle cx="44" cy="55" r="3" fill="var(--ink)" />
          <circle cx="76" cy="55" r="3" fill="var(--ink)" />
        </>
      )}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <Logo size={36} />
      <span>HealthConnect</span>
    </span>
  );
}

export type Mood = "welcoming" | "thinking" | "resting" | "concerned" | "celebrating";

/** The only moods the design system allows. Never use on bad-news screens. */
export function Mascot({ mood, size = 120 }: { mood: Mood; size?: number }) {
  const closed = mood === "resting";
  const look = mood === "thinking" ? { x: 1.500, y: -3 } : { x: 0, y: 0 };
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`HealthConnect mascot, ${mood}`}>
      <path d={BUBBLE} fill="var(--cream)" />
      {closed ? (
        <>
          <path d="M37 54q7 6 14 0" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
          <path d="M69 54q7 6 14 0" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="44" cy="52" rx="7" ry="9" fill="var(--surface)" />
          <ellipse cx="76" cy="52" rx="7" ry="9" fill="var(--surface)" />
          <circle cx={44 + look.x} cy={53 + look.y} r="4" fill="var(--ink)" />
          <circle cx={76 + look.x} cy={53 + look.y} r="4" fill="var(--ink)" />
          <circle cx={45.500 + look.x} cy={51 + look.y} r="1.500" fill="var(--surface)" />
          <circle cx={77.500 + look.x} cy={51 + look.y} r="1.500" fill="var(--surface)" />
        </>
      )}
      {mood === "concerned" && (
        <>
          <path d="M36 42l16 -5" stroke="var(--ink)" strokeWidth="2.500" strokeLinecap="round" />
          <path d="M84 42l-16 -5" stroke="var(--ink)" strokeWidth="2.500" strokeLinecap="round" />
          <path d="M50 76q10-5 20 0" fill="none" stroke="var(--tan)" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {mood === "thinking" && (
        <>
          <path d="M52 74h16" fill="none" stroke="var(--tan)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="92" cy="22" r="3" fill="var(--lavender)" />
          <circle cx="100" cy="14" r="4" fill="var(--lavender)" />
        </>
      )}
      {mood === "welcoming" && (
        <>
          <path d="M44 68q16 16 32 0" fill="none" stroke="var(--tan)" strokeWidth="3" strokeLinecap="round" />
          <path d="M22 30q38-26 76 0" fill="none" stroke="var(--lavender)" strokeWidth="6" strokeLinecap="round" />
        </>
      )}
      {mood === "resting" && <path d="M52 72q8 6 16 0" fill="none" stroke="var(--tan)" strokeWidth="3" strokeLinecap="round" />}
      {mood === "celebrating" && (
        <>
          <path d="M44 68q16 16 32 0" fill="none" stroke="var(--tan)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="16" cy="18" r="3" fill="var(--lavender)" />
          <circle cx="104" cy="20" r="4" fill="var(--lavender)" />
          <circle cx="100" cy="8" r="2.500" fill="var(--cream)" />
          <circle cx="24" cy="6" r="2.500" fill="var(--cream)" />
          <circle cx="110" cy="40" r="2" fill="var(--lavender)" />
        </>
      )}
    </svg>
  );
}
