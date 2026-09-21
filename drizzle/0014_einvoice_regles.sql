-- Exports TEIF : en ajout seul, et uniquement pour une facture validée dont l'empreinte correspond.

CREATE OR REPLACE FUNCTION einvoice_exports_guard() RETURNS trigger AS $$
DECLARE
  inv RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'einvoice_exports est en ajout seul (% interdit)', TG_OP;
  END IF;
  SELECT status, content_hash INTO inv FROM invoices WHERE id = NEW.invoice_id;
  IF inv.status IS DISTINCT FROM 'validated' THEN
    RAISE EXCEPTION 'Seule une facture validée peut être préparée pour le TEIF';
  END IF;
  IF inv.content_hash IS DISTINCT FROM NEW.invoice_content_hash THEN
    RAISE EXCEPTION 'Empreinte de facture incohérente pour l''export TEIF';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER einvoice_exports_guard_ins
  BEFORE INSERT ON einvoice_exports
  FOR EACH ROW EXECUTE FUNCTION einvoice_exports_guard();
--> statement-breakpoint
CREATE TRIGGER einvoice_exports_immutable
  BEFORE UPDATE OR DELETE ON einvoice_exports
  FOR EACH ROW EXECUTE FUNCTION einvoice_exports_guard();
