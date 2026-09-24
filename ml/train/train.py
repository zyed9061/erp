"""Trains and evaluates all ML models, then writes the scores the app imports.

    npm run ml:train     # = ml:export + this script + ml:import-scores

Inputs:  ml/data/export/*.csv (from `npm run ml:export`), plus the demo ground truth when present.
Outputs (git-ignored, under ml/data/):
  scores/invoice_scores.csv   late-payment risk for open invoices + anomaly flags for all invoices
  scores/client_segments.csv  one segment per client
  scores/run.json             model version, metrics, thresholds
  reports/model-report.md     human-readable evaluation report
"""

import json
from datetime import datetime, timezone

import pandas as pd

import anomalies
import late_payment
import segmentation
from common import REPORTS, SCORES, load_demo_truth, load_view


def _table(rows: dict, columns: list[str]) -> str:
    header = "| model | " + " | ".join(columns) + " |\n|---|" + "---|" * len(columns) + "\n"
    return header + "".join(
        f"| {name} | " + " | ".join("" if m.get(c) is None else str(m.get(c)) for c in columns) + " |\n"
        for name, m in rows.items()
    )


def write_report(run: dict, is_demo: bool) -> None:
    late = run["late_payment"]
    seg = run["segmentation"]
    ano = run["anomalies"]
    lines = [
        "# ML model report",
        "",
        f"- Model version: `{run['model_version']}` (trained {run['trained_at']})",
        f"- Data: {'**demo data** (generated)' if is_demo else 'real application data'}",
        "",
    ]
    if is_demo:
        lines += [
            "> Demo data: the models rediscover patterns built into the generator. These metrics validate the",
            "> pipeline, not real-world accuracy. Retrain on real payment history before relying on the scores.",
            "",
        ]
    split = late["split"]
    lines += [
        "## 1. Late-payment classification",
        "",
        f"Time-based split at {split['cutoff']}: {split['train_rows']} training invoices (outcome known before the cut-off), "
        f"{split['test_rows']} test invoices issued after it (late rate {split['test_late_rate']:.0%}).",
        "",
        _table(late["classification"], ["auc", "avg_precision", "brier", "late_rate_top_10pct", "precision_high_risk", "recall_high_risk"]),
        f"Chosen model: **{late['chosen_model']}** (the logistic regression is preferred unless gradient boosting "
        f"beats it by at least {late_payment.EXPLAINABILITY_MARGIN} AUC, because its reasons are easier to explain).",
        "",
        f"Risk levels: HIGH >= {late_payment.HIGH_RISK:.0%}, MEDIUM >= {late_payment.MEDIUM_RISK:.0%}, otherwise LOW. "
        f"Open invoices scored: {late['open_invoices_scored']} -> {late['risk_distribution']}.",
        "",
        "Strongest factors (logistic regression coefficients on standardized features):",
        "",
        *[f"- `{k}`: {v:+}" for k, v in late["top_logistic_coefficients"].items()],
        "",
        "## 2. Days-late regression (expected payment date)",
        "",
        f"Mean absolute error: **{late['regression']['mae_days']} days** vs "
        f"{late['regression']['baseline_mae_days_client_average']} days for the client's own average delay.",
        "",
        "## 3. Client segmentation",
        "",
        f"k-means on {seg['clustered_clients']} clients with at least {segmentation.MIN_INVOICES} invoices "
        f"(silhouette by k: {seg['silhouette_by_k']}; chosen k = {seg['chosen_k']}). "
        f"{seg['new_clients_not_clustered']} client(s) with too little history get the NEW segment.",
        "",
        f"Segments: {seg['segment_counts']}",
        "",
    ]
    if "adjusted_rand_vs_personas" in seg:
        lines += [f"Agreement with the hidden demo personas (adjusted Rand index): **{seg['adjusted_rand_vs_personas']}**", "",
                  "| persona | " + " | ".join(segmentation.SEGMENTS) + " |", "|---|" + "---|" * len(segmentation.SEGMENTS)]
        for persona, counts in seg["segment_by_persona"].items():
            lines.append(f"| {persona} | " + " | ".join(str(counts.get(s, 0)) for s in segmentation.SEGMENTS) + " |")
        lines.append("")
    lines += [
        "## 4. Unusual invoices",
        "",
        f"{ano['invoices_checked']} invoices checked, {ano['flagged']} flagged "
        f"({ano['flagged_by_rules']} by rules, {ano['flagged_by_isolation_forest_only']} by the Isolation Forest alone).",
        "",
    ]
    if "precision" in ano:
        lines += [f"Against the injected demo anomalies: precision **{ano['precision']:.0%}**, recall **{ano['recall']:.0%}**. "
                  f"Found by type: {ano['recall_by_type']}", ""]
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "model-report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    invoices = load_view("invoice_features")
    lines = load_view("invoice_lines")
    clients = load_view("client_features")
    invoice_truth = load_demo_truth("invoice-truth")
    personas = load_demo_truth("client-personas")
    anomaly_truth = load_demo_truth("anomalies")
    is_demo = invoice_truth is not None

    today = pd.Timestamp(datetime.now(timezone.utc).date())
    trained_at = datetime.now(timezone.utc).replace(microsecond=0)
    model_version = trained_at.strftime("v%Y%m%d-%H%M%S")

    late = late_payment.run(invoices, invoice_truth, today)
    segments, segment_metrics = segmentation.run(clients, personas)
    flags, anomaly_metrics = anomalies.run(invoices, lines, anomaly_truth)

    scores = invoices[["facture_id"]].merge(late.scores, on="facture_id", how="left").merge(flags, on="facture_id", how="left")
    scores["reasons"] = scores.reasons.apply(lambda r: json.dumps(r) if isinstance(r, list) else "")
    scores["anomaly_reasons"] = scores.anomaly_reasons.apply(lambda r: json.dumps(r) if isinstance(r, list) else "[]")
    scores["expected_payment_date"] = pd.to_datetime(scores.expected_payment_date).dt.strftime("%Y-%m-%d")
    scores["predicted_days_late"] = scores.predicted_days_late.astype("Int64")

    SCORES.mkdir(parents=True, exist_ok=True)
    scores.to_csv(SCORES / "invoice_scores.csv", index=False)
    segments.to_csv(SCORES / "client_segments.csv", index=False)

    run = {
        "model_version": model_version,
        "trained_at": trained_at.isoformat(),
        "demo_data": is_demo,
        "thresholds": {"high_risk": late_payment.HIGH_RISK, "medium_risk": late_payment.MEDIUM_RISK},
        "late_payment": late.metrics,
        "segmentation": segment_metrics,
        "anomalies": anomaly_metrics,
    }
    (SCORES / "run.json").write_text(json.dumps(run, indent=2, default=str), encoding="utf-8")
    write_report(run, is_demo)

    lp = late.metrics["classification"]
    print(f"Model {model_version} ({'demo' if is_demo else 'real'} data)")
    print(f"  late payment: chosen {late.metrics['chosen_model']}; test AUC "
          + ", ".join(f"{k} {v['auc']}" for k, v in lp.items()))
    print(f"  days late: MAE {late.metrics['regression']['mae_days']} d "
          f"(baseline {late.metrics['regression']['baseline_mae_days_client_average']} d)")
    print(f"  open invoices scored: {late.metrics['open_invoices_scored']} {late.metrics['risk_distribution']}")
    print(f"  segments (k={segment_metrics['chosen_k']}): {segment_metrics['segment_counts']}"
          + (f"; ARI vs personas {segment_metrics['adjusted_rand_vs_personas']}" if personas is not None else ""))
    print(f"  anomalies: {anomaly_metrics['flagged']} flagged"
          + (f"; precision {anomaly_metrics['precision']:.0%}, recall {anomaly_metrics['recall']:.0%} {anomaly_metrics['recall_by_type']}"
             if "precision" in anomaly_metrics else ""))
    print("  report: ml/data/reports/model-report.md")


if __name__ == "__main__":
    main()
