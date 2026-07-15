# EarningsX

**EarningsX is an AI-powered stock earnings-beat predictor.** Search any stock and,
within a week of its earnings, see a calibrated AI probability of whether it will
beat its expected EPS — plus a live price chart and key fundamentals.

---

## Features

- **AI beat predictions** — a calibrated probability (temperature-scaled) shown on a
  color-coded gauge once earnings are ≤7 days away; a countdown until then.
- **~300 companies** across the market, ranked **by market cap** in the *All* tab and
  in each of 11 sectors. Search covers ~2,700 tickers.
- **Live price charts** — an embedded TradingView chart on every stock's detail page
  (no API key required).
- **Runs with zero backend.** Predictions are precomputed into `public/data.json`, so
  the site is a fully static React app that can't go down when an API does. A GitHub
  Action refreshes the data every weekday morning.

---

## How it works

```
tickers.json ──► getData.py ────► training_dataset.csv ──► trainModel.py ──► catboost_model.cbm
   (universe)                                                                 + calibration.json
       │                                                                             │
       └──────────────► build_data.py ──► public/data.json ◄── uses model + calibration
                             ▲                    │
                    build_tickers.py              ▼
              (re-rank membership by cap)   React (Vite) app  ──►  static site
```

- **`features.py`** — one shared feature pipeline used by training *and* serving, so the
  model can never be trained on features that differ from what it's served.
- **`build_data.py`** — pulls fresh Yahoo Finance data, runs the model, writes the static
  `data.json`. Reruns on a schedule via `.github/workflows/update-data.yml`.
- **`app.py`** — an *optional* Flask API (identical features/calibration). Deploy it and set
  `VITE_EARNINGS_API` to prefer live data, with the static file as fallback.

## The model

- **Type:** CatBoost gradient-boosted trees — best fit for this small, tabular,
  categorical-heavy dataset (native categorical handling; outperforms neural nets / LSTMs,
  which suit long raw sequences rather than fixed pre-earnings feature snapshots).
- **Data:** last ~40 quarters for **220 companies** (≈9,500 labeled reports), up from 50.
- **Features (19):** sector, beta, EPS estimate, **historical beat-rate (top signal)**,
  avg EPS surprise, 30/7/90-day momentum, RSI, MACD, SMA ratio, volatility, volume
  surge, SPY & relative return, quarter, day-of-week.
- **Evaluation (time-based split — train on the past, test on the newest quarters):**
  AUC **0.71**, accuracy **74.9%**; when the calibrated probability is ≥70%, the stock
  actually beats **~81%** of the time.
- **Calibration:** temperature scaling (T≈0.85) so the displayed % is a real probability.

## Develop

```bash
npm install
npm run dev          # React dev server

python -m venv venv && ./venv/bin/pip install -r .github/requirements.txt
./venv/bin/python getData.py       # (re)build training data   [slow: pulls Yahoo]
./venv/bin/python trainModel.py    # train + calibrate + print metrics
./venv/bin/python build_data.py    # regenerate public/data.json
./venv/bin/python build_tickers.py # re-rank category membership by market cap

npm run build        # static build -> dist/  (deploy to Netlify/GitHub Pages/S3)
```

## Technologies

- **Frontend:** React + Vite, vanilla CSS (dark theme), TradingView embed
- **ML / data:** Python, CatBoost, scikit-learn, pandas, `ta`, yfinance
- **Optional API:** Flask (`app.py`)
- **Automation:** GitHub Actions (daily data refresh)
