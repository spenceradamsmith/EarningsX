"""
features.py — the single source of truth for model features.

Imported by getData.py (training), build_data.py (static inference) and
app.py (live API) so the feature computation can never drift between how the
model is trained and how it is served.

Weekend / holiday handling: every window here indexes by *trading rows*
(yfinance only returns trading days), so e.g. close.iloc[-30] is 30 trading
days back, never a calendar offset that could land on a closed market.
"""

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, SMAIndicator

# Categorical features passed to CatBoost.
CAT_FEATURES = ["sector", "quarter", "day_of_week"]

# Canonical column order for a feature row.
FEATURE_ORDER = [
    "sector", "beta", "eps_estimate", "price_to_avg_30d", "eps_surprise_avg",
    "beat_rate_last_8", "price_return_30d", "price_return_7d_before_cutoff",
    "price_return_90d", "rsi_14", "macd_diff", "sma_ratio_20_50",
    "volatility_30d", "volume_avg_30d", "volume_trend", "spy_return",
    "relative_return_30d", "quarter", "day_of_week",
]


def to_series(obj, index=None):
    """Coerce a possibly 2-D / MultiIndex-column slice into a 1-D Series."""
    if isinstance(obj, pd.DataFrame):
        obj = obj.iloc[:, 0]
    if getattr(obj, "ndim", 1) != 1:
        obj = pd.Series(np.asarray(obj).squeeze(), index=index)
    return obj


def get_close_volume(df):
    close = to_series(df["Close"]).dropna()
    volume = to_series(df["Volume"]).dropna()
    return close, volume


def technical_features(close, volume, spy_close):
    """Price/volume/technical features from trading-day series up to the cutoff."""
    f = {}
    f["rsi_14"] = RSIIndicator(close, 14).rsi().iloc[-1]
    f["macd_diff"] = MACD(close).macd_diff().iloc[-1]

    sma20 = SMAIndicator(close, 20).sma_indicator().iloc[-1]
    sma50 = SMAIndicator(close, 50).sma_indicator().iloc[-1]
    f["sma_ratio_20_50"] = sma20 / sma50 if sma50 else np.nan

    f["price_return_30d"] = close.iloc[-1] / close.iloc[-30] - 1 if len(close) >= 30 else np.nan
    f["price_return_7d_before_cutoff"] = close.iloc[-7] / close.iloc[-14] - 1 if len(close) >= 14 else np.nan
    f["price_return_90d"] = close.iloc[-1] / close.iloc[-90] - 1 if len(close) >= 90 else np.nan

    f["volatility_30d"] = close[-30:].pct_change().std()

    vol_avg = volume[-30:].mean()
    vol_max = volume[-30:].max()
    f["volume_avg_30d"] = vol_avg / vol_max if vol_max else np.nan
    vol_recent = volume[-10:].mean()
    f["volume_trend"] = vol_recent / vol_avg if vol_avg else np.nan  # recent surge vs 30d

    f["price_to_avg_30d"] = close.iloc[-1] / close[-30:].mean() if len(close) >= 30 else np.nan

    spy_return = float(spy_close.iloc[-1] / spy_close.iloc[-30] - 1) if len(spy_close) >= 30 else np.nan
    f["spy_return"] = spy_return
    f["relative_return_30d"] = f["price_return_30d"] - spy_return
    return f


def eps_history_features(past):
    """
    Given a DataFrame of past reports (columns 'Reported EPS', 'EPS Estimate'),
    most-recent first, compute the avg EPS surprise and historical beat rate.
    """
    out = {"eps_surprise_avg": np.nan, "beat_rate_last_8": np.nan}
    if past is None or len(past) == 0:
        return out
    est = past["EPS Estimate"].astype(float)
    rep = past["Reported EPS"].astype(float)
    valid = est.notna() & rep.notna() & (est != 0)
    if valid.any():
        recent4 = valid[valid].index[:4]
        out["eps_surprise_avg"] = ((rep[recent4] - est[recent4]) / est[recent4]).mean()
        out["beat_rate_last_8"] = (rep[valid] > est[valid]).astype(int).mean()
    return out


def build_feature_row(sector, beta, eps_estimate, next_dt, close, volume, spy_close, past):
    """Assemble a full, ordered feature row for a single prediction."""
    row = {
        "sector": sector,
        "beta": beta,
        "eps_estimate": eps_estimate if isinstance(eps_estimate, (int, float)) else np.nan,
        "quarter": int(next_dt.quarter),
        "day_of_week": int(next_dt.weekday()),
    }
    row.update(eps_history_features(past))
    row.update(technical_features(close, volume, spy_close))
    return {k: row.get(k, np.nan) for k in FEATURE_ORDER}
