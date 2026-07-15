import { useState, useRef, useEffect, useMemo } from 'react';
import { searchStocks } from '../data/searchStocks';

export default function SearchBar({ onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchStocks
      .filter((s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const pick = (ticker) => {
    setQuery('');
    setOpen(false);
    onSelect(ticker);
  };

  return (
    <div className="search-container" ref={boxRef}>
      <div className="search-box">
        <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            d="M21 21l-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" />
        </svg>
        <input
          type="text"
          placeholder="Search for a stock…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) pick(matches[0].ticker); }}
        />
      </div>
      {open && matches.length > 0 && (
        <div className="search-results">
          {matches.map((item) => (
            <div key={item.ticker} className="search-item" onClick={() => pick(item.ticker)}>
              <div className="item-ticker"><strong>{item.ticker}</strong></div>
              <div className="item-name">{item.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
