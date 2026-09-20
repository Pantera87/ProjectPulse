/**
 * Decorative "radar pulse" illustration for empty states — concentric
 * gradient rings with a pulsing core. Pure inline SVG, no deps.
 */
export default function EmptyPulse({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pp-pulse-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke="url(#pp-pulse-grad)" strokeOpacity="0.15" strokeDasharray="2 10" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="url(#pp-pulse-grad)" strokeOpacity="0.3" strokeDasharray="4 8" />
      <circle cx="60" cy="60" r="26" fill="none" stroke="url(#pp-pulse-grad)" strokeOpacity="0.55" strokeDasharray="4 6" />
      <circle className="empty-pulse-core" cx="60" cy="60" r="9" fill="url(#pp-pulse-grad)" opacity="0.9" />
      <path d="M60 4v8M60 108v8M4 60h8M108 60h8" stroke="url(#pp-pulse-grad)" strokeOpacity="0.35" />
    </svg>
  );
}