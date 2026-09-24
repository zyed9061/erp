"""Shared paths and loaders for the training pipeline."""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "ml" / "data"
EXPORT = DATA / "export"
SCORES = DATA / "scores"
REPORTS = DATA / "reports"

LATE_THRESHOLD_DAYS = 7

DATE_COLUMNS = ["issue_date", "effective_due_date", "settled_date", "outcome_known_date",
                "client_since", "last_invoice_date", "month"]


def load_view(name: str) -> pd.DataFrame:
    path = EXPORT / f"{name}.csv"
    if not path.exists():
        raise SystemExit(f"{path} not found: run `npm run ml:export` first.")
    frame = pd.read_csv(path, encoding="utf-8-sig")
    for column in DATE_COLUMNS:
        if column in frame.columns:
            frame[column] = pd.to_datetime(frame[column])
    return frame


def load_demo_truth(name: str) -> pd.DataFrame | None:
    """Ground truth written by the demo generator, or None on a real database."""
    path = DATA / f"demo-{name}.csv"
    if not path.exists():
        return None
    return pd.read_csv(path).rename(columns={"factureId": "facture_id", "clientId": "client_id"})
