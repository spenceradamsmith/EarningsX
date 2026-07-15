import { useState } from 'react';
import { formatEarningsDate, formatMarketCap, formatNumber } from '../utils/format';
import Gauge from './Gauge';
import Countdown from './Countdown';
import TradingViewChart from './TradingViewChart';
import Logo from './Logo';

export default function StockDetail({ stock, onBack }) {
  const [expanded, setExpanded] = useState(false);
  const hasPrediction = typeof stock.rawBeatPct === 'number';

  const sentences = (stock.description || '').split(/(?<=\.)\s+/);
  const short = sentences.slice(0, 4).join(' ');
  const full = sentences.join(' ');

  return (
    <div className="search-stock">
      <button className="back-btn" onClick={onBack} type="button">&larr; Back to all stocks</button>

      <div className="detail-header">
        <div className="company-info">
          <div className="logo">
            <Logo ticker={stock.ticker} fallback={stock.logo} />
          </div>
          <div>
            <h1>{stock.name}<span className="ticker">{stock.ticker}</span></h1>
            <div className="tags">
              {stock.sector && <span className="tag sector">{stock.sector}</span>}
              {stock.industry && <span className="tag industry">{stock.industry}</span>}
            </div>
          </div>
        </div>
        {hasPrediction
          ? <Gauge pct={stock.rawBeatPct} size="lg" />
          : <Countdown daysUntil={stock.daysUntil} size="lg" />}
      </div>

      {stock.notCovered ? (
        <div className="notice">
          Detailed metrics &amp; an AI earnings prediction aren’t tracked for this ticker yet —
          here’s the live price chart.
        </div>
      ) : (
        <div className="metrics-grid">
          <div><span className="label">Next Earnings:</span> {formatEarningsDate(stock.earningsDate)}</div>
          <div><span className="label">Expected EPS:</span> {formatNumber(stock.expectedEps)}</div>
          <div><span className="label">Trailing P/E:</span> {formatNumber(stock.trailingPe)}</div>
          <div><span className="label">Beta:</span> {formatNumber(stock.beta)}</div>
          <div><span className="label">Market Cap:</span> {formatMarketCap(stock.marketCap)}</div>
        </div>
      )}

      {(stock.website || full) && (
        <div className="description">
          {stock.website && (
            <p>
              <a href={stock.website} className="link-button" target="_blank" rel="noopener noreferrer">
                View Website
              </a>
            </p>
          )}
          {full && (
            <>
              <p>{expanded ? full : short}</p>
              {full !== short && (
                <button className="toggle-btn" onClick={() => setExpanded((v) => !v)} type="button">
                  {expanded ? 'Show less' : '…Read more'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <TradingViewChart ticker={stock.ticker} />
    </div>
  );
}
