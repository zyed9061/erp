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
| 4 | Training and evaluation: classification, regression, clustering, anomaly detection | done |
| 5 | In-app scores (badge, dashboard card, segments, anomaly alerts) in 4 languages | done |
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

## Models (phase 4)

```bash
npm run ml:train   # export the dataset, train + evaluate (ml/train/train.py), import the scores
```

This writes `ml/data/scores/` (scores and `run.json` with every metric) and
`ml/data/reports/model-report.md`, a readable evaluation report. Then it loads the scores into
the app database.

| Question | Method | Output in the app |
|---|---|---|
| Will this open invoice be paid late? | Gradient boosting or logistic regression; the logistic regression is kept unless boosting is at least 0.01 AUC better | Risk LOW / MEDIUM / HIGH (probability >= 25% / >= 50%) with up to 3 reasons |
| How late? When will it be paid? | Gradient boosting regression on days late | Expected payment date and the 8-week collection forecast |
| What type of client is this? | k-means (payment behaviour weighted x2, k = 4 to 6 by silhouette), named by fixed rules | Segment: KEY_ACCOUNT, RELIABLE, OCCASIONAL_LATE, SLOW_PAYER, INACTIVE, or NEW (fewer than 3 invoices) |
| Is this invoice unusual? | Rules (duplicate, VAT different from the product, quantity, discount, amount) plus an Isolation Forest for the most extreme 0.5% | "To review" badge with the reasons |

**Evaluation is time-based:** the models train on invoices whose outcome was known before a
cut-off date, and are tested on the 25% most recent invoices.

**Results on the demo data (seed 42):**

| Metric | Value |
|---|---|
| Late-payment AUC (test) | gradient boosting **0.815**, logistic regression 0.774, client's past late rate alone 0.787, best achievable 0.866 (the generator's true probabilities) |
| High-risk invoices that were really late (precision) | 68% |
| Days-late error (mean absolute error) | **9.1 days**, vs 9.6 using the client's average delay |
| Segments vs hidden personas | all CHRONIC and NEW_RISKY clients are SLOW_PAYER; all RELIABLE clients are RELIABLE, KEY_ACCOUNT or INACTIVE (adjusted Rand index 0.41) |
| Unusual invoices | 33 flagged; recall **100%** (23/23 injected), precision 70% |

These numbers show the pipeline works on data with known patterns. They are not a promise of
real-world accuracy.

## In the app (phase 5)

- **Tables:** `ml_invoice_scores`, `ml_client_segments` and `ml_model_runs`, added by the Prisma
  migration `add_ml_scores`. They're written only by `npm run ml:import-scores`; the app only
  reads them. If no model has been imported, the app shows nothing extra.
- **Invoices:** a *Late-payment risk* column and a *Check* column, both with filters. The invoice
  page adds a *Payment forecast* card (probability, expected date, main factors, model version)
  and an *Unusual invoice* warning.
- **Dashboard:** a *Priority collections* card (amount at high risk, top 5 invoices, and one click
  to send reminders to all of them) and *Expected collections* for the next 8 weeks.
- **Clients:** a *Segment* column with a filter.
- **Languages:** all texts exist in French, English, Arabic and German (messages `ml.*`). The
  reason codes are shared with `ml/train` and covered by `src/lib/ml.test.ts`.
- **Stale scores:** a score is hidden once the invoice is paid or cancelled. Retrain (for
  example weekly) to refresh the scores.

## Before using real data

1. **Retrain on real history** with `npm run ml:train`, once there are at least ~200 paid
   invoices. Read `model-report.md`, and check that the model beats the "client's past late
   rate" baseline before showing scores to users.
2. **Check the thresholds** (`HIGH_RISK`, `MEDIUM_RISK`, and the anomaly thresholds): they were
   chosen on demo data.
3. **Keep the exports private:** `ml/data/` then contains real client data. It's git-ignored;
   don't share it.

## Python setup

```bash
pip install --user -r ml/requirements.txt
```
