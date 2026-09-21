-- Transmissions TTN (simulation) : en ajout seul, uniquement pour un export existant de la même facture.

CREATE OR REPLACE FUNCTION einvoice_submissions_guard() RETURNS trigger AS $$
DECLARE
  exp_invoice uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'einvoice_submissions est en ajout seul (% interdit)', TG_OP;
  END IF;
  SELECT invoice_id INTO exp_invoice FROM einvoice_exports WHERE id = NEW.export_id;
  IF exp_invoice IS DISTINCT FROM NEW.invoice_id THEN
    RAISE EXCEPTION 'L''export TEIF ne correspond pas à la facture';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER einvoice_submissions_guard_ins
  BEFORE INSERT ON einvoice_submissions
  FOR EACH ROW EXECUTE FUNCTION einvoice_submissions_guard();
--> statement-breakpoint
CREATE TRIGGER einvoice_submissions_immutable
  BEFORE UPDATE OR DELETE ON einvoice_submissions
  FOR EACH ROW EXECUTE FUNCTION einvoice_submissions_guard();
