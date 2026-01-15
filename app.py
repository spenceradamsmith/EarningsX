import os
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import timedelta
from ta.momentum import RSIIndicator
from ta.trend import MACD, SMAIndicator
from catboost import CatBoostClassifier, Pool
from flask import Flask, jsonify, request
from flask_cors import CORS
from pathlib import Path

app = Flask(__name__)
CORS(app)

MODEL_PATH = Path(__file__).with_name("catboost_model.cbm")
model = None

def get_model():
    global model
    if model is None:
        m = CatBoostClassifier()
        m.load_model(str(MODEL_PATH))
        model = m
    return model

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
        price_data = yf.download(ticker, start="2013-01-01", end=(cutoff + timedelta(days=1)), auto_adjust=True, progress=False)
        spy_data = yf.download("SPY", start="2013-01-01", end=(cutoff + timedelta(days=1)), auto_adjust=True, progress=False)
        price_data = price_data[price_data.index <= cutoff]
        spy_data = spy_data[spy_data.index <= cutoff]

        close = price_data["Close"]
        volume = price_data["Volume"]
        if getattr(close, "ndim", 1) != 1:
            close = pd.Series(close.values.squeeze(), index=price_data.index)
        if getattr(volume, "ndim", 1) != 1:
            volume = pd.Series(volume.values.squeeze(), index=price_data.index)

        # Technical indicators
        rsi = RSIIndicator(close, window=14).rsi().iloc[-1]
        macd_diff = MACD(close).macd_diff().iloc[-1]
        sma20 = SMAIndicator(close, 20).sma_indicator().iloc[-1]
        sma50 = SMAIndicator(close, 50).sma_indicator().iloc[-1]
        sma_ratio = sma20 / sma50 if sma50 != 0 else np.nan

        # Returns and volatility
        if len(close) >= 30:
            price_ret_30d = close.iloc[-1] / close.iloc[-30] - 1
            volatility_30d = close[-30:].pct_change().std()
            vol_avg = volume[-30:].mean()
            vol_max = volume[-30:].max()
            vol_norm = vol_avg / vol_max if vol_max != 0 else np.nan
        else:
            price_ret_30d = np.nan
            volatility_30d = np.nan
            vol_norm = np.nan

        price_ret_7d = close.iloc[-7] / close.iloc[-14] - 1 if len(close) >= 14 else np.nan

        # SPY return
        spy_close = spy_data["Close"]
        spy_return = float(spy_close.iloc[-1] / spy_close.iloc[-30] - 1) if len(spy_close) >= 30 else 0.0

        price_to_avg30d = close.iloc[-1] / close.iloc[-30:].mean() if len(close) >= 30 else np.nan

        # Earnings history and surprise
        history = stock.get_earnings_dates(limit=40)
        history.index = pd.to_datetime(history.index)
        if history.index.tzinfo is not None:
            history.index = history.index.tz_convert(None)
        past = history[history.index < next_dt].sort_index(ascending=False).head(4)
        if len(past) >= 1:
            eps_surprises = (past["Reported EPS"] - past["EPS Estimate"]) / past["EPS Estimate"]
            eps_surprise_avg = eps_surprises.mean()
        else:
            eps_surprise_avg = np.nan

        feature_row = {
            "sector": sector,
            "beta": beta_raw,
            "eps_estimate": eps_est,
            "price_to_avg_30d": price_to_avg30d,
            "eps_surprise_avg": eps_surprise_avg,
            "price_return_30d": price_ret_30d,
            "price_return_7d_before_cutoff": price_ret_7d,
            "rsi_14": rsi,
            "macd_diff": macd_diff,
            "sma_ratio_20_50": sma_ratio,
            "volatility_30d": volatility_30d,
            "volume_avg_30d": vol_norm,
            "spy_return": spy_return,
            "relative_return_30d": price_ret_30d - spy_return,
            "quarter": next_dt.quarter,
            "day_of_week": next_dt.weekday(),
        }
        df = pd.DataFrame([feature_row])
        pool = Pool(data=df, cat_features=["sector", "quarter", "day_of_week"])

        # Predict probability
        m = get_model()
        prob = m.predict_proba(pool)[:, 1][0]
        raw_pct = prob * 100

        # Rescale probability
        thresh = 0.57
        if prob >= thresh:
            scaled_val = 0.5 + (prob - thresh) / (1 - thresh) * 0.5
        else:
            scaled_val = (prob / thresh) * 0.5
        scaled_pct = scaled_val * 100

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
            "scaled_beat_pct": round(scaled_pct, 2),
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