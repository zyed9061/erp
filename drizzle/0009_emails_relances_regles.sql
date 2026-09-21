-- Journal d'envoi en ajout seul, et modèles de relance par défaut.

CREATE OR REPLACE FUNCTION email_log_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'email_log est en ajout seul (% interdit)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER email_log_immutable
  BEFORE UPDATE OR DELETE ON email_log
  FOR EACH ROW EXECUTE FUNCTION email_log_forbid_change();
--> statement-breakpoint

-- Variables disponibles : {{numero}} {{client}} {{echeance}} {{reste_du}} {{jours_retard}} {{societe}}
INSERT INTO reminder_rules (level, days_after_due, subject, body, is_active) VALUES
  (1, 7,
   'Rappel : facture {{numero}} échue',
   E'Bonjour {{client}},\n\nSauf erreur de notre part, la facture {{numero}}, échue le {{echeance}}, n''a pas encore été réglée. Le solde restant dû est de {{reste_du}} DT ({{jours_retard}} jours de retard).\n\nNous vous remercions de bien vouloir procéder à son règlement, ou de nous contacter si celui-ci a déjà été effectué.\n\nCordialement,\n{{societe}}',
   true),
  (2, 15,
   'Deuxième rappel : facture {{numero}}',
   E'Bonjour {{client}},\n\nMalgré notre précédent message, la facture {{numero}} (échéance du {{echeance}}) reste impayée pour un montant de {{reste_du}} DT, soit {{jours_retard}} jours de retard.\n\nMerci de régulariser cette situation dans les meilleurs délais. Si un obstacle empêche le règlement, n''hésitez pas à nous en faire part.\n\nCordialement,\n{{societe}}',
   true),
  (3, 30,
   'Dernier rappel amiable : facture {{numero}}',
   E'Bonjour {{client}},\n\nLa facture {{numero}}, échue le {{echeance}}, demeure impayée ({{reste_du}} DT, {{jours_retard}} jours de retard) malgré nos rappels.\n\nNous vous demandons de la régler sans délai, ou de nous contacter pour convenir d''une solution.\n\nCordialement,\n{{societe}}',
   true);
