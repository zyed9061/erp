# Recherche : systèmes de facturation existants et cahier des charges (contexte Tunisie)

Date de la recherche : septembre 2026. Cible : application de facturation TypeScript (front + back) avec PostgreSQL, utilisateur probablement en Tunisie.

## Conventions de fiabilité

- **[V]** : point lu dans une source web citée (page officielle de l'éditeur ou texte de loi quand c'était possible).
- **[B]** : information provenant de blogs d'éditeurs ou de cabinets tunisiens (secondaire, à confirmer auprès d'un expert-comptable ou du texte officiel).
- **[NV]** : non vérifié pendant cette recherche (connaissance générale ou source silencieuse). À confirmer avant de l'inscrire dans le cahier des charges.
- Aucune source officielle primaire tunisienne (JORT, texte de la loi n° 2025-17 en PDF, spécification TEIF de TTN) n'a pu être ouverte. Les points fiscaux tunisiens reposent donc surtout sur des blogs de cabinets et d'éditeurs. Ils doivent être validés par un expert-comptable tunisien.

---

## (a) Tableau comparatif des fonctionnalités

Légende : ✔ = présent [V] ; ✔? = probable mais non vérifié [NV] ; ○ = partiel, option payante ou module tiers ; ? = pas d'information trouvée ; — = hors périmètre du produit.

### Solutions open source

| Fonctionnalité | Invoice Ninja | Odoo Invoicing | InvoiceShelf (ex-Crater) | Akaunting | Kill Bill |
|---|---|---|---|---|---|
| Licence / modèle | "Source available", auto-hébergeable + SaaS | Community (LGPL) / Enterprise (payant) [NV pour licences] | AGPL-3.0 | Cœur gratuit open source + apps payantes | Open source (auto-hébergé) + offre gérée "Aviate" |
| Stack | PHP/Laravel [NV] | Python + PostgreSQL [NV] | PHP 8.4/Laravel, Vue.js + TypeScript, MySQL/PostgreSQL/SQLite | Laravel, Vue, Tailwind | Java [NV] |
| Clients / contacts | ✔ | ✔ | ✔ | ✔ | ✔ (comptes) |
| Produits / services | ✔ | ✔ | ✔ | ✔ | ✔ (catalogue XML de plans) |
| Devis | ✔ (avec e-signature) | ✔ via app Ventes [NV] | ✔ (estimates) | ✔ (estimates) | — |
| Factures | ✔ | ✔ | ✔ | ✔ | ✔ (générées par les abonnements) |
| Avoirs | ✔ (endpoint "credits") | ✔ | ? | ○ [NV] | ✔ (crédits, ajustements) |
| Acomptes / paiements partiels | ✔ (deposits, partial) | ✔? (acomptes via Ventes) [NV] | ? | ✔? | — (soldes créditeurs, CBA) |
| Paiements en ligne | ✔ (Stripe, PayPal, Square, GoCardless...) | ✔ (Adyen, PayPal, Stripe) | ? | ✔ | ✔ via plugins (Stripe, PayPal, Adyen, Braintree) |
| Relances impayés | ✔ (rappels automatiques) | ✔ (suivi/follow-up) | ? | ? | ✔ (module "overdue"/dunning) |
| Factures récurrentes | ✔ | ✔ | ✔ | ✔ | ✔ (cœur du produit) |
| Multi-devises | ✔ | ✔ (taux auto) | ✔ | ✔ | ✔? |
| Multi-taxes | ✔ (auto US en Pro) | ✔ (160 pays annoncés) | ✔ | ✔ | ✔ via connecteurs (Avalara, Vertex) |
| PDF / email | ✔ (aperçu PDF temps réel) | ✔ (+ envoi courrier postal) | ✔ (PDF) | ✔ (modèles email) | — (pas de PDF natif) [NV] |
| Rapports | ✔ (P&L, factures, dépenses) | ✔ (balance âgée, P&L, bilan) | ✔ (rapports, dépenses) | ✔ (bilan, grand livre) | ○ (analytics via plugins) |
| Rôles / permissions | ✔? (surtout Enterprise) | ✔ | ✔ | ✔ (fin, par rôle) | ✔ (RBAC) [NV] |
| API / webhooks | ✔ API REST (Pro/Enterprise), webhooks | ✔ (API externe) [NV] | ✔ API (api-docs.invoiceshelf.com) | ✔ API REST | ✔ API REST + notifications |
| Portail client | ✔ (protégé par mot de passe possible) | ✔ | ✔ | ✔ | — |
| Audit / immutabilité | ? | ✔ dates de verrouillage, "Hard Lock" irréversible | ? | ? | ✔ logs d'audit, factures quasi statiques |
| Multi-société | ✔ [NV] | ✔ | ✔ | ✔ | ✔ multi-tenant |
| Spécificités Tunisie | ? | Modules tiers sur l'Odoo Apps Store (timbre fiscal, FODEC, retenue à la source) | ? | ? | ? |

### Solutions SaaS

| Fonctionnalité | Zoho Invoice | QuickBooks Online | Stripe Invoicing | FreshBooks | Sage Business Cloud Accounting | Pennylane | Facture.net (FR) |
|---|---|---|---|---|---|---|---|
| Devis | ✔ (signature numérique) | ✔ | ✔ (option "Invoicing Plus") | ✔ | ✔ | ✔ | ✔ |
| Factures | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Avoirs | ✔? | ✔ (credit memos, remboursements) | ✔ (credit notes) | ✔? | ? | ✔? | ✔ |
| Acomptes / facturation progressive | ✔? (retainers) | ✔ (progress invoicing) | ✔ (paiements partiels, plans de paiement) | ✔ (retainers) | ? | ✔ (factures d'acompte, intermédiaires, de solde) | ? |
| Paiement en ligne | ✔ (10+ passerelles) | ✔ | ✔ (40+ moyens) | ✔ | ✔ | ✔ | ✔ (carte bancaire) |
| Relances | ✔ | ✔? | ✔ (relances + Smart Retries) | ✔ (relances + pénalités) | ✔ (relances + pénalités) | ✔ (scénarios/séquences) | ○ (option payante Facture+) |
| Récurrentes | ✔ | ✔ (limité en multi-devises) | ✔ (via Stripe Billing) | ✔ | ✔ | ✔ | ? |
| Multi-devises | ✔? | ✔ (limité) | ✔ | ✔? | ✔ | ✔? | ? |
| Multi-taxes | ✔? | ✔ | ✔ (Stripe Tax) | ✔? | ✔ | ✔ (TVA FR) | ✔ (TVA FR) |
| PDF / email | ✔ | ✔ | ✔ (page hébergée + PDF) | ✔ | ✔ | ✔ | ✔ |
| Rapports | ✔ (~30 rapports) | ✔ | ✔ (rapprochement auto) | ✔ | ✔ | ✔ (compta intégrée) | ○ |
| Rôles / permissions | ✔ | ✔ (rôles + accès au journal d'audit restreint) | ✔? | ✔? | ? | ✔ (accès par rôle) | ? |
| API / webhooks | ✔? | ✔? | ✔ (API + webhooks : invoice.paid, invoice.voided...) | ✔ (API) | ? | ✔ (API) | ? |
| Portail client | ✔ | ✔? | ✔ (page de facture hébergée + portail client) | ✔ | ? | ✔? | ? |
| Audit / immutabilité | ? | ✔ (journal d'audit) | ✔ (facture finalisée quasi non modifiable ; void ; credit notes) | ? | ? | ✔? | ? |
| Facturation électronique légale | — | — | — (Stripe recommande de consulter les règles locales) | — | — | ✔ Plateforme Agréée française (France) | ○ [NV] |
| Suivi du temps / projets | ✔ | ✔? | — | ✔ | ✔? | — | — |

Notes de lecture :

- Beaucoup de "✔?" sont des cellules que les pages consultées ne détaillaient pas. Elles sont courantes dans ce type de produit mais n'ont pas été vérifiées.
- **Stripe Invoicing** est la meilleure source de référence sur le **cycle de vie d'une facture** (draft, open, paid, void, uncollectible ; finalisation ; credit notes), cf. section (e).
- **Kill Bill** est un moteur de facturation d'abonnements : très utile comme référence de modélisation (usage, ajustements, crédits, dunning), mais ce n'est pas un logiciel de facturation PME (pas de devis, pas de portail, pas de PDF fiscal).
- **Aucune solution étrangère testée ne gère nativement** l'ensemble timbre fiscal + FODEC + retenue à la source + TEIF/El Fatoora. Odoo dispose de modules tiers (timbre, retenue, FODEC) sur son Apps Store. Des solutions tunisiennes locales existent (par exemple Hesabi, Finco, eFactureTN, Swiver ; leurs blogs sont cités ci-dessous), non évaluées en profondeur.

---

## (b) Fonctionnalités indispensables (MVP) et avancées

### MVP (à mon avis, indispensable pour une v1 utilisable et conforme)

1. **Multi-société (ou au minimum une société) et utilisateurs** avec authentification et rôles simples (admin, comptable, commercial, lecture seule).
2. **Clients** : raison sociale, matricule fiscal (13 caractères), adresse, statut fiscal (assujetti TVA, exonéré, exportateur, particulier), conditions de paiement par défaut, contacts, exonération de timbre ou de retenue.
3. **Produits / services** : désignation, prix HT, unité, taux de TVA (0 / 7 / 13 / 19 %), indicateur FODEC.
4. **Devis** : brouillon, envoyé, accepté, refusé, expiré ; conversion en facture.
5. **Factures** : brouillon puis validation (numéro attribué à la validation), lignes, remises, TVA par taux, FODEC, timbre fiscal, retenue à la source, total net à payer, date d'échéance, mentions légales.
6. **Avoirs** (notes de crédit) liés à la facture d'origine (correction par avoir, jamais par modification).
7. **Paiements** enregistrés manuellement (espèces, chèque, virement, effet), imputation partielle ou totale, statuts (payée, partiellement payée, en retard).
8. **Numérotation séquentielle sans trou**, par société, série et année (cf. section (e)).
9. **PDF** propre et conforme (générique ; version imprimable avec mentions légales) et **envoi par email**.
10. **Facture validée immuable** (verrouillage, annulation par avoir uniquement, journal d'audit).
11. **Rapports de base** : balance âgée (impayés), CA par période et par client, récapitulatif de TVA collectée, liste des retenues à la source.
12. **Sauvegardes et export** des données (CSV / Excel).
13. **Conservation 10 ans** des documents (cf. section (c)).

### Avancées (v2 et plus)

- **Intégration El Fatoora / TTN** : génération TEIF v1.8.8, signature XAdES, envoi à TTN, récupération de l'identifiant unique et du QR code (cf. section (c)). Selon le profil de l'utilisateur (assujetti concerné ou non), cela peut passer dans le MVP : à demander.
- Factures récurrentes et abonnements.
- Relances automatiques (emails planifiés, gabarits par niveau).
- Portail client (consultation, téléchargement, paiement en ligne, acceptation de devis).
- Paiement en ligne (passerelles locales : Paymee, Flouci, Konnect, Clictopay/ SMT [NV] ; ou Stripe si le compte est éligible).
- Multi-devises avec taux de change (EUR, USD, autres) et écarts de change.
- Acomptes et facturation progressive (situations de travaux).
- API publique REST + webhooks (jetons d'API, clés par société).
- Import de TEIF fournisseurs / factures d'achat, notes de frais, dépenses.
- Gestion de stock et bons de livraison / bons de commande.
- Déclaration de retenue à la source (fichier TEJ) et export TVA.
- Rapprochement bancaire.
- Rôles fins et permissions par action.
- Modèles PDF personnalisables, multi-langues (français, arabe, avec RTL).
- Intégration comptable (export d'écritures, plan comptable tunisien SCE).
- Application mobile.

---

## (c) Exigences légales et fiscales (Tunisie)

**Rappel de prudence** : ce qui suit vient principalement de blogs de cabinets et d'éditeurs tunisiens et de quelques textes accessibles (article 18 du code de la TVA). À faire valider avant mise en production.

### c.1 Mentions obligatoires et numérotation

- Article 18 du Code de la TVA [V] (via 9anoun.tn) : les assujettis établissent une facture pour chaque opération ; elle comporte la date de l'opération, l'identification du client et son adresse, le numéro de la carte d'identification fiscale (matricule fiscal) de l'assujetti, la désignation du bien ou service avec le prix hors taxes, et **le taux et le montant de la TVA**.
- **Série ininterrompue** [V] : les factures doivent être numérotées "dans une série ininterrompue". Une source [B] précise que la numérotation peut être annuelle (ex. 001/2025) ou continue, chaque série restant identifiable.
- Le matricule fiscal du **client** est obligatoire pour les clients tenus à l'immatriculation ; l'obligation ne s'applique pas dans certains cas aux prestataires de services et détaillants [B, via résultat de recherche non ouvert dans le détail].
- Mentions complémentaires (raison sociale, forme juridique et capital pour SARL/SA, adresse, RIB, mention "export" ou "suspension de TVA" le cas échéant) [B / NV].
- Toute marchandise transportée doit être accompagnée d'une facture ou d'un document équivalent daté (bon de livraison) [B, swiver.io].
- Le régime **forfaitaire** est dispensé de facturation avec TVA [B].
- **Conservation** : 10 ans minimum (loi 96-112 sur le système comptable des entreprises selon [B] finco.tn).

### c.2 TVA

- Taux en vigueur en 2026 [B] : **19 %** (taux normal), **13 %** (taux intermédiaire), **7 %** (taux réduit), **0 %** (exportation), et opérations exonérées. La loi de finances 2026 ne semble pas avoir changé les taux [B].
- Le classement précis "quel produit / service dans quel taux" n'a pas été vérifié : prévoir un **paramétrage du taux par produit**, pas de règle codée en dur.
- Le suffixe "TVA suspendue" / "exonérée" doit pouvoir figurer sur la facture.

### c.3 Timbre fiscal

- [B] **1 dinar (1,000 DT) par facture** en 2026, ligne séparée en pied de facture après le total TTC, **non soumis à la TVA**, ajouté au total. Il s'applique aussi aux ventes exonérées de TVA ; exemptions citées : exportations, factures entre exportateurs, avoirs [B, efacturetn.com]. Les deux sources consultées (efacturetn et integrasys) concordent sur le montant et divergent légèrement sur les exemptions.
- Point à vérifier : la base légale exacte (Code des droits d'enregistrement et de timbre) et le montant exact, car des montants différents ont existé historiquement. Non vérifié dans le texte de loi.
- Le format TEIF prévoit un emplacement dédié au timbre [B].

### c.4 FODEC (Fonds de développement de la compétitivité industrielle)

- [B] **1 % du montant HT** des produits industriels concernés (produits fabriqués localement ou importés, selon la liste légale) ; généralement pas applicable aux services ; à calculer **ligne par ligne**.
- **Ordre de calcul selon efacturetn.com [B]** : montant brut moins remise, puis FODEC (1 % sur les lignes concernées), puis **base TVA = HT + FODEC**, TVA, TTC, timbre, retenue à la source.
- Liste exacte des produits concernés : non vérifiée. Prévoir un indicateur "assujetti FODEC" au niveau du produit.

### c.5 Retenue à la source (RAS)

- Mécanisme [B] : le **client** (débiteur) retient un pourcentage sur le paiement au fournisseur et le verse au Trésor (déclaration avant le 28 du mois suivant, via la plateforme TEJ). Il remet au fournisseur un **certificat de retenue à la source**. Le fournisseur encaisse donc le net.
- Taux cités [B], variables selon la nature et le régime : 1,5 % (honoraires, commissions, loyers versés à des personnes physiques selon une source) ; 3 % (marchés publics et honoraires) ; 10 % ; 15 % (fournisseurs non documentés) ; 20 % (revenus de capitaux, jetons) ; 0,5 % à 1,5 % sur les achats dépassant 1 000 DT (certains cas, notamment payeurs publics).
- **Divergences entre sources** : certaines disent que la base est le **TTC** (efacturetn.com), d'autres le **HT** (hesabi.tn) ; le seuil de 1 000 DT est présenté comme HT (web6 / recherche) ou TTC selon les cas. **Non résolu.** À faire trancher par un expert-comptable ; le logiciel doit donc rendre la base de calcul configurable.
- Conséquence pour le logiciel : la facture peut afficher une ligne "retenue à la source" et un **net à payer**. Il faut suivre les retenues subies comme un type de règlement (paiement partiel + certificat).

### c.6 Facture électronique et El Fatoora (TTN)

État constaté (septembre 2026) :

- **Base légale** : article 53 de la loi n° 2025-17 du 12 décembre 2025 (loi de finances 2026), qui modifie l'article 18 du Code de la TVA en ajoutant "les opérations de prestation de services" au champ de la facturation électronique obligatoire [B : Note commune n° 02/2026 résumée par chaexpert.com ; recherche jibaya.tn non ouverte en détail]. La Note commune n° 02/2026 (en arabe uniquement) est publiée par la DGI.
- **Périmètre** : les prestataires de services ayant déclaré ces opérations à titre principal ou secondaire (y compris professions non commerciales / BNC, "notes d'honoraires"). Environ 380 000 opérateurs concernés [B]. Auparavant : grandes entreprises, État et collectivités, industrie pharmaceutique, hydrocarbures, certains opérateurs (décret 2016-1066 [B]).
- **Application progressive [V-secondaire]** : depuis le 1er janvier 2026, l'obligation s'applique aux prestataires **qui ont adhéré au réseau de facturation électronique et rempli les démarches requises**. Ceux qui sont en cours d'adhésion peuvent continuer à émettre des factures papier jusqu'à l'achèvement des démarches (Note commune 02/2026 via chaexpert.com, letemps.news, businessnews.com.tn).
- **Exclusions** selon la note commune (chaexpert.com) : contrats, notes de débit/crédit et relevés servant de substituts de facture. Divergence : un autre blog (hesabi.tn) dit que les factures **et avoirs** sont concernés. À clarifier.
- **Sanctions** [B] : 100 à 500 DT par facture papier au lieu d'électronique, plafonnées à 50 000 DT par an ; facture électronique non conforme (TEIF ou signature) : 250 à 10 000 DT [finco.tn]. Base : loi de finances 2025, article 71 [B]. Un blog (hesabi.tn) indique que le statut de ces sanctions "n'est pas tranché" ; Business News (30/12/2025) indique que les textes d'application n'étaient pas publiés. **Statut exact des sanctions non vérifié.**
- **Format** : **TEIF** (Tunisian Electronic Invoice Format), XML dérivé d'UN/EDIFACT, version courante annoncée **1.8.8** avec XSD et guide d'implémentation officiel [B]. Montants sur **trois décimales** (1400.000). Sections : en-tête, parties, lignes, totaux de taxes, totaux monétaires, signature, sceau électronique visible (QR code) [B, noqta.tn]. Codes de type de document cités : 380 (facture), 381 (avoir), 383 (note de débit), 386 (acompte), 389 (auto-facturation) [B, noqta.tn].
- **Signature** : XAdES-B (ou XAdES-BES selon la source), avec certificat qualifié émis par l'ANCE / TunTrust [B] ; toute modification après signature invalide le document. Solutions citées : DigiGo, ID-Trust, Entreprise-ID [B].
- **Plateforme TTN** [B] : contrôle du format et de la signature, horodatage, identifiant unique, QR code, archivage légal. Coûts cités : environ 10 DT/mois + 0,190 DT par facture jusqu'à 50 Ko [B]. Les intégrations ERP passent par des endpoints REST (OAuth2, envoi, statut, accusés, PDF, recherche) avec environnement sandbox [B, noqta.tn].
- **Effets commerciaux** : risque de perte de déduction de TVA par le client sur facture non conforme [B, finco.tn] ; la note commune atténue : le droit à déduction n'est pas affecté si l'acheteur détient une facture papier conforme (chaexpert.com).
- **Non vérifié** : spécifications complètes du TEIF, mode d'encodage de FODEC / timbre / retenue dans le XML, conditions exactes d'accès à l'API TTN, calendrier d'adhésion par catégorie.

### c.7 Différences avec la France (pour mémoire)

- **France** : réforme de la facturation électronique de la **1er septembre 2026** (obligation de réception pour toutes les entreprises assujetties ; émission et e-reporting pour grandes entreprises et ETI) ; **1er septembre 2027** pour PME, TPE et micro-entreprises [B : Pennylane, Sellsy, Cegid ; economie.gouv.fr n'a pas pu être ouvert (403)]. Les factures passent par le PPF ou une **Plateforme Agréée (PA, ex-PDP)** ; formats acceptés : **UBL, CII, Factur-X** (PDF avec XML embarqué). Ajout de mentions (SIREN du client, adresse de livraison, nature de l'opération).
- **Tunisie** : modèle centralisé avec un **opérateur unique (TTN)**, un format XML **propre (TEIF)**, signature qualifiée obligatoire, QR code ; pas d'équivalent de Factur-X (PDF hybride). Pas de "plateformes agréées" multiples comme en France.
- Conséquence : si l'utilisateur vise aussi la France, il faudra un module de sortie distinct (Factur-X / UBL). L'architecture doit donc **séparer le modèle de facture interne de ses formats d'export** (TEIF, Factur-X, PDF).

---

## (d) Modèle de données PostgreSQL suggéré (texte, sans code)

Principes généraux :

- Montants monétaires stockés en **NUMERIC** avec **3 décimales** (millimes) pour le TND ; ou entiers en plus petite unité. Ne jamais utiliser de nombres flottants. Stocker aussi la devise et le nombre de décimales de la devise.
- Identifiants techniques UUID ou bigint ; **numéro de facture séparé** de l'identifiant technique.
- Tables multi-société : chaque table métier porte un `company_id` (ou `tenant_id`), avec index composites et, si besoin, Row Level Security.
- Horodatages `created_at`, `updated_at`, `created_by`. Suppression logique là où c'est pertinent ; **jamais de suppression physique de documents validés**.

### Entités principales

1. **companies** (sociétés émettrices) : raison sociale, matricule fiscal, forme juridique, capital, adresse, RIB, logo, régime fiscal (réel / forfaitaire), assujettissement à la TVA, devise de base, paramètres (timbre activé, arrondi, langue).
2. **users**, **roles**, **user_company_roles**, **permissions** : accès et rôles par société.
3. **customers** (tiers, éventuellement aussi fournisseurs) : société, nom, type (personne morale / physique / étranger), matricule fiscal, adresse, pays, devise par défaut, conditions de paiement, statut de retenue à la source, exonération de timbre, notes.
4. **customer_contacts** : contacts, emails, rôle (facturation).
5. **products** : code, désignation, type (bien / service), unité, prix HT par défaut, taux de TVA par défaut, indicateur FODEC, actif.
6. **tax_rates** : code, libellé, taux (0, 7, 13, 19), type (TVA, FODEC, retenue), période de validité ; **tax_rate_history** si les taux changent.
7. **payment_terms** : libellé, délai, modalité (à réception, 30 jours fin de mois...).
8. **document_series** (séries de numérotation) : société, type de document (facture, avoir, devis, acompte...), exercice, préfixe, format, dernier numéro attribué (voir section (e)).
9. **quotes** (devis) et **quote_lines** : statut, validité, lien éventuel avec la facture générée.
10. **invoices** : société, client, type (facture, avoir, acompte, facture finale), série, **numéro** (nul en brouillon, unique et sans trou après validation), statut (brouillon, validée, envoyée, partiellement payée, payée, annulée par avoir), date d'émission, date d'échéance, devise, taux de change, totaux (HT, remises, FODEC, base TVA, TVA, timbre, TTC, retenue à la source, net à payer), références (bon de commande, devis d'origine), **facture d'origine** pour les avoirs (`original_invoice_id`), mentions légales, **instantané des données client et émetteur au moment de la validation** (nom, matricule, adresse copiés dans la facture), empreinte de contrôle (hash), verrou, dates de validation.
11. **invoice_lines** : facture, ordre, produit (nullable), désignation, quantité, unité, prix unitaire HT, remise, taux TVA appliqué (copié, pas une simple référence), assiette FODEC, total ligne HT, montant TVA de la ligne.
12. **invoice_tax_lines** (récapitulatif par taux) : facture, type de taxe, taux, base, montant. Sert au PDF, au TEIF et aux états de TVA.
13. **payments** : société, client, date, montant, devise, mode (espèces, chèque, virement, carte, effet, retenue à la source), référence, statut, compte bancaire / caisse.
14. **payment_allocations** : lien paiement <-> facture (montant imputé) ; permet paiements partiels, groupés et avoirs imputés.
15. **withholding_certificates** (certificats de retenue) : facture / paiement lié, taux, base, montant retenu, numéro de certificat, date, fichier joint.
16. **credit_notes** : soit un type de `invoices`, soit une table dédiée liée à `invoices` ; totaux et lignes symétriques, avec motif.
17. **recurring_templates** et **recurring_runs** : modèle de facture, fréquence, prochaine date, historique des générations (idempotence).
18. **reminders** / **reminder_rules** : règles de relance (J+X), historique des envois.
19. **documents / attachments** : PDF générés, TEIF signés, accusés de réception TTN, certificats ; chemin de stockage, hash, taille, date.
20. **einvoice_submissions** (El Fatoora) : facture, XML TEIF généré, signature, identifiant TTN, statut (à envoyer, envoyé, accepté, rejeté), message d'erreur, dates, nombre de tentatives.
21. **audit_log** : entité, id, action, utilisateur, avant / après (JSON), IP, horodatage ; **table en ajout seul** (droits UPDATE / DELETE retirés).
22. **webhooks**, **api_keys**, **webhook_deliveries** (plus tard).
23. **exchange_rates** : devise, date, taux (si multi-devises).
24. **settings / sequences** : paramètres par société, modèles d'email et de PDF.

### Relations clés

- companies 1—N customers, products, invoices, payments, document_series.
- customers 1—N invoices ; invoices 1—N invoice_lines ; invoices 1—N invoice_tax_lines.
- invoices N—N payments via payment_allocations.
- invoices (avoir) N—1 invoices (facture d'origine) via `original_invoice_id`.
- quotes 0..1—N invoices (un devis peut donner lieu à plusieurs factures : acompte, solde).
- invoices 1—N einvoice_submissions (historique) ; invoices 1—N attachments.
- Contraintes recommandées : unicité (`company_id`, `series`, `fiscal_year`, `number`) ; CHECK sur les totaux (somme des lignes = total) ; interdiction de UPDATE sur les lignes d'une facture validée (trigger ou politique).

---

## (e) Pièges courants

### e.1 Arrondis

- Le dinar tunisien a **trois décimales** (millime) ; le TEIF impose trois décimales [B]. Ne pas arrondir à deux par habitude.
- Décider **où** on arrondit : par ligne ou sur le total par taux de TVA (les deux existent en pratique ; le résultat diffère de quelques millimes). **Choisir une règle, la documenter, l'appliquer partout** (PDF, TEIF, rapports). Le total affiché doit être exactement la somme de ce qui est affiché.
- Utiliser une bibliothèque décimale côté TypeScript (par exemple decimal.js ou big.js) ou des entiers de millimes ; **jamais** `number` flottant natif pour les calculs monétaires. Côté PostgreSQL : NUMERIC.
- Calculer les taxes **dans l'ordre légal** : remise, FODEC, TVA sur (HT + FODEC), TTC, timbre, retenue [B]. Une erreur d'ordre change les totaux.
- Multi-devises : figer le taux à la validation ; arrondir la devise étrangère selon ses propres décimales.

### e.2 Numérotation sans trou

- Une **séquence PostgreSQL native n'est pas sans trou** : la valeur n'est pas restituée après un ROLLBACK (Cybertec, doc PostgreSQL). À ne **pas** utiliser pour les numéros fiscaux.
- `MAX(numéro) + 1` échoue en concurrence (doublons ou blocage).
- Approche recommandée [V, Cybertec] : **table de compteurs** (une ligne par société / série / exercice), incrémentée dans **la même transaction** que la validation de la facture, avec **verrou de ligne** (`UPDATE ... RETURNING` ou `SELECT ... FOR UPDATE`). Un verrou de table complet est trop restrictif. Contrepartie : la validation est **sérialisée** par série (acceptable pour la facturation).
- **N'attribuer le numéro qu'à la validation**, pas au brouillon. Un brouillon abandonné ne consomme aucun numéro.
- Une facture validée ne se supprime pas : on l'**annule par un avoir** ; le numéro reste utilisé. Si une facture doit être invalidée avant envoi, prévoir une procédure "annulée" conservant le numéro.
- Si l'envoi à TTN est asynchrone : attention à la relation numéro interne / identifiant TTN ; en cas de rejet, prévoir un mécanisme de correction cohérent avec la loi (non vérifié).

### e.3 Immutabilité des factures validées

- Modèle de cycle de vie inspiré de Stripe [V] : `draft` (tout est modifiable, suppression possible) -> `open` / validée (seuls quelques champs non fiscaux modifiables : mémo, métadonnées) -> `paid` / `void` / `uncollectible`. Stripe précise que pour des changements substantiels il faut **créer une nouvelle facture et annuler l'ancienne**, et recommande de consulter la réglementation locale (une simple annulation peut être interdite ; avoir obligatoire).
- Odoo [V] : "Lock Everything Date" et "Hard Lock Date" irréversible pour la période comptable clôturée ; Kill Bill [V] : factures "pour l'essentiel statiques", ajustements par lignes de crédit.
- Implémentation : statut + verrou applicatif, mais aussi **protection en base** (trigger interdisant UPDATE / DELETE sur `invoices` et `invoice_lines` une fois validées ; rôle applicatif sans droit DELETE), **copie figée** des données client et société, **hash chaîné** optionnel, PDF et TEIF signé conservés comme **artefacts immuables**.
- Le TEIF signé est par nature immuable : toute modification invalide la signature [B].
- Historiser tout changement dans `audit_log`.

### e.4 Concurrence

- Validations simultanées de deux factures dans la même série : gérées par le verrou de ligne du compteur (voir e.2). Tester avec une charge concurrente.
- Double envoi (double clic, retry réseau) : utiliser des **clés d'idempotence** pour la validation, l'envoi email et l'envoi TTN.
- Paiements simultanés sur la même facture : verrouiller la facture (`SELECT ... FOR UPDATE`) ou contrôler la somme des allocations par contrainte pour éviter le sur-paiement.
- Modification concurrente d'un brouillon : verrou optimiste (colonne `version` / `updated_at`).
- Factures récurrentes : empêcher qu'un même cycle génère deux factures (contrainte d'unicité sur modèle + période).
- Isolation : niveau READ COMMITTED suffit avec verrous explicites ; SERIALIZABLE possible mais avec retries.

### e.5 Autres pièges

- **Fuseau horaire** : Africa/Tunis (UTC+1, sans heure d'été) ; dates de facture en `date`, horodatages en UTC.
- **Modification des taux de TVA / FODEC / timbre dans le temps** : historiser, et copier le taux appliqué sur la ligne.
- **Retenue à la source** : base (HT / TTC) et seuil non tranchés dans mes sources ; les rendre paramétrables et documentés.
- **Avoir partiel / total** : ne pas dépasser le montant restant de la facture ; le timbre n'est pas remboursé dans l'avoir [B, exemption des avoirs] (à confirmer).
- **Arabe / RTL** dans les PDF (polices, sens d'écriture) si l'utilisateur l'exige.
- **Multi-devises** : facture en devise étrangère, contre-valeur en TND pour la TVA / le Trésor [NV].
- **Conservation 10 ans** : sauvegardes, stockage des PDF / TEIF, migration de schéma sans perdre l'historique.
- **Sécurité des données** : loi tunisienne sur la protection des données personnelles (loi organique 2004-63) [NV] ; chiffrement des sauvegardes, journal d'accès.
- **Certificat de signature** : la clé privée du certificat (ANCE / TunTrust) est sensible ; ne pas la stocker en clair dans la base [NV].
- **Périmètre d'un système "de facturation" versus "de comptabilité"** : Akaunting / Odoo font de la comptabilité en partie double ; décider si l'application doit générer des écritures (probablement plus tard).

---

## (f) Questions ouvertes à poser à l'utilisateur

**Périmètre et cible**
1. Qui va utiliser le logiciel : une seule entreprise (la vôtre), plusieurs sociétés (cabinet, groupe), ou un produit SaaS vendu à des clients tunisiens ?
2. Quels secteurs : services, commerce (marchandises), industrie (FODEC), BTP ? Cela change les fonctionnalités (stock, bons de livraison, situations de travaux).
3. Combien de factures par mois, combien d'utilisateurs simultanés ?
4. Volonté d'intégration comptable (export vers un logiciel comptable, plan comptable SCE, écritures) ?

**Conformité**
5. L'émetteur est-il **soumis à El Fatoora** (prestataire de services, grande entreprise, autre) et à quelle date ? Faut-il l'envoi TTN dès la v1 ?
6. Disposez-vous déjà d'un **certificat de signature** (TunTrust / ANCE) et d'un compte TTN ? Sinon, prévoir mode sandbox d'abord.
7. Quel est le régime fiscal (réel, forfaitaire, exonéré) ?
8. Y a-t-il des produits soumis à **FODEC**, des taux de TVA 7 % / 13 % ?
9. Les clients appliquent-ils la **retenue à la source** ? Quels taux, quelle base (HT ou TTC), quel seuil ? (Un expert-comptable doit trancher.)
10. Comment gérez-vous le **timbre fiscal** (toujours 1 DT, exceptions à gérer) ?
11. Besoin d'une **numérotation par série** (par année, par type de client, par établissement) ?
12. Y a-t-il une contrainte de facturation à l'export (mention, TVA à 0 %, devise étrangère) ?

**Fonctionnel**
13. Faut-il des devis, des bons de commande / de livraison, des acomptes, des factures récurrentes ?
14. Faut-il gérer des **achats / factures fournisseurs** (import de TEIF entrantes) ou seulement les ventes ?
15. Modes de paiement à suivre (espèces, chèque, virement, traite / effet, carte) et **paiement en ligne** (quelle passerelle : Paymee, Flouci, Konnect, Stripe) ?
16. Devises nécessaires (TND seul, EUR, USD) et source des taux de change ?
17. Langues des documents : français, arabe, anglais ? Besoin de PDF bilingues ?
18. Modèles de PDF personnalisés (logo, couleurs, mentions de pied de page) ?
19. Relances automatiques : à quelle cadence, par email, par SMS / WhatsApp ?
20. Portail client nécessaire ?
21. Rôles attendus (admin, comptable, commercial, lecture seule) et besoin de validation à deux niveaux ?

**Technique**
22. Préférences de stack TypeScript : front (React / Next.js / Vue), back (NestJS / Express / Fastify), ORM (Prisma / Drizzle / TypeORM) ? Monorepo ?
23. Hébergement : cloud, serveur local (on-premise), Docker ? Contraintes de localisation des données en Tunisie ?
24. Multi-tenant : base unique avec `company_id` ou une base par client ?
25. Intégrations souhaitées : email (SMTP / service), stockage de fichiers, API publique, webhooks, import de données existantes (Excel, ancien logiciel) ?
26. Niveau d'exigence d'audit : journal d'audit, hash chaîné, export pour contrôle fiscal ?
27. Contraintes de calendrier, budget, équipe, et priorité entre "livrer vite un MVP" et "conformité TTN complète" ?

---

## Sources

**Tunisie : facturation électronique, TEIF, El Fatoora**
- https://hesabi.tn/actualites/facturation-electronique-obligatoire-tunisie-2026
- https://finco.tn/blog/guide-complet-facturation-electronique-tunisie
- https://elfatoora.digital/index.php?lang=en
- https://chaexpert.com/facturation-electronique-nc02/ (Note commune n° 02/2026, résumé)
- https://jibaya.tn/docs/note-commune-n02-2026/ (texte de la note commune, en arabe ; trouvé dans les résultats mais non ouvert)
- https://letemps.news/2026/01/26/facturation-electronique-le-ministere-des-finances-detaille-lelargissement-prevu-par-la-lf-2026/
- https://businessnews.com.tn/2025/12/30/facture-electronique-ce-qui-va-reellement-changer-a-partir-du-1er-janvier-2026/1380856/
- https://managers.tn/2025/12/16/pour-une-meilleure-tracabilite-la-facture-electronique-couvrira-plus-de-services-en-2026/ (dans les résultats, non ouvert)
- https://noqta.tn/en/tutorials/format-teif-specifications-techniques-tunisie-2026
- https://efacturetn.com/fr/facture-electronique-tunisie ; https://www.ng-sign.com/comprendre-le-format-xml-teif-pour-la-facturation-electronique-en-tunisie/ (dans les résultats, non ouverts)

**Tunisie : TVA, timbre, FODEC, retenue à la source, mentions**
- https://9anoun.tn/fr/kb/codes/code-taxe-sur-valeur-ajoutee/code-taxe-sur-valeur-ajoutee-article-18 (article 18 du Code de la TVA)
- https://swiver.io/blog/facturation-en-tunisie-les-obligations-legales/
- https://efacturetn.com/fr/blog/fodec-timbre-fiscal-taxes-specifiques-tunisie
- https://efacturetn.com/fr/blog/taux-tva-tunisie-2026-guide-complet (dans les résultats, non ouvert)
- https://integrasys-erp.com/ressources/fiscalite-tunisienne/timbre-fiscal-regles
- https://finco.tn/blog/retenue-a-la-source-tunisie-2026
- https://hesabi.tn/actualites/taux-retenue-source-tunisie-2026
- https://finco.tn/blog/fodec-tunisie-guide-complet (dans les résultats, non ouvert)
- https://www.finances.gov.tn/fr/apercu-general-sur-la-fiscalite (site du ministère, dans les résultats, non ouvert)

**France**
- https://www.pennylane.com/fr/fiches-pratiques/facture-electronique/facturation-electronique-dates-cles-et-calendrier
- https://go.sellsy.com/blog/calendrier-de-la-facturation-electronique
- https://www.cegid.com/fr/facture-electronique-obligatoire/calendrier-facture-electronique/
- https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises (403, non consulté ; à ouvrir manuellement)

**Solutions open source**
- Invoice Ninja : https://invoiceninja.com/features/ ; https://invoiceninja.github.io/docs/api-reference/invoice-ninja-api-reference ; https://api-docs.invoicing.co/
- Odoo : https://www.odoo.com/app/invoicing ; https://www.odoo.com/documentation/18.0/applications/finance/accounting/customer_invoices.html ; https://www.odoo.com/documentation/18.0/applications/finance/accounting/reporting/year_end.html
- Modules Odoo Tunisie (tiers) : https://apps.odoo.com/apps/modules/18.0/infolib_l10n_tn_stamp_tax ; https://apps.odoo.com/apps/modules/17.0/l10n_tn_withholding_tax ; https://github.com/rayen-omar/odoo-tunisia-invoicing
- InvoiceShelf : https://github.com/InvoiceShelf/InvoiceShelf
- Akaunting : https://akaunting.com/features
- Kill Bill : https://killbill.io/ ; https://docs.killbill.io/latest/userguide_subscription.html

**Solutions SaaS**
- Zoho Invoice : https://www.zoho.com/invoice/features/
- Stripe : https://docs.stripe.com/invoicing ; https://docs.stripe.com/invoicing/overview
- Pennylane : https://www.pennylane.com/fr/fiches-pratiques/facturation ; https://help.pennylane.com/fr/articles/18629-creer-et-modifier-des-factures-d-acompte-intermediaires-ou-de-solde
- Facture.net : https://www.facture.net/
- QuickBooks : https://quickbooks.intuit.com/accounting/invoicing/ ; https://quickbooks.intuit.com/learn-support/en-us/help-article/audit-log/use-audit-log-quickbooks-online/L2WoVnW6I_US_en_US ; https://quickbooks.intuit.com/learn-support/en-us/help-article/access-permissions/user-roles-access-rights-quickbooks-online/L66POfRrI_US_en_US
- FreshBooks : https://www.freshbooks.com/features ; https://www.freshbooks.com/api/start (résultats de recherche, pages non ouvertes)
- Sage : https://www.sage.com/en-gb/sage-business-cloud/sage-accounting/features/invoicing/ (résultat de recherche, page non ouverte)

**PostgreSQL / numérotation**
- https://www.cybertec-postgresql.com/en/postgresql-sequences-vs-invoice-numbers/
- https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/
- https://github.com/kimmobrunfeldt/howto-everything/blob/master/postgres-gapless-counter-for-invoice-purposes.md

---

## Limites de cette recherche

- Aucune source **primaire tunisienne** ouverte (texte de la loi n° 2025-17, JORT, spécifications TEIF de TTN, Note commune en arabe). Les points c.1 à c.6 doivent être validés.
- Points contradictoires entre sources non résolus : base de la retenue à la source (TTC ou HT), statut des sanctions El Fatoora, inclusion ou non des avoirs dans l'obligation, exemptions exactes du timbre fiscal.
- Pas de test des produits ; les cellules "✔?" du comparatif sont plausibles mais non confirmées ; pour Sage, FreshBooks, QuickBooks et Pennylane les informations viennent de résultats de recherche, pas de pages d'éditeur ouvertes en entier.
- Page economie.gouv.fr (France) non accessible ; calendrier français cité via des éditeurs (Pennylane, Sellsy, Cegid).

## Résumé (10 lignes)

1. Le paysage : Invoice Ninja, Odoo, InvoiceShelf, Akaunting (PME) et Kill Bill (abonnements) côté open source ; Zoho, QuickBooks, Stripe, FreshBooks, Sage, Pennylane, Facture.net côté SaaS. Le socle commun : clients, produits, devis, factures, avoirs, paiements, relances, récurrence, multi-devises, portail, API.
2. Aucun produit étranger ne couvre nativement timbre fiscal + FODEC + retenue à la source + TEIF : c'est le vrai différenciateur d'un logiciel tunisien.
3. Tunisie : TVA 19/13/7 % (+0 %), timbre 1 DT, FODEC 1 % (HT + FODEC = base TVA), retenue à la source (taux et base à confirmer), numérotation sans interruption (art. 18 Code TVA), conservation 10 ans.
4. El Fatoora : extension aux prestataires de services par l'article 53 de la LF 2026, applicable progressivement depuis le 1er janvier 2026 aux adhérents du réseau TTN ; format TEIF v1.8.8 (XML, 3 décimales), signature XAdES, QR code ; sanctions annoncées mais statut incertain.
5. France : facture électronique à partir du 1er septembre 2026 (grandes entreprises / ETI ; réception pour tous) et 2027 (PME), via plateformes agréées, formats Factur-X / UBL / CII : à traiter comme un export séparé.
6. MVP : facture validée immuable, avoirs, numérotation sans trou, TVA/FODEC/timbre/RAS, paiements, PDF/email, rapports de base, audit. Avancé : TTN, récurrence, relances, portail, API/webhooks, multi-devises.
7. Modèle de données : sociétés, tiers, produits, taxes, séries de numérotation, factures + lignes + récapitulatif de taxes, paiements + imputations, certificats de retenue, soumissions TTN, journal d'audit ; montants en NUMERIC(…,3).
8. Pièges : arrondis en millimes, séquences PostgreSQL avec trous (utiliser une table de compteurs avec verrou), immutabilité (avoir, pas modification), idempotence et concurrence.
9. Points non vérifiés : sources tunisiennes primaires, base de la RAS, sanctions, avoirs dans le périmètre TTN : à faire valider par un expert-comptable.
10. 27 questions ouvertes en (f), dont les plus structurantes : soumission à El Fatoora et certificat de signature, mono ou multi-société/SaaS, secteurs (FODEC), devises, hébergement.
