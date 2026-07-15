import { useState, useEffect, useCallback } from 'react';
import { categories, fetchCategory, fetchStock, loadStaticData } from './api';
import CategoryNav from './components/CategoryNav';
import SearchBar from './components/SearchBar';
import StockCard from './components/StockCard';
import StockDetail from './components/StockDetail';

// Sort cards by soonest upcoming earnings; break ties by higher confidence.
function bySoonestThenConfidence(a, b) {
  const da = a.daysUntil != null && a.daysUntil >= 0 ? a.daysUntil : Infinity;
  const db = b.daysUntil != null && b.daysUntil >= 0 ? b.daysUntil : Infinity;
  if (da !== db) return da - db;
  const ca = typeof a.rawBeatPct === 'number' ? a.rawBeatPct : -1;
  const cb = typeof b.rawBeatPct === 'number' ? b.rawBeatPct : -1;
  return cb - ca;
}

export default function App() {
  const [category, setCategory] = useState(
    () => localStorage.getItem('selectedCategory') || 'All');
  const [cards, setCards] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState(null);

  const openStock = useCallback(async (ticker) => {
    const stock = await fetchStock(ticker);   // never null — falls back to name + chart
    setSelected(stock);
    window.history.replaceState(null, '', `#stock=${ticker}`);
    localStorage.setItem('lastStock', ticker);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goHome = useCallback(() => {
    setSelected(null);
    window.history.replaceState(null, '', window.location.pathname);
    localStorage.removeItem('lastStock');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Load a category's cards.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCategory(category).then((list) => {
      if (!alive) return;
      setCards(list.sort(bySoonestThenConfidence));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [category]);

  // On first load, restore a deep-linked / last-viewed stock and the banner date.
  useEffect(() => {
    loadStaticData().then(({ generatedAt }) => setGeneratedAt(generatedAt));
    const hash = window.location.hash.match(/stock=([^&]+)/);
    const restore = (hash && hash[1]) || localStorage.getItem('lastStock');
    if (restore) openStock(restore);
  }, [openStock]);

  const selectCategory = (cat) => {
    localStorage.setItem('selectedCategory', cat);
    setCategory(cat);
    setSelected(null);
    window.history.replaceState(null, '', window.location.pathname);
    localStorage.removeItem('lastStock');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div className="top-bar">
        <div className="header-container">
          <div className="header-top">
            <h1 onClick={() => selectCategory('All')}>EarningsX</h1>
            <SearchBar onSelect={openStock} />
          </div>
          <CategoryNav categories={categories} selected={category} onSelect={selectCategory} />
        </div>
      </div>

      <main className="content">
        {selected ? (
          <StockDetail stock={selected} onBack={goHome} />
        ) : (
          <div className="cards-grid">
            {loading && <div className="status-msg">Loading…</div>}
            {!loading && cards.length === 0 && (
              <div className="status-msg">No data available for “{category}”.</div>
            )}
            {!loading && cards.map((s) => (
              <StockCard key={s.ticker} stock={s} onClick={openStock} />
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <p>&copy; {new Date().getFullYear()} EarningsX. All rights reserved.</p>
          {generatedAt && <p className="data-date">Predictions updated {generatedAt}</p>}
          <p>Created by Spencer Smith</p>
        </div>
      </footer>
    </>
  );
}
