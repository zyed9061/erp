"""Late-payment classification and days-late regression.

Evaluation is time-based: models are trained on invoices whose outcome was known before a
cut-off date and tested on invoices issued after it, exactly as they would be used in
production. The chosen model is then refitted on all labelled invoices and scores the open
ones (label_status = "open": not yet paid, not yet more than 7 days overdue).

Every score comes with plain reasons (codes + values, translated by the app), derived from the
logistic regression's per-feature contributions. The regression is interpretable even when
gradient boosting is chosen for the probability.
"""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, mean_absolute_error, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

# Risk levels shown in the app (fixed, documented thresholds on the late probability).
HIGH_RISK = 0.5
MEDIUM_RISK = 0.25
TEST_SHARE = 0.25
# Prefer the interpretable model unless the complex one is clearly better.
EXPLAINABILITY_MARGIN = 0.01
# Smoothing of a client's late rate: as if every client started with this many invoices at
# the overall late rate, so 1 late invoice out of 1 does not read as "always late".
PRIOR_STRENGTH = 3

FEATURES = [
    "log_total_ttc", "term_days", "short_terms", "no_due_date", "line_count", "max_discount_pct",
    "from_quote", "issue_in_quarter_end_month", "due_in_holiday_month", "is_individual",
    "log_client_age_days", "has_history", "prior_invoice_count", "prior_late_rate_smoothed",
    "prior_avg_days_late_filled", "prior_open_count", "log_prior_open_amount",
    "log_amount_vs_prior_avg", "log_days_since_prior_invoice",
]


def build_features(frame: pd.DataFrame, global_late_rate: float) -> pd.DataFrame:
    """Numeric model inputs. Only columns with role `feature` in the dictionary are used."""
    x = pd.DataFrame(index=frame.index)
    x["log_total_ttc"] = np.log1p(frame["total_ttc"])
    x["term_days"] = frame["term_days"]
    x["short_terms"] = (frame["term_days"] <= 0).astype(int)
    x["no_due_date"] = frame["no_due_date"].astype(int)
    x["line_count"] = frame["line_count"]
    x["max_discount_pct"] = frame["max_discount_pct"]
    x["from_quote"] = frame["from_quote"].astype(int)
    x["issue_in_quarter_end_month"] = frame["issue_in_quarter_end_month"].astype(int)
    x["due_in_holiday_month"] = frame["due_in_holiday_month"].astype(int)
    x["is_individual"] = (frame["client_type"] == "PARTICULIER").astype(int)
    x["log_client_age_days"] = np.log1p(frame["client_age_days"].clip(lower=0))
    x["has_history"] = (frame["prior_known_outcomes"] > 0).astype(int)
    x["prior_invoice_count"] = frame["prior_invoice_count"]
    # Smoothed late rate: no history -> overall rate; more known outcomes -> closer to the client's own rate.
    x["prior_late_rate_smoothed"] = (frame["prior_late_count"] + PRIOR_STRENGTH * global_late_rate) / (
        frame["prior_known_outcomes"] + PRIOR_STRENGTH
    )
    x["prior_avg_days_late_filled"] = frame["prior_avg_days_late"].fillna(0)
    x["prior_open_count"] = frame["prior_open_count"]
    x["log_prior_open_amount"] = np.log1p(frame["prior_open_amount"])
    x["log_amount_vs_prior_avg"] = np.log(frame["amount_vs_prior_avg"].fillna(1).clip(lower=0.01))
    x["log_days_since_prior_invoice"] = np.log1p(frame["days_since_prior_invoice"].fillna(365))
    return x[FEATURES]


def _logistic():
    return make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=5000))


def _boosting():
    return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=250,
                                          l2_regularization=1.0, random_state=0)


def _metrics(y: pd.Series, p: np.ndarray) -> dict:
    order = np.argsort(-p)
    top = order[: max(1, len(order) // 10)]
    high = p >= HIGH_RISK
    return {
        "auc": round(float(roc_auc_score(y, p)), 3),
        "avg_precision": round(float(average_precision_score(y, p)), 3),
        "brier": round(float(brier_score_loss(y, p)), 3),
        "late_rate_top_10pct": round(float(y.iloc[top].mean()), 3),
        "precision_high_risk": round(float(y[high].mean()), 3) if high.any() else None,
        "recall_high_risk": round(float(y[high].sum() / y.sum()), 3),
    }


# Feature -> reason code shown to users. Features not listed never become a reason.
REASONS = {
    "prior_late_rate_smoothed": "CLIENT_LATE_HISTORY",
    "prior_avg_days_late_filled": "CLIENT_AVG_DELAY",
    "prior_open_count": "OPEN_BALANCE",
    "log_prior_open_amount": "OPEN_BALANCE",
    "log_amount_vs_prior_avg": "LARGE_AMOUNT",
    "log_total_ttc": "LARGE_AMOUNT",
    "due_in_holiday_month": "HOLIDAY_DUE_DATE",
    "issue_in_quarter_end_month": "QUARTER_END",
    "is_individual": "INDIVIDUAL_CLIENT",
    "has_history": "NEW_CLIENT",
    "log_client_age_days": "NEW_CLIENT",
    "short_terms": "SHORT_TERMS",
    "term_days": "SHORT_TERMS",
    "no_due_date": "NO_DUE_DATE",
}


def _reason_values(code: str, row: pd.Series) -> dict:
    if code == "CLIENT_LATE_HISTORY":
        return {"late": int(row.prior_late_count), "known": int(row.prior_known_outcomes),
                "rate": int(round(100 * (row.prior_late_rate or 0)))}
    if code == "CLIENT_AVG_DELAY":
        return {"days": int(round(row.prior_avg_days_late))}
    if code == "OPEN_BALANCE":
        return {"count": int(row.prior_open_count), "amount": round(float(row.prior_open_amount), 3)}
    if code == "LARGE_AMOUNT":
        return {"ratio": round(float(row.amount_vs_prior_avg), 1)} if pd.notna(row.amount_vs_prior_avg) else {}
    if code == "SHORT_TERMS":
        return {"days": int(row.term_days)}
    return {}


def explain(logistic, x: pd.DataFrame, frame: pd.DataFrame, max_reasons: int = 3) -> list[list[dict]]:
    """Top risk-increasing factors per row: coefficient x standardized value, above a floor."""
    scaler = logistic.named_steps["standardscaler"]
    coef = logistic.named_steps["logisticregression"].coef_[0]
    contributions = pd.DataFrame(scaler.transform(x) * coef, columns=x.columns, index=x.index)
    result = []
    for idx, row in contributions.iterrows():
        source = frame.loc[idx]
        best: dict[str, float] = {}
        for feature, value in row.items():
            code = REASONS.get(feature)
            if code is None or value <= 0.15:
                continue
            # "NEW_CLIENT" only makes sense when the client really has little history.
            if code == "NEW_CLIENT" and source.prior_known_outcomes >= 3:
                continue
            if code == "CLIENT_LATE_HISTORY" and source.prior_known_outcomes == 0:
                continue
            if code == "CLIENT_AVG_DELAY" and pd.isna(source.prior_avg_days_late):
                continue
            # Only call an amount "large" when it clearly exceeds what this client usually spends.
            if code == "LARGE_AMOUNT" and not (source.amount_vs_prior_avg >= 1.3):
                continue
            best[code] = max(best.get(code, 0.0), float(value))
        ranked = sorted(best.items(), key=lambda kv: -kv[1])[:max_reasons]
        result.append([{"code": code, "values": _reason_values(code, source)} for code, _ in ranked])
    return result


@dataclass
class LatePaymentResult:
    scores: pd.DataFrame
    metrics: dict = field(default_factory=dict)


def run(invoices: pd.DataFrame, truth: pd.DataFrame | None, today: pd.Timestamp) -> LatePaymentResult:
    labelled = invoices[invoices.is_late.notna()].sort_values("issue_date").copy()
    labelled["is_late"] = labelled["is_late"].astype(int)
    open_rows = invoices[invoices.label_status == "open"].copy()

    # Time-based split: test = the most recent 25% of labelled invoices; train only on
    # invoices whose outcome was already known before the test period started.
    cutoff = labelled.issue_date.iloc[int(len(labelled) * (1 - TEST_SHARE))]
    test = labelled[labelled.issue_date >= cutoff]
    train = labelled[(labelled.issue_date < cutoff) & (labelled.outcome_known_date < cutoff)]
    global_rate = float(train.is_late.mean())

    x_train, x_test = build_features(train, global_rate), build_features(test, global_rate)
    candidates = {"logistic_regression": _logistic(), "gradient_boosting": _boosting()}
    evaluation = {}
    for name, model in candidates.items():
        model.fit(x_train, train.is_late)
        evaluation[name] = _metrics(test.is_late, model.predict_proba(x_test)[:, 1])

    baseline = test.prior_late_rate.fillna(global_rate).to_numpy()
    evaluation["baseline_client_late_rate"] = _metrics(test.is_late, baseline)
    if truth is not None:
        oracle = test[["facture_id"]].merge(truth, on="facture_id", how="left")["trueLateProbability"].to_numpy()
        evaluation["oracle_true_probability"] = _metrics(test.is_late, oracle)

    chosen = "gradient_boosting"
    if evaluation["gradient_boosting"]["auc"] - evaluation["logistic_regression"]["auc"] < EXPLAINABILITY_MARGIN:
        chosen = "logistic_regression"

    # Refit on everything labelled, then score the open invoices.
    all_rate = float(labelled.is_late.mean())
    x_all = build_features(labelled, all_rate)
    final = _logistic() if chosen == "logistic_regression" else _boosting()
    final.fit(x_all, labelled.is_late)
    explainer = final if chosen == "logistic_regression" else _logistic().fit(x_all, labelled.is_late)

    x_open = build_features(open_rows, all_rate)
    probability = final.predict_proba(x_open)[:, 1] if len(open_rows) else np.array([])
    reasons = explain(explainer, x_open, open_rows) if len(open_rows) else []

    # Days-late regression (expected payment date), trained on settled invoices.
    settled = labelled[labelled.settled_date.notna()]
    y_days = settled.days_late.clip(-30, 120)
    regression_metrics = {}
    reg_train = settled[settled.issue_date < cutoff]
    reg_test = settled[settled.issue_date >= cutoff]
    regressor = HistGradientBoostingRegressor(loss="absolute_error", max_depth=3, learning_rate=0.05,
                                              max_iter=250, random_state=0)
    regressor.fit(build_features(reg_train, global_rate), y_days.loc[reg_train.index])
    predicted = regressor.predict(build_features(reg_test, global_rate))
    baseline_days = reg_test.prior_avg_days_late.fillna(float(y_days.loc[reg_train.index].median()))
    regression_metrics = {
        "mae_days": round(float(mean_absolute_error(y_days.loc[reg_test.index], predicted)), 1),
        "baseline_mae_days_client_average": round(float(mean_absolute_error(y_days.loc[reg_test.index], baseline_days)), 1),
    }
    regressor.fit(x_all.loc[settled.index], y_days)
    days = np.round(regressor.predict(x_open)).astype(int) if len(open_rows) else np.array([], dtype=int)

    scores = pd.DataFrame({
        "facture_id": open_rows.facture_id.to_numpy(),
        "late_probability": np.round(probability, 4),
        "risk_level": np.where(probability >= HIGH_RISK, "HIGH", np.where(probability >= MEDIUM_RISK, "MEDIUM", "LOW")),
        "reasons": reasons,
        "predicted_days_late": days,
        "expected_payment_date": (open_rows.effective_due_date + pd.to_timedelta(days, unit="D")).to_numpy(),
    })
    # An expected date already in the past means "any day now".
    scores["expected_payment_date"] = scores["expected_payment_date"].where(
        scores["expected_payment_date"] > today, today + pd.Timedelta(days=1))

    coefficients = pd.Series(
        explainer.named_steps["logisticregression"].coef_[0], index=FEATURES
    ).sort_values(key=np.abs, ascending=False)

    return LatePaymentResult(scores=scores, metrics={
        "split": {"cutoff": cutoff.date().isoformat(), "train_rows": len(train), "test_rows": len(test),
                  "test_late_rate": round(float(test.is_late.mean()), 3)},
        "classification": evaluation,
        "chosen_model": chosen,
        "regression": regression_metrics,
        "open_invoices_scored": len(scores),
        "risk_distribution": scores.risk_level.value_counts().to_dict(),
        "top_logistic_coefficients": {k: round(float(v), 3) for k, v in coefficients.head(8).items()},
    })
