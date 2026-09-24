# ML payment insights

Offline machine-learning work for the invoicing app: predicting late payments,
segmenting clients and flagging unusual invoices. Python is only used here, for
training and analysis. The web app itself never needs Python to run.

## Pipeline

```
PostgreSQL (app data)
   │
   ▼
ML dataset (one row per invoice / per client, computed "as of" the invoice date)
   │                                   │
   ├─► Power BI (exploration,          ├─► Python (train + evaluate models)
   │   dashboards) via the PostgreSQL  │     │
   │   connector or an Excel export    │     ▼
   │                                   │   scores written back to the app database
   │                                   │     │
   │                                   │     ▼
   │                                   └─► App: risk badge, client segments, anomaly alerts
```

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Feature branch, demo database, this folder | done |
| 1 | Demo data generator (~1,200 invoices, client personas, injected anomalies) | done |
| 2 | ML dataset (SQL views) and Excel/CSV export | done |
| 3 | Power BI connection guide and report guide | planned |
| 4 | Training and evaluation: classification, regression, clustering, anomaly detection | planned |
| 5 | In-app scores (badge, dashboard card, segments, anomaly alerts) in 4 languages | planned |
| 6 | Tests and pull request | planned |

## Decisions

- **Late payment (the label):** paid more than **7 days** after the due date, or still unpaid
  7 days after it. Invoices without a due date use **30 days** after issue.
- **No look-ahead:** client history features are computed as of each invoice's issue date only.
- **Time-based split:** train on older invoices and test on newer ones, never a random split.
- **Demo data is kept separate:** it lives in its own `*_demo` database and is never mixed with real data.

## Demo data

```bash
npm run demo:data              # creates, migrates and seeds <db>_demo, then loads the dataset
npm run demo:data -- --reset   # replace existing demo data
npm run demo:data -- --seed 7  # another reproducible dataset
```

- **Target:** `DEMO_DATABASE_URL` if set, otherwise `DATABASE_URL` with `_demo` appended to the
  database name (for example `erp_facturation_demo`). The script refuses any database whose name
  doesn't end with `_demo`.
- **To browse the demo data in the app:** point `DATABASE_URL` in `.env` at the demo database and
  restart `npm run dev`. The login is the same seeded admin account.
- **What gets generated** (with default options): 60 clients, 40 products, about 1,200 invoices
  over 24 months, with quotes, payments (including instalments), credit notes and about 2%
  injected anomalies. The same seed always produces the same data.

### Client personas (hidden from the app)

| Persona | Share | Behaviour |
|---|---|---|
| RELIABLE | 40% | Rarely late |
| OCCASIONAL | 30% | Sometimes late |
| CHRONIC | 15% | Usually late, by a lot |
| QUARTER_END | 10% | Late on invoices issued in the last month of a quarter |
| NEW_RISKY | 5% | Recent clients, often late, some never pay |

Invoice-level effects add to the persona: unusually large amounts, individual (non-company)
clients, immediate payment terms, and due dates in August or December all raise the risk. A
long relationship lowers it.

### Ground truth (`ml/data/`, not committed)

| File | Content |
|---|---|
| `demo-client-personas.csv` | Persona of each client, to evaluate clustering |
| `demo-invoice-truth.csv` | The true late-payment probability and planned delay the generator used, to see how close a model gets to the best achievable score |
| `demo-anomalies.csv` | Injected anomalies (DUPLICATE, WRONG_VAT, AMOUNT_SPIKE, ODD_DISCOUNT), to measure how many the anomaly detection finds (precision and recall) |
| `demo-manifest.json` | Seed, reference date and counts |

**Caveat:** a model trained on generated data only rediscovers the patterns built into the
generator. Metrics on demo data validate the pipeline, not real-world accuracy. Retrain on real
payment history before trusting the scores.

## ML dataset (phase 2)

Read-only SQL views in a separate `ml` schema (`ml/sql/views.sql`). They add no tables and
need no Prisma migration. Every column and its role is listed in
[`dataset_dictionary.csv`](dataset_dictionary.csv): `id`, `feature`, `label` (the target), or
`outcome`. Outcome columns reveal the answer, so never use them as model inputs.

| View | One row per | Use |
|---|---|---|
| `ml.invoice_features` | issued invoice | Late-payment classification (`is_late`) and days-late regression (`days_late`); `label_status = 'open'` rows are the ones to score |
| `ml.invoice_lines` | invoice line | Anomaly detection (price, quantity, discount and VAT compared with the catalogue) |
| `ml.client_features` | client | Client segmentation (clustering) and dashboards |
| `ml.monthly_cashflow` | month | Cash-flow forecasting and dashboards |

```bash
npm run ml:views                        # (re)create the views, e.g. before connecting Power BI
npm run ml:export                       # views + CSV + Excel -> ml/data/export/
python ml/export/validate_dataset.py    # checks: dictionary, labels, no look-ahead, demo ground truth
```

- **Which database:** both commands use `DATABASE_URL`, the same database as the app. The export
  warns when that isn't a `_demo` database.
- **Export format:** the CSV files are UTF-8 with a BOM, so Excel reads accents correctly.
  `ml-dataset.xlsx` has one sheet per view plus a `dictionary` sheet, with real dates and numbers,
  so it opens correctly with French regional settings.
- **Drafts and cancelled invoices** are excluded from all invoice views.

## Python setup

```bash
pip install --user -r ml/requirements.txt
```
