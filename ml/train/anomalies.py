"""Unusual-invoice detection: transparent rules plus an Isolation Forest.

Rules catch the well-defined problems with a clear reason (possible duplicate, VAT differing
from the product, very large quantity, discount or amount). The Isolation Forest
(unsupervised) scores every invoice on the same signals and flags the most unusual
combinations that no single rule catches. Every flag carries reason codes the app translates.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

DUPLICATE_WINDOW_DAYS = 3
QUANTITY_Z = 4.0          # robust z-score of the quantity for that product
DISCOUNT_PCT = 40.0
AMOUNT_RATIO = 8.0        # invoice amount (excl. tax) vs the client's median invoice
FOREST_SHARE = 0.005      # extra invoices flagged by the Isolation Forest alone (most extreme 0.5%)


def _line_signals(lines: pd.DataFrame) -> pd.DataFrame:
    lines = lines.copy()
    log_qty = np.log(lines.quantity.clip(lower=0.001))
    grouped = log_qty.groupby(lines.product_reference)
    median = grouped.transform("median")
    # Robust spread (MAD); floor it so products always sold in the same quantity don't explode.
    mad = grouped.transform(lambda s: (s - s.median()).abs().median()).clip(lower=0.25)
    lines["quantity_z"] = ((log_qty - median) / (1.4826 * mad)).fillna(0)
    lines["price_deviation"] = np.abs(np.log(lines.price_vs_catalog.fillna(1).clip(lower=0.01)))
    return lines.groupby("facture_id").agg(
        max_quantity_z=("quantity_z", "max"),
        max_discount_pct=("discount_pct", "max"),
        max_price_deviation=("price_deviation", "max"),
        vat_mismatch=("vat_differs_from_catalog", "any"),
    )


def run(invoices: pd.DataFrame, lines: pd.DataFrame, truth: pd.DataFrame | None) -> tuple[pd.DataFrame, dict]:
    frame = invoices[["facture_id", "numero", "client_id", "issue_date", "subtotal_ht"]].copy()
    frame = frame.merge(_line_signals(lines), left_on="facture_id", right_index=True, how="left")
    client_median = frame.groupby("client_id").subtotal_ht.transform("median")
    frame["amount_ratio"] = frame.subtotal_ht / client_median

    # Possible duplicate: same client and same amount excluding tax (the same goods; stamp duty
    # may differ) within a few days of an earlier invoice.
    frame = frame.sort_values(["client_id", "subtotal_ht", "issue_date", "numero"])
    same = (frame.client_id == frame.client_id.shift()) & (frame.subtotal_ht == frame.subtotal_ht.shift())
    gap = (frame.issue_date - frame.issue_date.shift()).dt.days
    frame["duplicate_of"] = np.where(same & (gap <= DUPLICATE_WINDOW_DAYS), frame.numero.shift(), None)

    reasons: list[list[dict]] = [[] for _ in range(len(frame))]
    for i, row in enumerate(frame.itertuples()):
        if pd.notna(row.duplicate_of):  # pandas stores the empty value as NA, not None
            reasons[i].append({"code": "POSSIBLE_DUPLICATE", "values": {"numero": row.duplicate_of}})
        if row.vat_mismatch:
            reasons[i].append({"code": "VAT_MISMATCH", "values": {}})
        if row.max_quantity_z >= QUANTITY_Z:
            reasons[i].append({"code": "UNUSUAL_QUANTITY", "values": {}})
        if row.max_discount_pct >= DISCOUNT_PCT:
            reasons[i].append({"code": "UNUSUAL_DISCOUNT", "values": {"pct": round(float(row.max_discount_pct))}})
        if row.amount_ratio >= AMOUNT_RATIO:
            reasons[i].append({"code": "UNUSUAL_AMOUNT", "values": {"ratio": round(float(row.amount_ratio), 1)}})
    frame["rule_flag"] = [len(r) > 0 for r in reasons]

    signals = frame[["max_quantity_z", "max_discount_pct", "max_price_deviation", "amount_ratio"]].fillna(0)
    signals = signals.assign(amount_ratio=np.log(signals.amount_ratio.clip(lower=0.01)))
    forest = IsolationForest(n_estimators=300, random_state=0).fit(signals)
    frame["anomaly_score"] = np.round(-forest.score_samples(signals), 4)  # higher = more unusual
    unflagged = frame.loc[~frame.rule_flag, "anomaly_score"]
    forest_cut = unflagged.quantile(1 - FOREST_SHARE) if len(unflagged) else np.inf
    forest_only = (~frame.rule_flag) & (frame.anomaly_score >= forest_cut)
    for i, flagged in enumerate(forest_only):
        if flagged:
            reasons[i].append({"code": "UNUSUAL_PATTERN", "values": {}})
    frame["anomaly_reasons"] = reasons
    frame["is_anomaly"] = frame.rule_flag | forest_only

    result = frame[["facture_id", "is_anomaly", "anomaly_score", "anomaly_reasons"]]
    metrics = {
        "invoices_checked": len(frame),
        "flagged": int(frame.is_anomaly.sum()),
        "flagged_by_rules": int(frame.rule_flag.sum()),
        "flagged_by_isolation_forest_only": int(forest_only.sum()),
    }
    if truth is not None:
        truth_ids = set(truth.facture_id) & set(frame.facture_id)
        flagged_ids = set(frame.loc[frame.is_anomaly, "facture_id"])
        found = truth_ids & flagged_ids
        metrics["precision"] = round(len(found) / max(1, len(flagged_ids)), 3)
        metrics["recall"] = round(len(found) / max(1, len(truth_ids)), 3)
        metrics["recall_by_type"] = {
            t: f"{len(set(g.facture_id) & flagged_ids)}/{len(set(g.facture_id) & set(frame.facture_id))}"
            for t, g in truth.groupby("type")
        }
    return result, metrics
