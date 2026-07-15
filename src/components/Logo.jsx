import { useState } from 'react';
import { customLogos } from '../data/customLogos';

// Deterministic accent color for the letter-avatar fallback.
const PALETTE = ['#3094ff', '#10b981', '#f59e0b', '#ef4444', '#a855f7',
                 '#ec4899', '#14b8a6', '#6366f1', '#f97316', '#0ea5e9'];
function colorFor(ticker) {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
}

// Try, in order: custom logo → data.json (Clearbit) logo → ticker-image service,
// then fall back to a clean letter avatar that always renders.
export default function Logo({ ticker, fallback, className = '' }) {
  const sources = [
    customLogos[ticker],
    fallback,
    `https://financialmodelingprep.com/image-stock/${ticker}.png`,
  ].filter(Boolean);

  const [idx, setIdx] = useState(0);

  if (idx >= sources.length) {
    const letters = ticker.replace(/[-.].*$/, '').slice(0, 2);
    return (
      <div className={`logo-avatar ${className}`} style={{ backgroundColor: colorFor(ticker) }}>
        {letters}
      </div>
    );
  }
  return (
    <img
      className={className}
      src={sources[idx]}
      alt={`${ticker} logo`}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
