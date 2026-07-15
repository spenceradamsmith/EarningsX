import os
import json
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import timedelta
from catboost import CatBoostClassifier, Pool
from flask import Flask, jsonify, request
from flask_cors import CORS
from pathlib import Path

from features import build_feature_row, get_close_volume, to_series, CAT_FEATURES

app = Flask(__name__)
CORS(app)

MODEL_PATH = Path(__file__).with_name("catboost_model.cbm")
CALIB_PATH = Path(__file__).with_name("calibration.json")
model = None

def get_model():
    global model
    if model is None:
        m = CatBoostClassifier()
        m.load_model(str(MODEL_PATH))
        model = m
    return model

def get_temperature():
    try:
        return float(json.load(open(CALIB_PATH)).get("temperature", 1.0))
    except Exception:
        return 1.0

def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))

@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200

@app.route("/predict")
def predict():
    # Get ticker parameter
    ticker_param = request.args.get("ticker")
    ticker = ticker_param.upper() if ticker_param else "NKE"

    # Fetch stock info
    stock = yf.Ticker(ticker)
    info = stock.info or {}

    # Company name
    company_name = info.get("longName") or info.get("shortName") or ticker

    # Website and logo
    website = info.get("website")
    if website:
        domain = website.replace("https://", "").replace("http://", "").split("/")[0]
        logo = f"https://logo.clearbit.com/{domain}?size=512"
    else:
        logo = None

    # Description
    description = info.get("longBusinessSummary", "")

    # Beta value
    beta_raw = info.get("beta")
    beta_value = round(beta_raw, 2) if isinstance(beta_raw, (float, int)) and not np.isnan(beta_raw) else None

    # P/E ratio, sector, industry, and market cap
    pe_raw = info.get("trailingPE")
    pe_ratio = round(pe_raw, 2) if isinstance(pe_raw, (float, int)) and not np.isnan(pe_raw) else None
    sector = info.get("sector")
    industry = info.get("industry")
    market_cap = info.get("marketCap")

    # Determine next earnings date
    today = pd.Timestamp.now().normalize()
    earnings_date_str = "TBD"
    days_until = None
    next_dt = None
    
    cal = stock.calendar
    raw_dates = []
    if isinstance(cal, dict):
        # old style (dict) API
        candidate = cal.get("Earnings Date") or cal.get("earningsDate")
        if candidate is not None:
            items = candidate if isinstance(candidate, (list, np.ndarray)) else [candidate]
            raw_dates = items
    elif isinstance(cal, pd.DataFrame) and not cal.empty:
        # new style (DataFrame) API
        if "Earnings Date" in cal.index:
            val = cal.loc["Earnings Date"].iat[0]
            raw_dates = [val]

    all_dates = []
    raw_vals = raw_dates
    for d in raw_vals:
        try:
            ts = pd.to_datetime(d)
            if ts.tzinfo is not None:
                ts = ts.tz_convert(None)
            else:
                ts = ts.tz_localize(None)
            ts = ts.normalize()
            all_dates.append(ts)
        except Exception:
            continue
        
    # Filter to future dates
    future_dates = [d for d in all_dates if d >= today]
    if future_dates:
        next_dt = min(future_dates)
        earnings_date_str = next_dt.strftime("%Y-%m-%d")
        days_until = (next_dt - today).days
  
    # Forward EPS estimate
    eps_raw = info.get("forwardEps")
    try:
        eps_val = float(eps_raw)
        eps_est = round(eps_val, 2)
    except Exception:
        eps_est = "TBD"

    # If earnings are more than a week away, prompt to check back
    if isinstance(days_until, int) and days_until > 7:
        wait_days = days_until - 7
        check_date = (today + timedelta(days=wait_days)).strftime("%Y-%m-%d")
        message = (
            f"{ticker}'s next earnings ({earnings_date_str}) are in {days_until} days. "
            f"Check back in {wait_days} day(s), on {check_date} for a prediction."
        )
        response = {
            "company_name": company_name,
            "ticker": ticker,
            "description": description,
            "beta": beta_value,
            "pe_ratio": pe_ratio,
            "sector": sector,
            "industry": industry,
            "market_cap": market_cap,
            "website": website,
            "logo": logo,
            "earnings_date": earnings_date_str,
            "expected_eps": eps_est,
            "days_until": days_until,
            "message": message
        }
        return jsonify(response), 200

    # If earnings within a week, compute prediction
    if isinstance(days_until, int) and days_until <= 7 and next_dt is not None:
        cutoff = next_dt - timedelta(days=7)
        end = cutoff + timedelta(days=1)
        price_data = yf.download(ticker, start="2013-01-01", end=end, auto_adjust=True, progress=False)
        spy_data = yf.download("SPY", start="2013-01-01", end=end, auto_adjust=True, progress=False)
        price_data = price_data[price_data.index <= cutoff]
        spy_data = spy_data[spy_data.index <= cutoff]

        close, volume = get_close_volume(price_data)
        spy_close = to_series(spy_data["Close"]).dropna()

        # Earnings history for surprise + historical beat rate
        try:
            history = stock.get_earnings_dates(limit=40)
            history.index = pd.to_datetime(history.index)
            if history.index.tz is not None:
                history.index = history.index.tz_convert(None)
            past = history[history.index < next_dt].sort_index(ascending=False).head(8)
        except Exception:
            past = None

        feature_row = build_feature_row(sector, beta_raw, eps_est, next_dt,
                                        close, volume, spy_close, past)
        for c in CAT_FEATURES:
            feature_row[c] = "NA" if feature_row.get(c) is None else str(feature_row[c])

        pool = Pool(data=pd.DataFrame([feature_row]), cat_features=CAT_FEATURES)

        # Predict + temperature-scaled (calibrated) probability
        m = get_model()
        logit = float(m.predict(pool, prediction_type="RawFormulaVal")[0])
        prob = sigmoid(logit / get_temperature())
        raw_pct = prob * 100

        response = {
            "company_name": company_name,
            "ticker": ticker,
            "description": description,
            "beta": beta_value,
            "pe_ratio": pe_ratio,
            "sector": sector,
            "industry": industry,
            "market_cap": market_cap,
            "website": website,
            "logo": logo,
            "earnings_date": earnings_date_str,
            "expected_eps": eps_est,
            "raw_beat_pct": round(raw_pct, 2),
            "days_until": days_until
        }
        return jsonify(response), 200

    # If no upcoming earnings or data unavailable
    response = {
        "company_name": company_name,
        "ticker": ticker,
        "description": description,
        "beta": beta_value,
        "pe_ratio": pe_ratio,
        "sector": sector,
        "industry": industry,
        "market_cap": market_cap,
        "website": website,
        "logo": logo,
        "earnings_date": "TBD",
        "expected_eps": "TBD",
        "days_until": None
    }
    return jsonify(response), 200

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)