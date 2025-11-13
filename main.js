const customLogos = window.customLogos || {};
const searchStocks = window.searchStocks || {};

function getLogoSrc(ticker, fallbackLogo) {
  return customLogos[ticker] || fallbackLogo;
}

function showCardsGrid() {
  const content = document.querySelector('.content');
  content.classList.remove('show-search');
  window.localStorage.removeItem('lastStock');
}
function makeClickableLink(website) {
  if (!website) {
    return 'No website available';
  }
  const display = "View Website";
  return `<a
            href="${website}"
            class="link-button"
            target="_blank"
            rel="noopener noreferrer"
          >${display}</a>`;
}

// Add fade effect to categories navigation
const nav = document.querySelector('.categories-nav');
const wrapper = document.querySelector('.categories-wrapper');
function updateFade() {
  const atStart = nav.scrollLeft === 0;
  const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth;
  wrapper.classList.toggle('scrolled', !atStart);
  wrapper.classList.toggle('at-start', atStart);
  wrapper.classList.toggle('at-end', atEnd);
}
// whenever nav moves, update the wrapper’s classes
nav.addEventListener('scroll', updateFade);
updateFade()

function formatEarningsDate(value) {
  const date = value != null ? new Date(value) : null;
  if (!(date instanceof Date) || isNaN(date)) {
    return 'TBD';
  }
  const monthIndex = date.getMonth();
  const customMonthNames = {
    0: 'Jan.',   // January
    1: 'Feb.',   // February
    2: 'Mar.',   // March
    3: 'Apr.',   // April
    4: 'May',   // May
    5: 'Jun.',   // June
    6: 'Jul.',   // July
    7: 'Aug.',   // August
    8: 'Sept.',   // September
    9: 'Oct.',   // October
    10: 'Nov.',  // November
    11: 'Dec.'   // December
  };
  const month = customMonthNames.hasOwnProperty(monthIndex)
    ? customMonthNames[monthIndex]
    : date.toLocaleString('en-US', { month: 'long' });
  const day   = date.getDate();
  const year  = date.getFullYear();
  // Determine ordinal suffix
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

function formatMarketCap(value) {
  if (typeof value !== 'number' || isNaN(value)) {
    return 'N/A';
  }
  const abs = Math.abs(value);
  let formatted;
  if (abs >= 1e12) {
    formatted = (value / 1e12).toFixed(1) + ' Trillion';
  } else if (abs >= 1e9) {
    formatted = (value / 1e9).toFixed(1) + ' Billion';
  } else if (abs >= 1e6) {
    formatted = (value / 1e6).toFixed(1) + ' Million';
  } else if (abs >= 1e3) {
    formatted = (value / 1e3).toFixed(1) + ' Thousand';
  } else {
    formatted = value.toFixed(1);
  }
  return `$${formatted}`;
};

function formatNumber(value, decimals = 2) {
  if (typeof value !== 'number' || isNaN(value)) {
    return 'N/A';
  }
  return value.toFixed(decimals);
}

// helper to render the prediction gauge
function renderPredictionGauge(pct, isDetail = false) {
  return `
    <div class="visual prediction ${isDetail ? 'detail-visual' : ''}">
          <svg class="gauge" viewBox="0 0 100 50">
            <path class="bg"
              d="M10,50 A40,40 0 0,1 90,50"
              fill="none"/>
            <path class="fg"
              d="M10,50 A40,40 0 0,1 90,50"
              fill="none"/>
          </svg>
          <div class="percent">${(pct).toFixed(1)}%</div>
              </div>
  `;
}

// helper to render the countdown
function renderCountdownDisplay(display, unit) {
  return `
    <div class="countdown">
      <div class="days-number">${display}</div>
      <div class="days-label">${unit}</div>
      <div class="days-sub">until prediction</div>
    </div>
  `;
}

function renderStockDetail(stock) {
  const raw = stock.days_until;
  const daysLeft = (typeof raw === 'number' && !isNaN(raw)) ? raw - 7 : null;
  const unit = daysLeft === 1 ? 'day' : 'days';
  const display = daysLeft != null ? daysLeft : '–';
  const sentences = stock.description.split(/(?<=\.)\s+/);
  const first4 = sentences.slice(0,4).join(' ');
  const rest = sentences.slice().join(' ');
  website = stock.website
  window.scrollTo({ top: 0, behavior: 'smooth' });
  nav.scrollTo({ left: 0, behavior: 'smooth' });
  const visualHtml = (typeof stock.raw_beat_pct === 'number')
    ? renderPredictionGauge(stock.raw_beat_pct, true)
    : renderCountdownDisplay(display, unit);

  return `
    <button class="back-btn">&larr; Back to all stocks</button>

    <div class="detail-header">
      <div class="company-info">
        <img src="${getLogoSrc(stock.ticker, stock.logo)}"
             alt="${stock.name} logo"
             class="logo">
        <div>
          <h1>${stock.name}
            <span class="ticker">${stock.ticker}</span>
          </h1>
          <div class="tags">
            <span class="tag sector">${stock.sector}</span>
            <span class="tag industry">${stock.industry}</span>
          </div>
        </div>
      </div>
      ${visualHtml}
    </div>

    <div class="metrics-grid">
      <div><strong>Next Earnings:</strong>
           ${formatEarningsDate(stock.nextEarningsDate)}</div>
      <div><strong>Expected EPS:</strong>
           ${formatNumber(stock.expected_eps)}</div>
      <div><strong>Trailing P/E:</strong>
           ${formatNumber(stock.trailing_pe)}</div>
      <div><strong>Beta:</strong>
           ${formatNumber(stock.beta)}</div>
      <div><strong>Market Cap:</strong>
           ${formatMarketCap(stock.market_cap)}</div>
    </div>

    <div class="description">
      <p>
        ${makeClickableLink(website)}
      </p>
      <p>
        ${first4}
        <span id="more-text" style="display:none;"> ${rest}</span>
      </p>
      <button id="toggle-desc" class="toggle-btn">…Read more</button>
    </div>
  `;
}

async function fetchFullStockData(ticker) {
  const res = await fetch(`https://earnings-predictor.onrender.com/predict?ticker=${encodeURIComponent(ticker)}`);
  const json = await res.json();
  return {
    ticker,
    name:             json.company_name,
    logo:             json.logo,
    website:          json.website,
    sector:           json.sector,
    industry:         json.industry,
    description:      json.description,
    nextEarningsDate: json.earnings_date,
    expected_eps:     json.expected_eps,
    trailing_pe:      json.pe_ratio,
    beta:             json.beta,
    market_cap:       json.market_cap,
    days_until:       json.days_until,
    raw_beat_pct:     json.raw_beat_pct
  };
}

const categoryTickers = {
  'All': [
    'NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOG',
    'META', 'AVGO', 'TSM', 'BRK-B', 'TSLA',
    'JPM', 'WMT', 'LLY', 'V', 'ORCL',
    'TCEHY', 'NFLX', 'MA', 'XOM', 'COST',
  ],
  'Technology': [
    'NVDA', 'MSFT', 'AAPL', 'AVGO', 'TSM',
    'ORCL', 'SAP', 'PLTR', 'ASML', 'CSCO',
    'IBM', 'CRM', 'AMD', 'INTU', 'NOW',
    'UBER', 'TXN', 'ACN', 'QCOM', 'ADBE'
  ],
  'Healthcare': [
    'LLY', 'JNJ', 'ABBV', 'NVO', 'UNH',
    'NVS', 'ABT', 'AZN', 'MRK', 'ISRG',
    'TMO', 'AMGN', 'BSX', 'SYK', 'DHR',
    'PFE', 'GILD', 'SNY', 'VRTX', 'MDT'
  ],
  'Financials': [
    'BRK-B', 'JPM', 'V', 'MA', 'BAC',
    'WFC', 'MS', 'AXP', 'HSBC', 'GS',
    'BX', 'RY', 'HDB', 'SCHW', 'BLK',
    'SPGI', 'C', 'MUFG', 'PGR', 'TD'
  ],
  'Consumer Discretionary': [
    'AMZN', 'TSLA', 'HD', 'BABA', 'TM',
    'MCD', 'BKNG', 'PDD', 'TJX', 'LOW',
    'MELI', 'NKE', 'SBUX', 'DASH', 'SE',
    'RACE', 'RCL', 'ABNB', 'CMG', 'ORLY'
  ],
  'Consumer Staples': [
    'WMT', 'COST', 'PG', 'KO', 'PM',
    'PEP', 'UL', 'BUD', 'BTI', 'MO',
    'MDLZ', 'CL', 'MNST', 'DEO', 'TGT',
    'KR', 'KDP', 'KMB', 'CCEP', 'KVUE'
  ],
  'Energy': [
    'XOM', 'CVX', 'SHEL', 'TTE', 'COP',
    'ENB', 'BP', 'PBR', 'CVX', 'WMB',
    'EQNR', 'EPD', 'EOG', 'CNQ', 'KMI',
    'ET', 'LNG', 'MPC', 'MPLX', 'OKE'
  ],
  'Industrials': [
    'GE', 'RTX', 'CAT', 'BA', 'HON',
    'UNP', 'ETN', 'GEV', 'DE', 'LMT',
    'RELX', 'TT', 'WM', 'CTAS', 'TRI',
    'PH', 'UPS', 'TDG', 'MMM', 'GD'
  ],
  'Materials': [
    'LIN', 'BHP', 'RIO', 'SHW', 'SCCO',
    'ECL', 'NEM', 'APD', 'FCX', 'CRH',
    'AEM', 'CTVA', 'VALE', 'WPM', 'B',
    'VMC', 'MLM', 'FNV', 'NUE', 'DD'
  ],
  'Utilities': [
    'NEE', 'SO', 'CEG', 'DUK', 'NGG',
    'VST', 'AEP', 'SRE', 'D', 'EXC',
    'PEG', 'XEL', 'ED', 'ETR', 'WEC',
    'PCG', 'NRG', 'AWK', 'DTE', 'AEE'
  ],
  'Real Estate': [
    'AMT', 'PLD', 'WELL', 'EQIX', 'SPG',
    'DLR', 'PSA', 'O', 'CCI', 'CBRE',
    'VICI', 'CSGP', 'EXR', 'IRM', 'AVB',
    'VTR', 'EQR', 'SBAC', 'BEKE', 'INVH'
  ],
  'Communication Services': [
    'GOOG', 'META', 'NFLX', 'TMUS', 'DIS',
    'T', 'VZ', 'SPOT', 'CMCSA', 'APP',
    'NTES', 'RBLX', 'CHTR', 'AMX', 'TTWO',
    'EA', 'TTD', 'CHT', 'TKO', 'LYV'
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.categories-nav');
  const allBtn = Array.from(nav.querySelectorAll('button')).find(b => b.textContent === 'All');
  const stored = window.localStorage.getItem('lastStock');
  const footer = document.querySelector('.footer');
  const defaultFooterHTML = footer.innerHTML;
  function resetFooter() {
    footer.innerHTML = defaultFooterHTML;
  }
  if (stored) {
    nav.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    allBtn && allBtn.classList.add('selected');
    fetchFullStockData(stored)
      .then(stock => {
        showStockDetail(stock);
        resetFooter();
      })
      .catch(console.error);
  }
  
  function attachDetailListeners() {
    // Read-more toggle
    document.getElementById('toggle-desc').addEventListener('click', e => {
      const more = document.getElementById('more-text');
      const hidden = more.style.display === 'none';
      more.style.display = hidden ? 'inline' : 'none';
      e.target.textContent = hidden ? ' Show less' : '…more';
    });

    // Back button
    document.querySelector('.back-btn').addEventListener('click', () => {
      document.querySelector('.content').classList.remove('show-search');
      goHome();
      const searchInput = document.querySelector('.search-box input');
      const searchResults = document.querySelector('.search-results');
      searchInput.value = '';
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
      window.history.replaceState(null, '', window.location.pathname);
      window.localStorage.removeItem('lastStock');
    });
  }
  function showStockDetail(stock) {
    const container = document.getElementById('searchStock');
    container.innerHTML = renderStockDetail(stock);
    document.querySelector('.content').classList.add('show-search');
    attachDetailListeners();
    if (typeof stock.raw_beat_pct === 'number') {
      const fg = container.querySelector('.gauge .fg');
      const length = fg.getTotalLength();
      const pctValue = stock.raw_beat_pct;
      fg.style.strokeDasharray  = length;
      fg.style.strokeDashoffset = length * (1 - stock.raw_beat_pct / 100);
      fg.classList.toggle('red', pctValue < 40);
      fg.classList.toggle('yellow', pctValue >= 40 && pctValue < 60);
      fg.classList.toggle('green', pctValue >= 60);
    }
    window.history.replaceState(null, '', `#stock=${stock.ticker}`);
    window.localStorage.setItem('lastStock', stock.ticker);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function goHome() {
    footer.textContent = 'Loading…';
    const category = localStorage.getItem('selectedCategory') || 'All';
    await fetchAndDisplay(category);
    document.querySelector('.content').classList.remove('show-search');
    window.localStorage.removeItem('lastStock');
    resetFooter();
  }
  const cardsGrid = document.querySelector('.cards-grid');
  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const savedScroll = parseInt(localStorage.getItem('navScroll'), 10);
  cardsGrid.addEventListener('click', async e => {
    searchInput.value = '';
    const card = e.target.closest('.card');
    if (!card) {
      return;
    }
    const ticker = card.dataset.ticker;
    footer.textContent = `Loading...`;
    cardsGrid.innerHTML = '';
    const stock = await fetchFullStockData(ticker);
    showStockDetail(stock);
    resetFooter();
  });
  if (!isNaN(savedScroll)) {
    nav.scrollLeft = savedScroll;
  }

  // helper to find a button by its category name
  function findButtonByCategory(category) {
    return Array.from(nav.querySelectorAll('button'))
      .find(b => b.textContent === category);
  }

  // on scroll, remember scrollLeft
  nav.addEventListener('scroll', () => {
    localStorage.setItem('navScroll', nav.scrollLeft);
    updateFade();
  });

  // Category buttons
  nav.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') {
      return;
    }
    cardsGrid.innerHTML = '';
    showCardsGrid();
    const category = e.target.textContent;
    window.localStorage.removeItem('lastStock');
    localStorage.setItem('selectedCategory', category);

    nav.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
    fetchAndDisplay(category);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // on load, pick the saved category (or default to “All”)
  const savedCategory = localStorage.getItem('selectedCategory') || 'All';
  const initialBtn = findButtonByCategory(savedCategory) || findButtonByCategory('All');
  if (initialBtn) {
    initialBtn.classList.add('selected');
    fetchAndDisplay(initialBtn.textContent);
  }
  // Fetch & render cards for a category
  async function fetchAndDisplay(category) {
    const tickers = categoryTickers[category] || [];
    if (!tickers.length) {
      cardsGrid.innerHTML = `<div class="card"><div class="card-content">No tickers found for “${category}.”</div></div>`;
      return;
    }
    footer.textContent = `Loading...`;
    // parallel-fetch all tickers
    const responses = await Promise.all(tickers.map(async ticker => {
      try {
        const res  = await fetch(`https://earnings-predictor.onrender.com/predict?ticker=${encodeURIComponent(ticker)}`);
        if (!res.ok) throw new Error(res.status);
        const json = await res.json();

        // parse name and date
        const name = json.company_name || '';

        // Get earnings date and filter out future dates
        let date = null;
        if (json.days_until != null && json.days_until >= 0) {
          date = new Date(now + json.days_until * MS_PER_DAY);
        } else if (json.earnings_date) {
          const d = new Date(json.earnings_date);
          if (!isNaN(d.getTime())) date = d;
        }

        let expectedEps = null;
        if (json.expected_eps != null) {
          const epsNum = Number(json.expected_eps);
          expectedEps = isNaN(epsNum) ? null : epsNum;
        }

        // compute days until for countdown
        let daysUntil = null;
        if (json.days_until != null && !isNaN(json.days_until)) {
          daysUntil = json.days_until;
        } else if (date) {
          daysUntil = Math.ceil((date - now) / MS_PER_DAY);
        }

        return {
          ticker: ticker,
          name: name,
          logo: json.logo,
          date,
          expected_eps: expectedEps,
          trailing_pe: json.pe_ratio,
          market_cap: json.market_cap,
          beta: json.beta,
          days_until: daysUntil,
          raw_beat_pct: json.raw_beat_pct
        };
      } catch (err) {
        console.warn(`✖️ ${ticker} failed:`, err);
        return { ticker, name: ticker, logo: null, date: null, expected_eps: null, days_until: null, raw_beat_pct: null };
      }
    }));
    resetFooter();

    // filter out nulls, sort by proximity
    const items = responses
      .filter(x => x)
      .sort((a, b) => {
        const aDist = a.date ? Math.abs(a.date - now) : Infinity;
        const bDist = b.date ? Math.abs(b.date - now) : Infinity;
        return aDist - bDist;
      });

    // clear out old cards
    cardsGrid.innerHTML = '';

    // render
    items.forEach(item => {
      const fmtDate = item.date
        ? item.date.toLocaleDateString()
        : 'TBD';
      const fmtESP = item.expected_eps != null
        ? item.expected_eps.toFixed(2)
        : 'TBD';
      const fmtDays = item.days_until != null
        ? item.days_until - 7
        : '–';
      const fmtTPE = formatNumber(item.trailing_pe);
      const fmtBeta = formatNumber(item.beta);
      const fmtMarketCapStr = formatMarketCap(item.market_cap);
      const card = document.createElement('div');
      card.dataset.ticker = item.ticker;
      // choose mode based on presence of raw_beat_pct
      if (typeof item.raw_beat_pct === 'number') {
        card.classList.add('card', 'mode-prediction');
        const pct = item.raw_beat_pct;

        card.innerHTML = `
          <div class="card-content">
            <div class="header-row">
              <div class="logo">
          <img src="${getLogoSrc(item.ticker, item.logo)}" alt="${item.name} logo"/>
              </div>
              <div class="header">
          <h2 class="company">${item.name}</h2>
          <span class="ticker">${item.ticker}</span>
              </div>
            </div>
            <div class="information">
              <div class="details">
          <div class="info">
            <span class="label">Next Earnings:</span>
            <span class="value">${formatEarningsDate(fmtDate)}</span>
          </div>
          <div class="info">
            <span class="label">Expected EPS:</span>
            <span class="value">${fmtESP}</span>
          </div>
          <div class="info">
            <span class="label">Market Cap:</span>
            <span class="value">${fmtMarketCapStr}</span>
          </div>
              </div>
              <div class="visual prediction">
          <svg class="gauge" viewBox="0 0 100 50">
            <path class="bg"
              d="M10,50 A40,40 0 0,1 90,50"
              fill="none"/>
            <path class="fg"
              d="M10,50 A40,40 0 0,1 90,50"
              fill="none"/>
          </svg>
          <div class="percent">${(item.raw_beat_pct).toFixed(1)}%</div>
              </div>
            </div>
          </div>
        `;
        cardsGrid.appendChild(card);
        const fg = card.querySelector('.gauge .fg');
        const length = fg.getTotalLength();
        fg.style.strokeDasharray = length;
        const pctValue = item.raw_beat_pct;
        const pctFraction = pctValue / 100;
        fg.style.strokeDashoffset = length * (1 - pctFraction);
        fg.classList.toggle('red', pctValue < 40);
        fg.classList.toggle('yellow', pctValue >= 40 && pctValue < 60);
        fg.classList.toggle('green', pctValue >= 60);
      } else {
        card.classList.add('card', 'mode-countdown');
        const daysUnit = fmtDays === 1 ? 'day' : 'days';
        card.innerHTML = `
          <div class="card-content">
            <div class="header-row">
              <div class="logo">
          <img src="${getLogoSrc(item.ticker, item.logo)}" alt="${item.name} logo"/>
              </div>
              <div class="header">
          <h2 class="company">${item.name}</h2>
          <span class="ticker">${item.ticker}</span>
              </div>
            </div>
            <div class="information">
              <div class="details">
          <div class="info">
            <span class="label">Next Earnings:</span>
            <span class="value">${formatEarningsDate(fmtDate)}</span>
          </div>
          <div class="info">
            <span class="label">Expected EPS:</span>
            <span class="value">${fmtESP}</span>
          </div>
          <div class="info">
            <span class="label">Market Cap:</span>
            <span class="value">${fmtMarketCapStr}</span>
          </div>
              </div>
              <div class="visual countdown">
          <div class="count">${fmtDays}</div>
          <div class="days">${daysUnit}</div>
          <div class="until">until prediction</div>
              </div>
            </div>
          </div>
        `;
        cardsGrid.appendChild(card);
      }
    });
  }

  // Category buttons
  nav.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    nav.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
    fetchAndDisplay(e.target.textContent);
    searchInput.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  if (!stored) {
    const initial = nav.querySelector('button.selected') || nav.querySelector('button');
    if (initial) {
      initial.click();
    }
  }

  const header = document.querySelector('.header-top h1');
  const allButton = document.getElementById('all-button');
  if (header && allButton) {
    header.addEventListener('click', () => {
      allButton.click();
      showCardsGrid();
      searchInput.value = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      localStorage.removeItem('navScroll');
      nav.scrollTo({ left: 0, behavior: 'smooth' });
      setTimeout(updateFade, 400);
    });
  }

  // Search functionality
  const searchInput   = document.querySelector('.search-box input');
  const searchResults = document.querySelector('.search-results');
  const stocks        = window.searchStocks || [];

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();

    if (!q) {
      searchResults.innerHTML = '';
      return;
    }

    const matches = stocks.filter(s =>
      s.ticker.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q)
    );

    searchResults.innerHTML = matches.map(item => `
      <div class="search-item" data-ticker="${item.ticker}">
        <strong>${item.ticker}</strong> – ${item.name}
      </div>
    `).join('');

    // attach click handlers
    searchResults.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => {
        const ticker = el.dataset.ticker;
        searchResults.innerHTML = '';
        searchInput.value = ticker;
      });
    });
  });

  const searchContainer = document.querySelector('.search-container');
  document.addEventListener('click', (event) => {
    if (!searchContainer.contains(event.target)) {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
    }
  });
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
      return;
    }

    const matches = stocks.filter(s =>
      s.ticker.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q)
    );

    searchResults.innerHTML = matches.map(item => `
      <div class="search-item" data-ticker="${item.ticker}">
        <div class="item-ticker"><strong>${item.ticker}</strong></div>
        <div class="item-name">${item.name}</div>
      </div>
    `).join('');

    // re-attach click handlers to the new items
    searchResults.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => {
        searchInput.value = el.dataset.ticker;
        searchResults.innerHTML = '';
        searchResults.style.display = 'none';
      });
    });

    // show the box if there are results, hide if empty
    searchResults.style.display = matches.length ? 'block' : 'none';
    
    searchResults.innerHTML = matches.map(item => `
      <div class="search-item" data-ticker="${item.ticker}">
        <div class="item-ticker"><strong>${item.ticker}</strong></div>
        <div class="item-name">${item.name}</div>
      </div>
    `).join('');

    searchResults.style.display = matches.length ? 'block' : 'none';

    // now one handler that both sets the input AND navigates to detail
    searchResults.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', async () => {
        const ticker = el.dataset.ticker;
        // clear the dropdown
        searchResults.innerHTML = '';
        searchResults.style.display = 'none';
        // set the input so user sees it
        searchInput.value = ticker;
        // fetch & show detail just like card clicks
        const stock = await fetchFullStockData(ticker);
        showStockDetail(stock);
        searchInput.value = '';
      });
    });
  });

  // when you click or tab back into the input, rerun the filter
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) {
      searchInput.dispatchEvent(new Event('input'));
    }
  });
});