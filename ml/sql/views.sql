-- ML dataset views (schema "ml"). Read-only views over the app tables: they add no tables,
-- need no Prisma migration and are safe to (re)create on any database.
-- Applied by `npm run ml:views` (and by `npm run ml:export`). Column meanings and roles
-- (id / feature / label / outcome) are documented in ml/dataset_dictionary.csv.
--
-- Label definition (see ml/README.md): an invoice is LATE when it is paid more than 7 days
-- after its due date, or is still unpaid 7 days after it. Invoices without a due date use
-- 30 days after issue. Change both numbers in ml.params only.
--
-- No look-ahead: every "prior_*" feature of an invoice only uses information that was known
-- on its issue date (earlier invoices, and only the outcomes already known by then).

CREATE SCHEMA IF NOT EXISTS ml;

DROP VIEW IF EXISTS ml.monthly_cashflow;
DROP VIEW IF EXISTS ml.client_features;
DROP VIEW IF EXISTS ml.invoice_lines;
DROP VIEW IF EXISTS ml.invoice_features;
DROP VIEW IF EXISTS ml.invoice_outcomes;
DROP VIEW IF EXISTS ml.params;

CREATE VIEW ml.params AS
SELECT 7 AS late_threshold_days, 30 AS default_term_days;

-- One row per issued invoice (drafts and cancelled invoices excluded) with its outcome.
CREATE VIEW ml.invoice_outcomes AS
WITH pay AS (
  SELECT "factureId" AS facture_id,
         sum(montant) AS paid_total,
         count(*) AS payment_count,
         max("datePaiement")::date AS last_payment_date
  FROM paiements
  GROUP BY "factureId"
),
base AS (
  SELECT f.id AS facture_id,
         f.numero,
         f."clientId" AS client_id,
         f.statut::text AS statut,
         f."dateEmission"::date AS issue_date,
         f."dateEcheance"::date AS due_date,
         coalesce(f."dateEcheance"::date, f."dateEmission"::date + p.default_term_days) AS effective_due_date,
         f."sousTotalHT" AS subtotal_ht,
         f."totalTva" AS total_vat,
         f."timbreFiscal" AS stamp_duty,
         f."totalTTC" AS total_ttc,
         coalesce(pay.paid_total, 0) AS paid_total,
         coalesce(pay.payment_count, 0) AS payment_count,
         CASE WHEN f."montantPaye" >= f."totalTTC" AND pay.payment_count > 0 THEN pay.last_payment_date END AS settled_date,
         p.late_threshold_days
  FROM factures f
  CROSS JOIN ml.params p
  LEFT JOIN pay ON pay.facture_id = f.id
  WHERE f.statut NOT IN ('BROUILLON', 'ANNULEE')
)
SELECT facture_id, numero, client_id, statut, issue_date, due_date, effective_due_date,
       subtotal_ht, total_vat, stamp_duty, total_ttc, paid_total, payment_count, settled_date,
       settled_date - effective_due_date AS days_late,
       CASE
         WHEN settled_date IS NOT NULL THEN (settled_date - effective_due_date > late_threshold_days)::int
         WHEN current_date > effective_due_date + late_threshold_days THEN 1
       END AS is_late,
       CASE
         WHEN settled_date IS NOT NULL AND settled_date - effective_due_date <= late_threshold_days THEN 'on_time'
         WHEN settled_date IS NOT NULL OR current_date > effective_due_date + late_threshold_days THEN 'late'
         ELSE 'open'
       END AS label_status,
       -- Date from which the label was known: payment date if on time, otherwise the day the
       -- grace period expired (lateness is known then, even if payment arrives later).
       CASE
         WHEN settled_date IS NOT NULL AND settled_date - effective_due_date <= late_threshold_days THEN settled_date
         WHEN settled_date IS NOT NULL OR current_date > effective_due_date + late_threshold_days
           THEN least(coalesce(settled_date, 'infinity'::date), effective_due_date + late_threshold_days + 1)
       END AS outcome_known_date
FROM base;

-- One row per issued invoice: features known at issue date + label. The main training table.
CREATE VIEW ml.invoice_features AS
SELECT o.facture_id,
       o.numero,
       o.client_id,
       o.issue_date,
       o.effective_due_date,
       -- invoice features
       o.total_ttc,
       o.subtotal_ht,
       o.total_vat,
       o.stamp_duty,
       o.effective_due_date - o.issue_date AS term_days,
       (o.due_date IS NULL) AS no_due_date,
       ln.line_count,
       ln.max_discount_pct,
       (f."devisOrigineId" IS NOT NULL) AS from_quote,
       extract(month FROM o.issue_date)::int AS issue_month,
       (extract(month FROM o.issue_date)::int % 3 = 0) AS issue_in_quarter_end_month,
       (extract(month FROM o.effective_due_date)::int IN (8, 12)) AS due_in_holiday_month,
       -- client features at issue date
       c.type::text AS client_type,
       c.ville AS client_city,
       o.issue_date - c."createdAt"::date AS client_age_days,
       h.prior_invoice_count,
       h.prior_known_outcomes,
       h.prior_late_count,
       CASE WHEN h.prior_known_outcomes > 0
            THEN round(h.prior_late_count::numeric / h.prior_known_outcomes, 4) END AS prior_late_rate,
       h.prior_avg_days_late,
       h.prior_open_count,
       h.prior_open_amount,
       h.prior_avg_amount,
       CASE WHEN h.prior_avg_amount > 0 THEN round(o.total_ttc / h.prior_avg_amount, 4) END AS amount_vs_prior_avg,
       o.issue_date - h.last_prior_issue_date AS days_since_prior_invoice,
       -- label (target) and outcome columns: never use outcome columns as features
       o.is_late,
       o.label_status,
       o.days_late,
       o.settled_date,
       o.outcome_known_date
FROM ml.invoice_outcomes o
JOIN factures f ON f.id = o.facture_id
JOIN clients c ON c.id = o.client_id
LEFT JOIN LATERAL (
  SELECT count(*) AS line_count, coalesce(max("remisePct"), 0) AS max_discount_pct
  FROM lignes_facture
  WHERE "factureId" = o.facture_id
) ln ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS prior_invoice_count,
         count(*) FILTER (WHERE p.outcome_known_date < o.issue_date) AS prior_known_outcomes,
         count(*) FILTER (WHERE p.outcome_known_date < o.issue_date AND p.is_late = 1) AS prior_late_count,
         round(avg(p.days_late) FILTER (WHERE p.settled_date < o.issue_date), 2) AS prior_avg_days_late,
         count(*) FILTER (WHERE p.settled_date IS NULL OR p.settled_date >= o.issue_date) AS prior_open_count,
         coalesce(sum(
           p.total_ttc - coalesce((
             SELECT sum(pp.montant) FROM paiements pp
             WHERE pp."factureId" = p.facture_id AND pp."datePaiement"::date < o.issue_date
           ), 0)
         ) FILTER (WHERE p.settled_date IS NULL OR p.settled_date >= o.issue_date), 0) AS prior_open_amount,
         round(avg(p.total_ttc), 3) AS prior_avg_amount,
         max(p.issue_date) AS last_prior_issue_date
  FROM ml.invoice_outcomes p
  WHERE p.client_id = o.client_id
    AND (p.issue_date < o.issue_date OR (p.issue_date = o.issue_date AND p.numero < o.numero))
) h ON true;

-- One row per invoice line, with the catalogue reference values: input for anomaly detection.
CREATE VIEW ml.invoice_lines AS
SELECT l.id AS ligne_id,
       f.id AS facture_id,
       f.numero,
       f."clientId" AS client_id,
       f."dateEmission"::date AS issue_date,
       l.ordre AS line_order,
       l."produitId" AS produit_id,
       pr.reference AS product_reference,
       pr.categorie AS product_category,
       l.designation,
       l.quantite AS quantity,
       l."prixUnitaireHT" AS unit_price,
       pr."prixUnitaireHT" AS catalog_unit_price,
       round(l."prixUnitaireHT" / nullif(pr."prixUnitaireHT", 0), 4) AS price_vs_catalog,
       l."remisePct" AS discount_pct,
       l."tauxTva" AS vat_rate,
       pr."tauxTva" AS catalog_vat_rate,
       (pr.id IS NOT NULL AND l."tauxTva" <> pr."tauxTva") AS vat_differs_from_catalog,
       l."totalHT" AS total_ht
FROM lignes_facture l
JOIN factures f ON f.id = l."factureId"
LEFT JOIN produits pr ON pr.id = l."produitId"
WHERE f.statut NOT IN ('BROUILLON', 'ANNULEE');

-- One row per client: current snapshot for segmentation (clustering) and dashboards.
CREATE VIEW ml.client_features AS
SELECT c.id AS client_id,
       c.nom AS client_name,
       c.type::text AS client_type,
       c.ville AS client_city,
       c."createdAt"::date AS client_since,
       current_date - c."createdAt"::date AS tenure_days,
       count(i.facture_id) AS invoice_count,
       coalesce(sum(i.total_ttc), 0) AS total_revenue,
       round(avg(i.total_ttc), 3) AS avg_invoice_amount,
       max(i.issue_date) AS last_invoice_date,
       current_date - max(i.issue_date) AS recency_days,
       round(count(i.facture_id)::numeric / greatest(1, (current_date - min(i.issue_date)) / 30.0), 3) AS invoices_per_month,
       count(i.is_late) AS known_outcomes,
       count(*) FILTER (WHERE i.is_late = 1) AS late_count,
       round(avg(i.is_late), 4) AS late_rate,
       round(avg(i.days_late) FILTER (WHERE i.settled_date IS NOT NULL), 2) AS avg_days_late,
       coalesce(sum(i.total_ttc - i.paid_total) FILTER (WHERE i.settled_date IS NULL), 0) AS open_amount,
       coalesce(sum(i.total_ttc - i.paid_total)
         FILTER (WHERE i.settled_date IS NULL AND current_date > i.effective_due_date), 0) AS overdue_amount,
       round(avg((i.payment_count > 1)::int) FILTER (WHERE i.payment_count > 0), 4) AS instalment_share,
       q.quote_count,
       q.quote_conversion_rate,
       a.credit_note_count
FROM clients c
LEFT JOIN ml.invoice_outcomes i ON i.client_id = c.id
LEFT JOIN LATERAL (
  SELECT count(*) AS quote_count,
         round(count(*) FILTER (WHERE statut = 'CONVERTI')::numeric
               / nullif(count(*) FILTER (WHERE statut IN ('CONVERTI', 'REFUSE', 'EXPIRE')), 0), 4) AS quote_conversion_rate
  FROM devis d
  WHERE d."clientId" = c.id
) q ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS credit_note_count FROM avoirs a WHERE a."clientId" = c.id
) a ON true
GROUP BY c.id, q.quote_count, q.quote_conversion_rate, a.credit_note_count;

-- One row per month: amounts invoiced and collected, for cash-flow forecasting and dashboards.
CREATE VIEW ml.monthly_cashflow AS
WITH months AS (
  SELECT generate_series(
           date_trunc('month', (SELECT min("dateEmission") FROM factures)),
           date_trunc('month', current_date::timestamp),
           interval '1 month'
         )::date AS month
),
inv AS (
  SELECT date_trunc('month', "dateEmission")::date AS month,
         sum("totalTTC") AS invoiced_ttc,
         count(*) AS invoice_count
  FROM factures
  WHERE statut NOT IN ('BROUILLON', 'ANNULEE')
  GROUP BY 1
),
pay AS (
  SELECT date_trunc('month', "datePaiement")::date AS month,
         sum(montant) AS collected,
         count(*) AS payment_count
  FROM paiements
  GROUP BY 1
)
SELECT m.month,
       coalesce(inv.invoiced_ttc, 0) AS invoiced_ttc,
       coalesce(inv.invoice_count, 0) AS invoice_count,
       coalesce(pay.collected, 0) AS collected,
       coalesce(pay.payment_count, 0) AS payment_count
FROM months m
LEFT JOIN inv USING (month)
LEFT JOIN pay USING (month)
ORDER BY m.month;
