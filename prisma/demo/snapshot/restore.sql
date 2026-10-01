-- Restores the demo dataset snapshot (60 clients, 1,210 invoices, ML scores) into a *_demo database.
--
-- Run from the repository root, on a migrated database that already has an admin user:
--   npx prisma migrate deploy && npx prisma db seed
--   psql -f prisma/demo/snapshot/restore.sql -d "<connection string of the *_demo database>"
--
-- Replaces all business and ML data in that database. User accounts are not part of the
-- snapshot: every document is attributed to the database's first admin user.

\set ON_ERROR_STOP on

SELECT current_database() LIKE '%\_demo' AS is_demo \gset
\if :is_demo
\else
  \echo 'Refusing to restore: the database name must end with _demo.'
  \quit
\endif

SELECT id AS admin_id FROM users WHERE role = 'ADMIN' ORDER BY "createdAt" LIMIT 1 \gset
\if :{?admin_id}
\else
  \echo 'No admin user found: run "npx prisma db seed" first.'
  \quit
\endif

BEGIN;

TRUNCATE company_profile, numbering_sequences, clients, produits, devis, lignes_devis, factures,
  lignes_facture, paiements, avoirs, lignes_avoir, ml_model_runs, ml_invoice_scores, ml_client_segments;

\copy company_profile FROM 'prisma/demo/snapshot/company_profile.csv' WITH (FORMAT csv, HEADER)
\copy numbering_sequences FROM 'prisma/demo/snapshot/numbering_sequences.csv' WITH (FORMAT csv, HEADER)
\copy clients FROM 'prisma/demo/snapshot/clients.csv' WITH (FORMAT csv, HEADER)
\copy produits FROM 'prisma/demo/snapshot/produits.csv' WITH (FORMAT csv, HEADER)

-- Documents carry "createdById": load them through a staging table to point it at the local admin.
CREATE TEMP TABLE stage_devis (LIKE devis) ON COMMIT DROP;
\copy stage_devis FROM 'prisma/demo/snapshot/devis.csv' WITH (FORMAT csv, HEADER)
UPDATE stage_devis SET "createdById" = :'admin_id';
INSERT INTO devis SELECT * FROM stage_devis;

\copy lignes_devis FROM 'prisma/demo/snapshot/lignes_devis.csv' WITH (FORMAT csv, HEADER)

CREATE TEMP TABLE stage_factures (LIKE factures) ON COMMIT DROP;
\copy stage_factures FROM 'prisma/demo/snapshot/factures.csv' WITH (FORMAT csv, HEADER)
UPDATE stage_factures SET "createdById" = :'admin_id';
INSERT INTO factures SELECT * FROM stage_factures;

\copy lignes_facture FROM 'prisma/demo/snapshot/lignes_facture.csv' WITH (FORMAT csv, HEADER)

CREATE TEMP TABLE stage_paiements (LIKE paiements) ON COMMIT DROP;
\copy stage_paiements FROM 'prisma/demo/snapshot/paiements.csv' WITH (FORMAT csv, HEADER)
UPDATE stage_paiements SET "createdById" = :'admin_id';
INSERT INTO paiements SELECT * FROM stage_paiements;

CREATE TEMP TABLE stage_avoirs (LIKE avoirs) ON COMMIT DROP;
\copy stage_avoirs FROM 'prisma/demo/snapshot/avoirs.csv' WITH (FORMAT csv, HEADER)
UPDATE stage_avoirs SET "createdById" = :'admin_id';
INSERT INTO avoirs SELECT * FROM stage_avoirs;

\copy lignes_avoir FROM 'prisma/demo/snapshot/lignes_avoir.csv' WITH (FORMAT csv, HEADER)
\copy ml_model_runs FROM 'prisma/demo/snapshot/ml_model_runs.csv' WITH (FORMAT csv, HEADER)
\copy ml_invoice_scores FROM 'prisma/demo/snapshot/ml_invoice_scores.csv' WITH (FORMAT csv, HEADER)
\copy ml_client_segments FROM 'prisma/demo/snapshot/ml_client_segments.csv' WITH (FORMAT csv, HEADER)

COMMIT;

SELECT (SELECT count(*) FROM clients) AS clients, (SELECT count(*) FROM factures) AS invoices,
  (SELECT count(*) FROM devis) AS quotes, (SELECT count(*) FROM paiements) AS payments,
  (SELECT count(*) FROM ml_invoice_scores) AS invoice_scores;
