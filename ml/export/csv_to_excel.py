"""Builds ml/data/export/ml-dataset.xlsx from the CSV files written by export-dataset.ts.

One sheet per ML view plus a "dictionary" sheet (ml/dataset_dictionary.csv) describing every
column and its role. Real Excel dates and numbers are used, so the workbook opens correctly
whatever the regional settings (a French Excel would misread "1234.5" in a raw CSV).
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
EXPORT_DIR = ROOT / "ml" / "data" / "export"
DICTIONARY = ROOT / "ml" / "dataset_dictionary.csv"
VIEWS = ["invoice_features", "invoice_lines", "client_features", "monthly_cashflow"]
DATE_COLUMNS = {
    "issue_date", "effective_due_date", "settled_date", "outcome_known_date",
    "client_since", "last_invoice_date", "month",
}


def main() -> None:
    target = EXPORT_DIR / "ml-dataset.xlsx"
    with pd.ExcelWriter(target, engine="openpyxl", date_format="YYYY-MM-DD") as writer:
        for view in VIEWS:
            frame = pd.read_csv(EXPORT_DIR / f"{view}.csv", encoding="utf-8-sig")
            for column in DATE_COLUMNS.intersection(frame.columns):
                frame[column] = pd.to_datetime(frame[column]).dt.date
            frame.to_excel(writer, sheet_name=view, index=False, freeze_panes=(1, 0))
            sheet = writer.sheets[view]
            sheet.auto_filter.ref = sheet.dimensions
            for cells in sheet.columns:
                width = max(len(str(cells[0].value)), *(len(str(c.value)) for c in cells[1:200] if c.value is not None))
                sheet.column_dimensions[cells[0].column_letter].width = min(max(width + 2, 10), 45)

        dictionary = pd.read_csv(DICTIONARY)
        dictionary.to_excel(writer, sheet_name="dictionary", index=False, freeze_panes=(1, 0))
        sheet = writer.sheets["dictionary"]
        for letter, width in zip("ABCD", (18, 28, 10, 110)):
            sheet.column_dimensions[letter].width = width

    print(f"  Excel workbook      -> {target.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
