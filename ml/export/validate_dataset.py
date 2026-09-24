"""Sanity checks for the exported ML dataset (run after `npm run ml:export`).

    python ml/export/validate_dataset.py

Always checked:
  * every exported column is documented in ml/dataset_dictionary.csv (and vice versa);
  * no look-ahead: prior_known_outcomes / prior_late_count are recomputed independently
    from the rows themselves and must match the SQL view;
  * label consistency: is_late / label_status / days_late agree with each other.
When the demo ground truth exists (ml/data/demo-*.csv), also checks that the labels match
the generator's planned delays and that the VAT rule finds the injected WRONG_VAT anomalies.
Exits with status 1 if any check fails.
"""

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "ml" / "data"
EXPORT = DATA / "export"
LATE_THRESHOLD_DAYS = 7

failures: list[str] = []


def check(ok: bool, message: str) -> None:
    print(f"  [{'ok' if ok else 'FAIL'}] {message}")
    if not ok:
        failures.append(message)


def load(view: str) -> pd.DataFrame:
    return pd.read_csv(EXPORT / f"{view}.csv", encoding="utf-8-sig")


def main() -> None:
    views = {v: load(v) for v in ["invoice_features", "invoice_lines", "client_features", "monthly_cashflow"]}
    dictionary = pd.read_csv(ROOT / "ml" / "dataset_dictionary.csv")

    print("Dictionary")
    for view, frame in views.items():
        documented = set(dictionary.loc[dictionary["view"] == view, "column"])
        exported = set(frame.columns)
        check(documented == exported, f"{view}: columns documented = exported"
              + ("" if documented == exported else f" (missing {exported - documented}, extra {documented - exported})"))

    inv = views["invoice_features"].copy()
    for col in ["issue_date", "outcome_known_date", "settled_date", "effective_due_date"]:
        inv[col] = pd.to_datetime(inv[col])

    print("Labels")
    counts = inv["label_status"].value_counts().to_dict()
    print(f"    label_status: {counts}; late rate among known = {inv['is_late'].mean():.1%}")
    check(inv.loc[inv.label_status == "open", "is_late"].isna().all(), "open rows have no label")
    known = inv[inv.label_status != "open"]
    check(((known.label_status == "late") == (known.is_late == 1)).all(), "label_status matches is_late")
    settled = inv[inv.settled_date.notna()]
    check(((settled.days_late > LATE_THRESHOLD_DAYS).astype(int) == settled.is_late).all(),
          f"settled rows: is_late == (days_late > {LATE_THRESHOLD_DAYS})")
    check((known.outcome_known_date.notna()).all(), "every labelled row has an outcome_known_date")

    print("No look-ahead (prior_* recomputed independently)")
    inv = inv.sort_values(["client_id", "issue_date", "numero"])
    mismatches = 0
    for _, group in inv.groupby("client_id"):
        rows = group.to_dict("records")
        for i, row in enumerate(rows):
            earlier = rows[:i]
            known_before = [r for r in earlier if pd.notna(r["outcome_known_date"]) and r["outcome_known_date"] < row["issue_date"]]
            expected_known = len(known_before)
            expected_late = sum(1 for r in known_before if r["is_late"] == 1)
            if (row["prior_invoice_count"], row["prior_known_outcomes"], row["prior_late_count"]) != (i, expected_known, expected_late):
                mismatches += 1
    check(mismatches == 0, f"prior counts match an independent recomputation ({mismatches} mismatches)")
    firsts = inv.groupby("client_id").head(1)
    check((firsts.prior_invoice_count == 0).all() and firsts.prior_late_rate.isna().all(),
          "each client's first invoice has no history")

    truth_file = DATA / "demo-invoice-truth.csv"
    if truth_file.exists():
        print("Demo ground truth")
        truth = pd.read_csv(truth_file).rename(columns={"factureId": "facture_id"})
        merged = inv.merge(truth, on="facture_id", how="left")
        check(merged.persona.notna().all(), "every invoice has a ground-truth row")
        paid = merged[merged.settled_date.notna() & merged.plannedDelayDays.notna()]
        expected = (paid.plannedDelayDays > LATE_THRESHOLD_DAYS).astype(int)
        agreement = (expected == paid.is_late).mean()
        check(agreement == 1.0, f"labels of paid invoices match the generator's planned delays ({agreement:.1%})")
        by_persona = merged[merged.is_late.notna()].groupby("persona")["is_late"].mean().sort_values()
        print("    late rate by hidden persona: " + ", ".join(f"{p} {r:.0%}" for p, r in by_persona.items()))

        anomalies = pd.read_csv(DATA / "demo-anomalies.csv")
        wrong_vat = set(anomalies.loc[anomalies.type == "WRONG_VAT", "factureId"])
        flagged = set(views["invoice_lines"].loc[views["invoice_lines"].vat_differs_from_catalog, "facture_id"])
        exportable = wrong_vat & set(inv.facture_id)
        check(exportable <= flagged, f"VAT rule flags all {len(exportable)} exported WRONG_VAT anomalies")
        check(flagged <= wrong_vat, f"VAT rule raises no false alarm ({len(flagged - wrong_vat)} extra)")

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        sys.exit(1)
    print("All checks passed")


if __name__ == "__main__":
    main()
