// Days-until-prediction countdown (shown when earnings are >7 days out).
// Predictions open in the final 7 days before earnings, so we count down to
// that window. If we're already inside it (or the date is unknown) we show a
// status label instead of a misleading "0 days".
export default function Countdown({ daysUntil, size = 'sm' }) {
  const lg = size === 'lg';
  const left = typeof daysUntil === 'number' && !isNaN(daysUntil) ? daysUntil - 7 : null;

  if (left == null) {
    return (
      <div className={`visual countdown ${lg ? 'countdown-lg' : ''}`}>
        <div className="until soon">No upcoming{'\n'}earnings date</div>
      </div>
    );
  }
  if (left <= 0) {
    return (
      <div className={`visual countdown ${lg ? 'countdown-lg' : ''}`}>
        <div className="count small">Soon</div>
        <div className="until">reporting shortly</div>
      </div>
    );
  }
  return (
    <div className={`visual countdown ${lg ? 'countdown-lg' : ''}`}>
      <div className="count">{left}</div>
      <div className="days">{left === 1 ? 'day' : 'days'}</div>
      <div className="until">until prediction</div>
    </div>
  );
}
