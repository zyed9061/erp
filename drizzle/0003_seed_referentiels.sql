-- Données de référence initiales.
-- Les taux de retenue à la source ne sont volontairement pas pré-remplis : base et taux
-- doivent être validés par un expert-comptable (voir docs/recherche-facturation.md, c.5).

INSERT INTO company_settings (id, legal_name) VALUES (1, 'À renseigner');
--> statement-breakpoint
INSERT INTO tax_rates (code, label, kind, rate) VALUES
  ('TVA19', 'TVA 19 %', 'tva', 19),
  ('TVA13', 'TVA 13 %', 'tva', 13),
  ('TVA7',  'TVA 7 %',  'tva', 7),
  ('TVA0',  'TVA 0 % (export / exonéré)', 'tva', 0),
  ('FODEC1', 'FODEC 1 %', 'fodec', 1);
--> statement-breakpoint
INSERT INTO payment_terms (label, days, end_of_month, is_default) VALUES
  ('À réception', 0, false, true),
  ('30 jours', 30, false, false),
  ('60 jours', 60, false, false),
  ('30 jours fin de mois', 30, true, false);
--> statement-breakpoint
INSERT INTO document_series_config (doc_type, prefix, pad_length, reset_yearly) VALUES
  ('invoice', 'FAC', 5, true),
  ('credit_note', 'AV', 5, true),
  ('quote', 'DEV', 5, true),
  ('deposit_invoice', 'ACO', 5, true),
  ('delivery_note', 'BL', 5, true),
  ('customer', 'CLI', 5, false),
  ('product', 'ART', 5, false);
--> statement-breakpoint
-- Un taux existant ne change jamais : on en crée un nouveau (les factures copient le taux appliqué).
CREATE OR REPLACE FUNCTION tax_rates_forbid_rate_change() RETURNS trigger AS $$
BEGIN
  IF NEW.rate IS DISTINCT FROM OLD.rate OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'le code, le type et le taux d''un taux de taxe sont immuables : créez un nouveau taux';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER tax_rates_immutable_rate
  BEFORE UPDATE ON tax_rates
  FOR EACH ROW EXECUTE FUNCTION tax_rates_forbid_rate_change();
