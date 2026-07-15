import { pctColor } from '../utils/format';

// Full circular beat-probability ring. The foreground circle starts at the top
// (rotated -90°) and fills clockwise to `pct`.
export default function Gauge({ pct, size = 'sm' }) {
  const color = pctColor(pct);
  const value = Math.max(0, Math.min(100, Number(pct)));
  const r = 42;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - value / 100);
  return (
    <div className={`visual prediction ${size === 'lg' ? 'detail-visual' : ''}`}>
      <svg className="gauge-ring" viewBox="0 0 100 100">
        <circle className="bg" cx="50" cy="50" r={r} fill="none" />
        <circle
          className={`fg ${color}`}
          cx="50" cy="50" r={r}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="percent">{value.toFixed(1)}%</div>
    </div>
  );
}
