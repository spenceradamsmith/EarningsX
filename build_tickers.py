"""
build_tickers.py — finalize tickers.json from real market-cap data.

tickers.json starts as a hand-picked *candidate* universe. After build_data.py
fetches each name's real sector and market cap, this script regroups every
covered stock into its true sector and orders each category by market cap
(largest first). "All" becomes the global top names by market cap.

    ./venv/bin/python build_data.py      # fetch data for the candidate universe
    ./venv/bin/python build_tickers.py   # rewrite tickers.json by market cap

Run the frontend build afterwards so the nav picks up the new lists.
"""

import json
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "public" / "data.json"
OUT = ROOT / "tickers.json"

PER_CATEGORY = 30
ALL_COUNT = 30

# yfinance sector -> our UI category name.
SECTOR_MAP = {
    "Technology": "Technology",
    "Financial Services": "Financials",
    "Consumer Cyclical": "Consumer Discretionary",
    "Healthcare": "Healthcare",
    "Communication Services": "Communication Services",
    "Industrials": "Industrials",
    "Consumer Defensive": "Consumer Staples",
    "Energy": "Energy",
    "Utilities": "Utilities",
    "Real Estate": "Real Estate",
    "Basic Materials": "Materials",
}
UI_ORDER = ["Technology", "Financials", "Consumer Discretionary", "Healthcare",
            "Communication Services", "Industrials", "Consumer Staples",
            "Energy", "Utilities", "Real Estate", "Materials"]


def main():
    stocks = json.load(open(DATA))["stocks"]

    ranked = []  # (market_cap, ticker, ui_category)
    buckets = {c: [] for c in UI_ORDER}
    for t, s in stocks.items():
        cap = s.get("market_cap")
        cat = SECTOR_MAP.get(s.get("sector"))
        if not cap or not cat:
            continue
        ranked.append((cap, t))
        buckets[cat].append((cap, t))

    out = {}
    ranked.sort(reverse=True)
    out["All"] = [t for _, t in ranked[:ALL_COUNT]]
    for cat in UI_ORDER:
        members = sorted(buckets[cat], reverse=True)[:PER_CATEGORY]
        out[cat] = [t for _, t in members]

    json.dump(out, open(OUT, "w"), indent=2)
    print(f"Wrote tickers.json — All={len(out['All'])}, " +
          ", ".join(f"{c}={len(out[c])}" for c in UI_ORDER))


if __name__ == "__main__":
    main()
