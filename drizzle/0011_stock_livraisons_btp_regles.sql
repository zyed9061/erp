-- Règles d'intégrité de la phase 6 : stock, bons de livraison, chantiers.

-- Le registre de stock est en ajout seul : une erreur se corrige par un mouvement d'ajustement.
CREATE OR REPLACE FUNCTION stock_movements_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements est en ajout seul (% interdit) : corrigez par un ajustement', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_forbid_change();
--> statement-breakpoint

-- Bon de livraison : verrouillé dès sa validation. Seuls le statut (validé -> annulé), les infos d'annulation
-- et le rattachement à une facture peuvent évoluer ; un bon annulé est définitif.
CREATE OR REPLACE FUNCTION delivery_notes_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'bon de livraison validé : suppression interdite (annulez-le)';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'bon de livraison annulé : modification interdite';
  END IF;
  IF OLD.status = 'validated' THEN
    IF (to_jsonb(NEW) - 'status' - 'cancelled_at' - 'cancel_reason' - 'invoice_id' - 'version' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'cancelled_at' - 'cancel_reason' - 'invoice_id' - 'version' - 'updated_at') THEN
      RAISE EXCEPTION 'bon de livraison validé : contenu verrouillé';
    END IF;
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'bon de livraison validé : retour en brouillon interdit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER delivery_notes_immutable
  BEFORE UPDATE OR DELETE ON delivery_notes
  FOR EACH ROW EXECUTE FUNCTION delivery_notes_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION delivery_note_lines_guard() RETURNS trigger AS $$
DECLARE
  nid uuid;
  st delivery_status;
BEGIN
  IF TG_OP = 'DELETE' THEN nid := OLD.delivery_note_id; ELSE nid := NEW.delivery_note_id; END IF;
  SELECT status INTO st FROM delivery_notes WHERE id = nid;
  IF st IS NOT NULL AND st <> 'draft' THEN
    RAISE EXCEPTION 'bon de livraison validé : lignes en lecture seule';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER delivery_note_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON delivery_note_lines
  FOR EACH ROW EXECUTE FUNCTION delivery_note_lines_guard();
--> statement-breakpoint

-- Bordereau d'un chantier : figé dès qu'une situation existe (un changement de contrat = avenant, hors périmètre).
CREATE OR REPLACE FUNCTION project_lines_guard() RETURNS trigger AS $$
DECLARE
  pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN pid := OLD.project_id; ELSE pid := NEW.project_id; END IF;
  IF EXISTS (SELECT 1 FROM project_situations WHERE project_id = pid) THEN
    RAISE EXCEPTION 'chantier : bordereau verrouillé (une situation existe déjà)';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_lines_locked
  BEFORE INSERT OR UPDATE OR DELETE ON project_lines
  FOR EACH ROW EXECUTE FUNCTION project_lines_guard();
--> statement-breakpoint

-- Les avancements d'une situation suivent le statut de sa facture : plus de modification une fois validée.
CREATE OR REPLACE FUNCTION project_situation_lines_guard() RETURNS trigger AS $$
DECLARE
  sid uuid;
  st invoice_status;
BEGIN
  IF TG_OP = 'DELETE' THEN sid := OLD.situation_id; ELSE sid := NEW.situation_id; END IF;
  SELECT i.status INTO st FROM project_situations s JOIN invoices i ON i.id = s.invoice_id WHERE s.id = sid;
  IF st = 'validated' THEN
    RAISE EXCEPTION 'situation validée : avancements en lecture seule';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_situation_lines_locked
  BEFORE UPDATE OR DELETE ON project_situation_lines
  FOR EACH ROW EXECUTE FUNCTION project_situation_lines_guard();
--> statement-breakpoint

-- Registre des libérations de retenue de garantie : ajout seul.
CREATE OR REPLACE FUNCTION project_holdback_releases_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'project_holdback_releases est en ajout seul (% interdit)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_holdback_releases_immutable
  BEFORE UPDATE OR DELETE ON project_holdback_releases
  FOR EACH ROW EXECUTE FUNCTION project_holdback_releases_forbid_change();
