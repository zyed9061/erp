-- Règles d'intégrité de la phase 4 : devis verrouillés, paiements et imputations immuables, vue des soldes.

-- Un devis envoyé est verrouillé : seuls son statut et ses dates de décision peuvent évoluer.
CREATE OR REPLACE FUNCTION quotes_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'devis envoyé : suppression interdite';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' THEN
    IF (to_jsonb(NEW) - 'status' - 'decided_at' - 'updated_at' - 'version')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at' - 'updated_at' - 'version') THEN
      RAISE EXCEPTION 'devis envoyé : contenu verrouillé (seul le statut peut changer)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER quotes_immutable
  BEFORE UPDATE OR DELETE ON quotes
  FOR EACH ROW EXECUTE FUNCTION quotes_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION quote_lines_guard() RETURNS trigger AS $$
DECLARE
  qid uuid;
  st quote_status;
BEGIN
  IF TG_OP = 'DELETE' THEN qid := OLD.quote_id; ELSE qid := NEW.quote_id; END IF;
  SELECT status INTO st FROM quotes WHERE id = qid;
  IF st IS NOT NULL AND st <> 'draft' THEN
    RAISE EXCEPTION 'devis envoyé : lignes en lecture seule';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER quote_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION quote_lines_guard();
--> statement-breakpoint

-- Un paiement ne se supprime pas et ne se modifie pas : il s'annule (une seule fois, définitivement).
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'paiement : suppression interdite (annulez-le)';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'paiement annulé : modification interdite';
  END IF;
  IF (to_jsonb(NEW) - 'voided_at' - 'void_reason' - 'voided_by')
     IS DISTINCT FROM (to_jsonb(OLD) - 'voided_at' - 'void_reason' - 'voided_by') THEN
    RAISE EXCEPTION 'paiement : montant, date et client ne sont pas modifiables (annulez-le)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payments_immutable
  BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_guard();
--> statement-breakpoint

-- Les imputations sont définitives : annuler le paiement suffit à les neutraliser.
CREATE OR REPLACE FUNCTION payment_allocations_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'imputation de paiement : modification et suppression interdites (annulez le paiement)';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payment_allocations_immutable
  BEFORE UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION payment_allocations_guard();
--> statement-breakpoint

-- Soldes des factures validées (factures et acomptes ; les avoirs viennent en déduction).
CREATE VIEW invoice_balances AS
SELECT
  b.invoice_id,
  b.net_to_pay,
  b.credited,
  b.paid,
  (b.net_to_pay - b.credited - b.paid) AS due
FROM (
  SELECT
    i.id AS invoice_id,
    i.net_to_pay,
    COALESCE((
      SELECT SUM(c.net_to_pay) FROM invoices c
      WHERE c.original_invoice_id = i.id AND c.status = 'validated'
    ), 0) AS credited,
    COALESCE((
      SELECT SUM(a.amount) FROM payment_allocations a
      JOIN payments p ON p.id = a.payment_id
      WHERE a.invoice_id = i.id AND p.voided_at IS NULL
    ), 0) AS paid
  FROM invoices i
  WHERE i.status = 'validated' AND i.kind <> 'credit_note'
) b;
