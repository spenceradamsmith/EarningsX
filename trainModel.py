"""
trainModel.py — train + calibrate the earnings-beat model.

Model type: CatBoostClassifier (gradient-boosted trees). Kept because the
data is tabular with native categorical features (sector, quarter,
day_of_week) and modest size — exactly what CatBoost handles best, with
strong out-of-the-box accuracy and built-in categorical handling.

Improvements over the original:
  - trains on the full 200+ ticker universe (see getData.py), not 50,
  - adds features (historical beat rate, 90d momentum, volume surge) via
    features.py,
  - uses a TIME-BASED split (train on the past, test on the most recent
    quarters) so the reported accuracy reflects real forward performance
    rather than a random shuffle that can leak look-alike quarters,
  - applies TEMPERATURE SCALING so the displayed "beat %" is a calibrated
    probability, not a raw score. The temperature is saved to
    calibration.json and applied identically at serving time.
"""

import json
import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from sklearn.metrics import (roc_auc_score, accuracy_score, precision_score,
                             recall_score, f1_score, brier_score_loss,
                             confusion_matrix, classification_report, log_loss)
from catboost import CatBoostClassifier, Pool

from features import CAT_FEATURES

RANDOM_SEED = 42
THRESHOLD = 0.5  # decision threshold on the calibrated probability


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def fit_temperature(logits, labels):
    """Find T>0 minimizing NLL of sigmoid(logit / T) — Platt temperature scaling."""
    def nll(T):
        p = np.clip(sigmoid(logits / T), 1e-7, 1 - 1e-7)
        return log_loss(labels, p)
    res = minimize_scalar(nll, bounds=(0.05, 10.0), method="bounded")
    return float(res.x)


def main():
    df = pd.read_csv("training_dataset.csv", parse_dates=["earnings_date"])
    df = df.sort_values("earnings_date").reset_index(drop=True)

    # CatBoost wants categoricals as strings (no NaN in cat columns).
    for c in CAT_FEATURES:
        df[c] = df[c].fillna("NA").astype(str)

    X = df.drop(columns=["ticker", "earnings_date", "beat"])
    y = df["beat"].astype(int)

    # Time-based split: past -> future.
    n = len(df)
    i_train, i_valid = int(n * 0.70), int(n * 0.85)
    X_train, y_train = X.iloc[:i_train], y.iloc[:i_train]
    X_valid, y_valid = X.iloc[i_train:i_valid], y.iloc[i_train:i_valid]
    X_test, y_test = X.iloc[i_valid:], y.iloc[i_valid:]
    print(f"Rows: {n} | train {len(X_train)} | valid {len(X_valid)} | test {len(X_test)}")
    print(f"Beat base rate — train {y_train.mean():.1%}, test {y_test.mean():.1%}")

    train_pool = Pool(X_train, y_train, cat_features=CAT_FEATURES)
    valid_pool = Pool(X_valid, y_valid, cat_features=CAT_FEATURES)
    test_pool = Pool(X_test, y_test, cat_features=CAT_FEATURES)

    model = CatBoostClassifier(
        iterations=600,
        learning_rate=0.03,
        depth=5,
        l2_leaf_reg=3,
        eval_metric="AUC",
        random_seed=RANDOM_SEED,
        early_stopping_rounds=60,
        verbose=100,
    )
    model.fit(train_pool, eval_set=valid_pool)
    model.save_model("catboost_model.cbm")

    # ── Temperature scaling on the validation set ───────────────────────────
    valid_logits = model.predict(valid_pool, prediction_type="RawFormulaVal")
    T = fit_temperature(valid_logits, y_valid.values)
    json.dump({"temperature": T, "threshold": THRESHOLD},
              open("calibration.json", "w"), indent=2)
    print(f"\nFitted temperature T = {T:.3f}  (saved to calibration.json)")

    # ── Evaluate on the held-out most-recent quarters ───────────────────────
    test_logits = model.predict(test_pool, prediction_type="RawFormulaVal")
    p_raw = sigmoid(test_logits)
    p_cal = sigmoid(test_logits / T)
    y_pred = (p_cal >= THRESHOLD).astype(int)

    print("\n================  TEST-SET PERFORMANCE (most recent quarters)  ================")
    print(f"AUC ............... {roc_auc_score(y_test, p_cal):.4f}")
    print(f"Accuracy @0.5 ..... {accuracy_score(y_test, y_pred) * 100:.2f}%")
    print(f"Precision ......... {precision_score(y_test, y_pred):.3f}")
    print(f"Recall ............ {recall_score(y_test, y_pred):.3f}")
    print(f"F1 ................ {f1_score(y_test, y_pred):.3f}")
    print(f"Brier (raw) ....... {brier_score_loss(y_test, p_raw):.4f}")
    print(f"Brier (calibrated)  {brier_score_loss(y_test, p_cal):.4f}  (lower = better)")
    print("Confusion matrix [[TN FP][FN TP]]:\n", confusion_matrix(y_test, y_pred))
    print(classification_report(y_test, y_pred, digits=3))

    # High-confidence slice (what the UI's green band shows).
    for thr in (0.6, 0.7):
        mask = p_cal >= thr
        if mask.sum():
            acc = accuracy_score(y_test[mask], (p_cal[mask] >= 0.5).astype(int))
            hit = y_test[mask].mean()
            print(f"When calibrated P(beat) >= {thr:.0%}: {mask.sum()} picks, "
                  f"{hit:.1%} actually beat")

    print("\nTop feature importances:")
    imp = sorted(zip(X.columns, model.get_feature_importance()),
                 key=lambda z: -z[1])
    for name, val in imp[:12]:
        print(f"  {name:<32} {val:6.2f}")


if __name__ == "__main__":
    main()
