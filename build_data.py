"""
build_data.py — Precompute a static data.json for EarningsX.

This removes the need to host a live API: it pulls the latest data from
Yahoo Finance for every ticker in tickers.json, runs the trained CatBoost
model to produce a beat-probability whenever earnings are within 7 days,
and writes everything the frontend needs into data.json.

Run periodically (e.g. weekly, or via a cron/GitHub Action) to refresh:

    ./venv/bin/python build_data.py

Output: data.json  ->  { "AAPL": { ...fields... }, ... }
"""

import json
import time
import pickle
import warnings
from pathlib import Path
from datetime import timedelta

import numpy as np
import pandas as pd
import yfinance as yf
from catboost import CatBoostClassifier, Pool

from features import build_feature_row, get_close_volume, to_series, CAT_FEATURES

warnings.filterwarnings("ignore")

ROOT = Path(__file__).parent
MODEL_PATH = ROOT / "catboost_model.cbm"
TICKERS_PATH = ROOT / "tickers.json"
CALIB_PATH = ROOT / "calibration.json"
PUBLIC = ROOT / "public"
PUBLIC.mkdir(exist_ok=True)
OUT_PATH = PUBLIC / "data.json"


def load_calibration():
    try:
        c = json.load(open(CALIB_PATH))
        return float(c.get("temperature", 1.0))
    except Exception:
        return 1.0


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def load_tickers():
    with open(TICKERS_PATH) as f:
        cats = json.load(f)
    seen, order = set(), []
    for arr in cats.values():
        for t in arr:
            if t not in seen:
                seen.add(t)
                order.append(t)
    return order


def clean_num(x, ndigits=2):
    """Return a JSON-safe rounded float, or None."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if np.isnan(v) or np.isinf(v):
        return None
    return round(v, ndigits)


def as_series(obj, index):
    if getattr(obj, "ndim", 1) != 1:
        return pd.Series(np.asarray(obj).squeeze(), index=index)
    return obj


def next_earnings(stock, today):
    """Return (date_str, days_until, next_dt) for the next earnings date."""
    cal = stock.calendar
    raw = []
    if isinstance(cal, dict):
        cand = cal.get("Earnings Date") or cal.get("earningsDate")
        if cand is not None:
            raw = cand if isinstance(cand, (list, np.ndarray)) else [cand]
    elif isinstance(cal, pd.DataFrame) and not cal.empty and "Earnings Date" in cal.index:
        raw = [cal.loc["Earnings Date"].iat[0]]

    dates = []
    for d in raw:
        try:
            ts = pd.to_datetime(d)
            ts = ts.tz_convert(None) if ts.tzinfo else ts.tz_localize(None)
            dates.append(ts.normalize())
        except Exception:
            continue

    future = [d for d in dates if d >= today]
    if not future:
        return "TBD", None, None
    nxt = min(future)
    return nxt.strftime("%Y-%m-%d"), int((nxt - today).days), nxt


def earnings_history(ticker):
    """Past reports (most recent first). Reuses getData.py's cache if present."""
    cache_file = ROOT / ".cache" / f"earn_{ticker}.pkl"
    hist = None
    if cache_file.exists():
        try:
            hist = pickle.load(open(cache_file, "rb"))
        except Exception:
            hist = None
    if hist is None:
        try:
            hist = yf.Ticker(ticker).get_earnings_dates(limit=40)
        except Exception:
            return None
    if hist is None or not len(hist):
        return None
    hist = hist.copy()
    hist.index = pd.to_datetime(hist.index)
    if hist.index.tz is not None:
        hist.index = hist.index.tz_convert(None)
    return hist.sort_index(ascending=False)


def compute_prediction(ticker, sector, beta_raw, eps_est, next_dt,
                       price_df, spy_close, model, temperature):
    """Build features via the shared pipeline, predict, apply temperature scaling."""
    cutoff = next_dt - timedelta(days=7)
    price = price_df[price_df.index <= cutoff]
    if len(price) < 50:
        return None
    close, volume = get_close_volume(price)
    if len(close) < 50:
        return None
    spy_cut = spy_close[spy_close.index <= cutoff]

    hist = earnings_history(ticker)
    past = hist[hist.index < next_dt].head(8) if hist is not None else None

    row = build_feature_row(sector, beta_raw, eps_est, next_dt, close, volume, spy_cut, past)
    for c in CAT_FEATURES:
        row[c] = "NA" if row.get(c) is None else str(row[c])

    pool = Pool(pd.DataFrame([row]), cat_features=CAT_FEATURES)
    logit = float(model.predict(pool, prediction_type="RawFormulaVal")[0])
    prob = sigmoid(logit / temperature)
    return round(prob * 100, 2)


def main():
    tickers = load_tickers()
    print(f"Building data for {len(tickers)} tickers...")

    model = CatBoostClassifier()
    model.load_model(str(MODEL_PATH))
    temperature = load_calibration()
    print(f"Using calibration temperature T = {temperature:.3f}")

    today = pd.Timestamp.now().normalize()

    # Reuse getData.py's cached history if available (fast, avoids rate limits);
    # otherwise batch-download once.
    cache = ROOT / ".cache"
    prices_cache = cache / "prices_all.pkl"
    spy_cache = cache / "spy.pkl"
    if prices_cache.exists() and spy_cache.exists():
        print("Reusing cached price history from .cache/ ...")
        prices = pickle.load(open(prices_cache, "rb"))
        spy = pickle.load(open(spy_cache, "rb"))
    else:
        print("Downloading price history (batched)...")
        prices = yf.download(tickers, start="2013-01-01", auto_adjust=True,
                             group_by="ticker", progress=False, threads=True)
        spy = yf.download("SPY", start="2013-01-01", auto_adjust=True, progress=False)
    spy_close = to_series(spy["Close"]).dropna()

    out = {}
    for i, ticker in enumerate(tickers, 1):
        try:
            stock = yf.Ticker(ticker)
            info = stock.info or {}

            name = info.get("longName") or info.get("shortName") or ticker
            website = info.get("website")
            logo = None
            if website:
                domain = website.replace("https://", "").replace("http://", "").split("/")[0]
                logo = f"https://logo.clearbit.com/{domain}?size=512"

            sector = info.get("sector")
            beta_raw = info.get("beta")
            eps_raw = info.get("forwardEps")
            try:
                eps_est = round(float(eps_raw), 2)
            except (TypeError, ValueError):
                eps_est = None

            date_str, days_until, next_dt = next_earnings(stock, today)

            entry = {
                "ticker": ticker,
                "company_name": name,
                "description": info.get("longBusinessSummary", ""),
                "beta": clean_num(beta_raw),
                "pe_ratio": clean_num(info.get("trailingPE")),
                "sector": sector,
                "industry": info.get("industry"),
                "market_cap": info.get("marketCap"),
                "website": website,
                "logo": logo,
                "earnings_date": date_str,
                "expected_eps": eps_est,
                "days_until": days_until,
                "raw_beat_pct": None,
            }

            # Prediction only makes sense within a week of earnings.
            if days_until is not None and days_until <= 7 and next_dt is not None:
                try:
                    pdf = prices[ticker] if ticker in prices.columns.get_level_values(0) else None
                except Exception:
                    pdf = None
                if pdf is not None and not pdf.dropna(how="all").empty:
                    entry["raw_beat_pct"] = compute_prediction(
                        ticker, sector, beta_raw, eps_est, next_dt, pdf,
                        spy_close, model, temperature
                    )

            out[ticker] = entry
            tag = f"{entry['raw_beat_pct']}%" if entry["raw_beat_pct"] is not None else (
                f"{days_until}d" if days_until is not None else "TBD")
            print(f"  [{i:>3}/{len(tickers)}] {ticker:<6} {name[:28]:<28} {tag}")
        except Exception as e:
            print(f"  [{i:>3}/{len(tickers)}] {ticker:<6} FAILED: {e}")
            out[ticker] = {"ticker": ticker, "company_name": ticker, "error": True}
        time.sleep(0.4)  # be polite to Yahoo

    payload = {
        "generated_at": today.strftime("%Y-%m-%d"),
        "count": len(out),
        "stocks": out,
    }
    with open(OUT_PATH, "w") as f:
        json.dump(payload, f, indent=2, default=str)
    print(f"\nWrote {OUT_PATH} ({len(out)} stocks)")


if __name__ == "__main__":
    main()
