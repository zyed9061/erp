-- Immutabilité des factures validées.
-- Une facture validée ne se modifie ni ne se supprime : on la corrige par un avoir.
-- La transition brouillon -> validée (OLD.status = 'draft') reste permise.

CREATE OR REPLACE FUNCTION invoices_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'validated' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'facture validée : suppression interdite (créez un avoir)';
    END IF;
    RAISE EXCEPTION 'facture validée : modification interdite (créez un avoir)';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER invoices_immutable
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_guard();
--> statement-breakpoint
-- Les lignes et le récapitulatif de taxes suivent le statut de leur facture.
CREATE OR REPLACE FUNCTION invoice_children_guard() RETURNS trigger AS $$
DECLARE
  inv uuid;
  st invoice_status;
BEGIN
  IF TG_OP = 'DELETE' THEN inv := OLD.invoice_id; ELSE inv := NEW.invoice_id; END IF;
  SELECT status INTO st FROM invoices WHERE id = inv;
  IF st = 'validated' THEN
    RAISE EXCEPTION 'facture validée : lignes et taxes en lecture seule (créez un avoir)';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION invoice_children_guard();
--> statement-breakpoint
CREATE TRIGGER invoice_tax_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_tax_lines
  FOR EACH ROW EXECUTE FUNCTION invoice_children_guard();
