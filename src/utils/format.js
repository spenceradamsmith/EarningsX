// Formatting helpers shared across the UI.

const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
                'Jul.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

export function formatEarningsDate(value) {
  const date = value != null ? new Date(value) : null;
  if (!(date instanceof Date) || isNaN(date)) return 'TBD';
  const month = MONTHS[date.getMonth()] ?? date.toLocaleString('en-US', { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  const rem100 = day % 100;
  let suffix = 'th';
  if (rem100 < 11 || rem100 > 13) {
    switch (day % 10) {
      case 1: suffix = 'st'; break;
      case 2: suffix = 'nd'; break;
      case 3: suffix = 'rd'; break;
    }
  }
  return `${month} ${day}${suffix}, ${year}`;
}

export function formatMarketCap(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  const abs = Math.abs(value);
  let out;
  if (abs >= 1e12) out = (value / 1e12).toFixed(2) + 'T';
  else if (abs >= 1e9) out = (value / 1e9).toFixed(1) + 'B';
  else if (abs >= 1e6) out = (value / 1e6).toFixed(1) + 'M';
  else if (abs >= 1e3) out = (value / 1e3).toFixed(1) + 'K';
  else out = value.toFixed(1);
  return `$${out}`;
}

export function formatNumber(value, decimals = 2) {
  const n = Number(value);
  if (value == null || isNaN(n)) return 'N/A';
  return n.toFixed(decimals);
}

// Gauge color band. 50% is the beat/miss decision threshold, so anything
// >=50 is a predicted beat (never red); yellow marks a weak/borderline beat.
export function pctColor(pct) {
  if (pct == null) return 'neutral';
  if (pct < 50) return 'red';
  if (pct < 62) return 'yellow';
  return 'green';
}
