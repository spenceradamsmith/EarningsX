"""
getData.py — Build training_dataset.csv from Yahoo Finance.

Pulls the full ticker universe from tickers.json (far more than the original
50 names) so the model trains on more data. To survive Yahoo's rate limits it:
  - downloads price history in batches,
  - fetches per-ticker earnings history & info in small chunks with retries,
  - caches every raw pull under .cache/ so the run is resumable (just re-run
    it if it dies partway; cached tickers are skipped instantly).

    ./venv/bin/python getData.py
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

from features import get_close_volume, technical_features, eps_history_features, to_series, FEATURE_ORDER

warnings.filterwarnings("ignore")

ROOT = Path(__file__).parent
CACHE = ROOT / ".cache"
CACHE.mkdir(exist_ok=True)

CHUNK = 15          # tickers per earnings/info batch
SLEEP_BETWEEN = 2.0  # seconds between chunks
RETRIES = 3


def load_tickers():
    cats = json.load(open(ROOT / "tickers.json"))
    seen, order = set(), []
    for arr in cats.values():
        for t in arr:
            if t not in seen:
                seen.add(t)
                order.append(t)
    return order


def cached(name, fn):
    """Memoize a pull to .cache/<name>.pkl so reruns skip network."""
    path = CACHE / f"{name}.pkl"
    if path.exists():
        try:
            return pickle.load(open(path, "rb"))
        except Exception:
            pass
    val = fn()
    if val is not None:
        pickle.dump(val, open(path, "wb"))
    return val


def fetch_earnings(ticker):
    def _pull():
        for attempt in range(RETRIES):
            try:
                ed = yf.Ticker(ticker).get_earnings_dates(limit=40)
                if ed is not None and len(ed):
                    return ed
            except Exception as e:
                print(f"    {ticker} earnings retry {attempt+1}: {e}")
                time.sleep(3 * (attempt + 1))
        return None
    return cached(f"earn_{ticker}", _pull)


def fetch_info(ticker):
    def _pull():
        for attempt in range(RETRIES):
            try:
                info = yf.Ticker(ticker).info
                if info:
                    return {"sector": info.get("sector"), "beta": info.get("beta")}
            except Exception as e:
                print(f"    {ticker} info retry {attempt+1}: {e}")
                time.sleep(3 * (attempt + 1))
        return {"sector": np.nan, "beta": np.nan}
    return cached(f"info_{ticker}", _pull)


def build_earnings_frame(tickers):
    frames = []
    for start in range(0, len(tickers), CHUNK):
        chunk = tickers[start:start + CHUNK]
        print(f"Earnings chunk {start // CHUNK + 1}: {chunk}")
        for t in chunk:
            ed = fetch_earnings(t)
            if ed is None:
                print(f"    ! no earnings for {t}")
                continue
            ed = ed.copy()
            ed["ticker"] = t
            frames.append(ed.reset_index().rename(columns={"index": "Earnings Date"}))
        time.sleep(SLEEP_BETWEEN)

    df = pd.concat(frames).reset_index(drop=True)
    df["beat"] = (df["Reported EPS"] > df["EPS Estimate"]).astype(int)
    df["Earnings Date"] = pd.to_datetime(df["Earnings Date"]).dt.tz_localize(None)
    df = df.dropna(subset=["Reported EPS", "EPS Estimate"])
    df = df[df["Earnings Date"] <= pd.Timestamp.now().normalize()]
    return df


def main():
    tickers = load_tickers()
    print(f"Building training data from {len(tickers)} tickers...")

    print("Downloading price history (batched)...")
    prices = cached("prices_all", lambda: yf.download(
        tickers, start="2013-01-01", group_by="ticker", progress=False, threads=True))
    spy = cached("spy", lambda: yf.download(
        "SPY", start="2013-01-01", auto_adjust=True, progress=False))

    earnings_df = build_earnings_frame(tickers)
    print(f"Collected {len(earnings_df)} earnings rows across "
          f"{earnings_df['ticker'].nunique()} tickers.")

    features = []
    for _, row in earnings_df.iterrows():
        ticker = row["ticker"]
        edate = pd.to_datetime(row["Earnings Date"])
        cutoff = edate - timedelta(days=7)
        try:
            if ticker not in prices.columns.get_level_values(0):
                continue
            stock = prices[ticker]
            stock = stock[stock.index <= cutoff]
            if len(stock) < 50:
                continue

            close, volume = get_close_volume(stock)
            if len(close) < 50:
                continue

            past = earnings_df[(earnings_df["ticker"] == ticker) &
                               (earnings_df["Earnings Date"] < edate)] \
                .sort_values("Earnings Date", ascending=False).head(8)

            spy_close = to_series(spy[spy.index <= cutoff]["Close"]).dropna()

            meta = fetch_info(ticker)

            feat = {
                "ticker": ticker,
                "earnings_date": edate.date(),
                "sector": meta.get("sector", np.nan),
                "beta": meta.get("beta", np.nan),
                "eps_estimate": row["EPS Estimate"],
                "quarter": edate.quarter,
                "day_of_week": edate.weekday(),
            }
            feat.update(eps_history_features(past))
            feat.update(technical_features(close, volume, spy_close))
            feat["beat"] = row["beat"]
            features.append(feat)
        except Exception as e:
            print(f"  error {ticker} {edate.date()}: {e}")

    out = pd.DataFrame(features)
    out.to_csv(ROOT / "training_dataset.csv", index=False)
    print(f"\nWrote training_dataset.csv: {len(out)} rows, "
          f"{out['ticker'].nunique()} tickers, beat rate {out['beat'].mean():.1%}")


if __name__ == "__main__":
    main()
