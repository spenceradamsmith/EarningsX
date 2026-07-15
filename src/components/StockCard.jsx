import { formatEarningsDate, formatMarketCap } from '../utils/format';
import Gauge from './Gauge';
import Countdown from './Countdown';
import Logo from './Logo';

export default function StockCard({ stock, onClick }) {
  const hasPrediction = typeof stock.rawBeatPct === 'number';
  const eps = stock.expectedEps != null && !isNaN(Number(stock.expectedEps))
    ? Number(stock.expectedEps).toFixed(2)
    : 'TBD';

  return (
    <button
      className={`card ${hasPrediction ? 'mode-prediction' : 'mode-countdown'}`}
      onClick={() => onClick(stock.ticker)}
      type="button"
    >
      <div className="card-content">
        <div className="header-row">
          <div className="logo">
            <Logo ticker={stock.ticker} fallback={stock.logo} />
          </div>
          <div className="header">
            <h2 className="company">{stock.name}</h2>
            <span className="ticker">{stock.ticker}</span>
          </div>
        </div>
        <div className="information">
          <div className="details">
            <div className="info">
              <span className="label">Next Earnings</span>
              <span className="value">{formatEarningsDate(stock.earningsDate)}</span>
            </div>
            <div className="info">
              <span className="label">Expected EPS</span>
              <span className="value">{eps}</span>
            </div>
            <div className="info">
              <span className="label">Market Cap</span>
              <span className="value">{formatMarketCap(stock.marketCap)}</span>
            </div>
          </div>
          {hasPrediction
            ? <Gauge pct={stock.rawBeatPct} />
            : <Countdown daysUntil={stock.daysUntil} />}
        </div>
      </div>
    </button>
  );
}
