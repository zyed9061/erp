# Points à faire valider par un comptable tunisien

L'application applique les règles ci-dessous **telles que le code les implémente aujourd'hui**. Elles viennent de recherches
sur des sites de cabinets et d'éditeurs, sans source officielle (JORT, loi de finances) consultée : **aucune n'est garantie**.
Les taux et montants marqués « paramétrable » se changent dans l'application (Paramètres) sans intervention technique.

| # | Sujet | Ce que fait l'application | Paramétrable ? |
|---|---|---|---|
| 1 | Taux de TVA | 19 %, 13 %, 7 %, 0 % et exonéré, appliqués par ligne | oui (Paramètres > Taxes) |
| 2 | Timbre fiscal | 1,000 DT ajouté au net à payer des factures ; **aucun timbre sur les avoirs ni les factures d'acompte** | montant et activation : oui ; l'exclusion des avoirs/acomptes : non |
| 3 | FODEC | 1 % du HT de la ligne, calculé ligne par ligne, **inclus dans la base de la TVA** | taux : oui ; ligne par ligne : oui |
| 4 | Arrondi | au millime, moitié vers le haut ; remise et FODEC arrondies par ligne, TVA une seule fois par taux | non |
| 5 | Retenue à la source | déduite du net à payer, taux du client ; **base (HT ou TTC hors timbre) et seuil paramétrables** ; par défaut : TTC, seuil 0 | oui |
| 6 | Retenue de garantie (BTP) | pourcentage du **TTC**, déduite du net à payer en plus de la retenue à la source | pourcentage : oui, base : non |
| 7 | Numérotation | sans trou, par type de document et par année, **attribuée à la validation** ; la date d'une facture ne peut pas être antérieure à la dernière facture validée du même type | préfixe et format : oui |
| 8 | Avoirs | rattachés à leur facture, plafonnés au TTC de la facture, reprennent la retenue à la source | non |
| 9 | Acomptes | facture d'acompte en % du devis ; la facture finale déduit les acomptes (lignes de prix négatif) ; le FODEC entre dans la base de l'acompte | non |
| 10 | Rapport de TVA | **base facturation** (documents validés du mois, avoirs déduits), pas base encaissements | non |
| 11 | Retenues subies | suivi des certificats reçus ; « reste à justifier » = retenue sans certificat | non |
| 12 | Créances (balance âgée) | reste à payer = net à payer − avoirs − paiements, classé par jours de retard sur l'échéance | tranches : non |
| 13 | Clients exonérés / export | TVA à 0 ; pas de justificatif d'exonération géré | non |
| 14 | Mentions obligatoires sur la facture | matricule fiscal, adresses, montants, arrêté en toutes lettres ; **liste complète des mentions légales non vérifiée** | non |
| 15 | Conservation 10 ans | aucune suppression des documents validés ; **pas de procédure d'archivage ni de sauvegarde automatique** | non |
| 16 | Matricule fiscal | contrôle minimal (7 chiffres) ; format complet non imposé | non |
| 17 | Facture électronique | obligations, calendrier et sanctions selon la catégorie de l'entreprise : **à confirmer** | non |

À demander au comptable : confirmer ou corriger chaque ligne, en particulier 2, 3, 5, 6, 9 et 10. Toute correction se fait
dans `src/lib/invoicing/calc.ts` (moteur de calcul, testé par `tests/calc.test.ts`) ou dans les paramètres.
