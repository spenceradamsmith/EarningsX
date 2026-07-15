import { useEffect, useRef } from 'react';

// Free, client-side TradingView Advanced Chart (no API key, works for any
// symbol). autosize fills the inner __widget div, so that child must carry an
// explicit 100% height or the chart collapses to a default short height.
export default function TradingViewChart({ ticker }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.height = '100%';
    widget.style.width = '100%';
    container.appendChild(widget);

    const tvSymbol = String(ticker).replace('-', '.'); // BRK-B -> BRK.B
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: 'D',
      range: '12M',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '3',            // area — clean & simple
      locale: 'en',
      hide_top_toolbar: true,
      hide_side_toolbar: true,
      hide_legend: true,
      hide_volume: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      withdateranges: true,
      backgroundColor: 'rgba(20, 20, 20, 1)',
      gridColor: 'rgba(45, 45, 47, 0.25)',
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);
    return () => { container.innerHTML = ''; };
  }, [ticker]);

  return (
    <div className="chart-card">
      <div className="chart-title">Price Chart · {ticker}</div>
      <div className="tv-chart">
        <div
          className="tradingview-widget-container"
          ref={containerRef}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    </div>
  );
}
