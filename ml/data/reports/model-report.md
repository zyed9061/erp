# ML model report

- Model version: `v20260924-075317` (trained 2026-09-24T07:53:17+00:00)
- Data: **demo data** (generated)

> Demo data: the models rediscover patterns built into the generator. These metrics validate the
> pipeline, not real-world accuracy. Retrain on real payment history before relying on the scores.

## 1. Late-payment classification

Time-based split at 2026-03-16: 797 training invoices (outcome known before the cut-off), 284 test invoices issued after it (late rate 23%).

| model | auc | avg_precision | brier | late_rate_top_10pct | precision_high_risk | recall_high_risk |
|---|---|---|---|---|---|---|
| logistic_regression | 0.774 | 0.545 | 0.141 | 0.714 | 0.707 | 0.446 |
| gradient_boosting | 0.815 | 0.612 | 0.13 | 0.786 | 0.682 | 0.462 |
| baseline_client_late_rate | 0.787 | 0.537 | 0.143 | 0.714 | 0.585 | 0.477 |
| oracle_true_probability | 0.866 | 0.646 | 0.117 | 0.75 | 0.707 | 0.631 |

Chosen model: **gradient_boosting** (the logistic regression is preferred unless gradient boosting beats it by at least 0.01 AUC, because its reasons are easier to explain).

Risk levels: HIGH >= 50%, MEDIUM >= 25%, otherwise LOW. Open invoices scored: 49 -> {'LOW': 29, 'HIGH': 14, 'MEDIUM': 6}.

Strongest factors (logistic regression coefficients on standardized features):

- `prior_late_rate_smoothed`: +0.494
- `prior_avg_days_late_filled`: +0.469
- `term_days`: -0.331
- `log_total_ttc`: +0.325
- `issue_in_quarter_end_month`: +0.298
- `prior_invoice_count`: -0.291
- `log_prior_open_amount`: +0.182
- `has_history`: -0.181

## 2. Days-late regression (expected payment date)

Mean absolute error: **9.1 days** vs 9.6 days for the client's own average delay.

## 3. Client segmentation

k-means on 60 clients with at least 3 invoices (silhouette by k: {4: 0.295, 5: 0.269, 6: 0.313}; chosen k = 6). 0 client(s) with too little history get the NEW segment.

Segments: {'RELIABLE': 19, 'OCCASIONAL_LATE': 18, 'SLOW_PAYER': 13, 'INACTIVE': 7, 'KEY_ACCOUNT': 3}

Agreement with the hidden demo personas (adjusted Rand index): **0.413**

| persona | KEY_ACCOUNT | RELIABLE | OCCASIONAL_LATE | SLOW_PAYER | INACTIVE | NEW |
|---|---|---|---|---|---|---|
| CHRONIC | 0 | 0 | 0 | 9 | 0 | 0 |
| NEW_RISKY | 0 | 0 | 0 | 3 | 0 | 0 |
| OCCASIONAL | 0 | 4 | 13 | 1 | 0 | 0 |
| QUARTER_END | 0 | 0 | 5 | 0 | 1 | 0 |
| RELIABLE | 3 | 15 | 0 | 0 | 6 | 0 |

## 4. Unusual invoices

1182 invoices checked, 33 flagged (26 by rules, 7 by the Isolation Forest alone).

Against the injected demo anomalies: precision **70%**, recall **100%**. Found by type: {'AMOUNT_SPIKE': '5/5', 'DUPLICATE': '6/6', 'ODD_DISCOUNT': '6/6', 'WRONG_VAT': '6/6'}
