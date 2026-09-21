# Facturation (Tunisie)

Application de facturation en TypeScript : Next.js (App Router) + Drizzle ORM + PostgreSQL.
Cahier des charges et recherche : [`docs/recherche-facturation.md`](docs/recherche-facturation.md).

## Démarrage rapide

### Avec Docker (application + PostgreSQL)

```bash
docker compose up --build
```

L'application est sur http://localhost:3000. Au premier lancement, créer l'administrateur :

```bash
docker compose exec app npm run db:seed
```

(identifiants pris dans `ADMIN_EMAIL` / `ADMIN_PASSWORD`, voir `.env.example`).
Le cookie de session est `Secure` en production : pour un accès HTTP hors `localhost`,
définir `COOKIE_SECURE=false` dans l'environnement du service `app`.

### En développement (PostgreSQL seul dans Docker)

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | build et démarrage en production |
| `npm run typecheck` | vérification TypeScript |
| `npm test` | tests (PostgreSQL en mémoire via PGlite, aucun Docker requis) |
| `npm run db:generate` | génère une migration après modification de `src/db/schema.ts` |
| `npm run db:migrate` | applique les migrations |
| `npm run db:seed` | crée l'administrateur initial (ne fait rien si des utilisateurs existent) |

## Phase 1 : fondations (terminée)

- **Authentification** : mot de passe haché (scrypt), sessions en base (le jeton brut n'est jamais stocké,
  seul son SHA-256), cookie `HttpOnly`, expiration 8 h, verrouillage 15 min après 5 échecs.
- **Rôles** : `admin`, `comptable`, `commercial`, `lecture_seule`. La matrice de permissions est dans
  `src/lib/auth/permissions.ts` ; les phases suivantes y ajoutent leurs ressources.
- **Utilisateurs** (`/utilisateurs`, admin) : création, changement de rôle, réinitialisation du mot de passe,
  désactivation (coupe les sessions). Il reste toujours au moins un administrateur actif.
- **Journal d'audit** (`/audit`, admin et comptable) : table en ajout seul. Des triggers PostgreSQL refusent
  UPDATE, DELETE et TRUNCATE (`drizzle/0001_audit_append_only.sql`).

## Phase 2 : référentiels (terminée)

- **Société** (`/parametres`) : raison sociale, matricule fiscal, régime, timbre fiscal (1,000 DT par défaut, configurable).
  Une seule ligne, imposée par une contrainte en base.
- **Taxes** (`/parametres/taxes`) : TVA 19 / 13 / 7 / 0 % et FODEC 1 % pré-remplis. Le code, le type et le taux d'une taxe
  existante sont immuables (trigger) : on désactive l'ancienne et on en crée une nouvelle. Les taux de **retenue à la source**
  ne sont pas pré-remplis : base (HT/TTC) et taux sont à valider avec un expert-comptable.
- **Conditions de paiement** : une seule condition par défaut (index unique partiel), calcul d'échéance (fin de mois inclus).
- **Clients** (`/clients`) : code automatique `CLI-00001`, matricule fiscal obligatoire pour une entreprise assujettie,
  retenue à la source, exonération de timbre, contacts, recherche, désactivation (jamais de suppression).
- **Articles** (`/produits`) : code `ART-00001`, prix HT à 3 décimales, taux de TVA, indicateur FODEC.
- **Numérotation** (`/parametres/numerotation`) : `nextDocumentNumber(tx, type, date)` attribue un numéro **sans trou** via une
  table de compteurs sous verrou de ligne ; un ROLLBACK restitue le numéro. Exercice calculé à l'heure de Tunis.
  Une fois une série utilisée, son préfixe et sa remise à zéro annuelle sont verrouillés.
- Droits : lecture pour tous les rôles ; écriture clients pour admin/comptable/commercial, articles pour admin/comptable,
  paramètres pour admin. Les Server Actions revérifient les droits côté serveur.

## Phase 3 : factures et avoirs (terminée)

- **Moteur de calcul** (`src/lib/invoicing/calc.ts`) : fonction pure, arithmétique exacte en millimes (`BigInt`),
  partagée entre le serveur et l'aperçu en direct de l'éditeur. Ordre : remise → FODEC (par ligne) → TVA sur
  HT + FODEC (arrondie une fois par taux) → TTC → timbre → retenue à la source. Arrondi unique : au millime,
  moitié vers le haut. Le total affiché est toujours la somme de ce qui est stocké.
- **Brouillon** (`/factures/nouveau`) : éditeur de lignes avec aperçu des totaux, verrou optimiste (`version`),
  échéance calculée depuis la condition de paiement, TVA forcée à 0 pour un client exonéré/export.
- **Validation** (`validateDocument`) : dans une seule transaction, attribue le numéro sans trou, fige les données
  client et société, calcule une empreinte SHA-256 (JSON canonique) et verrouille. Refuse : société non renseignée,
  document sans ligne, dépassement du crédit, date antérieure au dernier document validé (numéros chronologiques).
  Si une règle échoue, le numéro est restitué.
- **Immutabilité** : triggers PostgreSQL (migration 0005) interdisant UPDATE/DELETE sur une facture validée et sur
  ses lignes et taxes ; `verifyInvoiceIntegrity` détecte une altération faite en contournant les triggers.
- **Avoirs** : brouillon créé depuis une facture validée (lignes reprises, à ajuster), série `AV` propre, retenue
  reprise de la facture, pas de timbre. Le total des avoirs validés ne peut pas dépasser la facture (verrou de ligne
  sur la facture d'origine).
- **Paramètres ajoutés** : base de la retenue à la source (HT ou TTC) et seuil d'application.

Points à faire valider par un expert-comptable : base et seuil de la retenue, absence de timbre sur les avoirs,
exemptions de timbre, obligation de chronologie des numéros.

## Phase 4 : devis, acomptes, paiements (terminée)

- **Devis** (`/devis`) : brouillon modifiable, puis « Envoyer » qui attribue le numéro `DEV-…` sans trou et verrouille
  le contenu (trigger). Décision accepté / refusé ; un devis expiré ne peut plus être accepté. Pas de timbre ni de
  retenue sur un devis : ils n'apparaissent qu'à la facture.
- **Acomptes** : depuis un devis accepté, une facture d'acompte de p % (une ligne par taux de TVA, base HT + FODEC),
  série `ACO-…`, sans timbre. Le total des acomptes est plafonné à 100 %.
- **Facture finale** : reprend les lignes du devis et **déduit chaque acompte validé** par une ligne négative au même
  taux de TVA, si bien que la TVA n'est jamais comptée deux fois. Une seule facture finale par devis (index unique) ;
  les acomptes en brouillon doivent être validés ou supprimés avant.
- **Paiements** (`/paiements`) : encaissement avec imputation sur une ou plusieurs factures, avance client imputable
  plus tard, plafonds vérifiés sous verrou (reste dû de la facture, montant du paiement). Un paiement ne se modifie ni
  ne se supprime : on l'**annule** avec un motif (triggers) ; ses imputations cessent alors de compter.
- **Statut de paiement** dérivé (jamais stocké) via la vue `invoice_balances` : non payée, partielle, soldée, à
  rembourser, plus un indicateur de retard. Le net à payer déduit déjà la retenue à la source : on n'enregistre que
  l'argent réellement reçu. Les avoirs validés réduisent le reste dû ; le timbre n'étant pas remboursé, il reste dû
  après un avoir total.
- **Certificats de retenue à la source** : suivi par facture, plafonné au montant retenu.
- Montants signés dans le calcul, arrondi symétrique (moitié en s'éloignant de zéro).

Hypothèses à faire valider par un expert-comptable : pas de timbre sur les acomptes (appliqué une fois, à la facture
finale), FODEC intégré dans la base des acomptes puis déduit avec elle, timbre non remboursé par un avoir.

## Phase 5 : PDF, e-mails, relances (terminée)

- **PDF** (`/factures/<id>/pdf`, `/devis/<id>/pdf`, `?download=1` pour télécharger) : généré avec `pdf-lib`, sans service
  externe. En-tête société, tableau paginé (en-tête répété), récapitulatif des taxes, totaux, **montant en lettres**
  (« arrêtée à la somme de … dinars et … millimes »), numéros de page, empreinte du document, filigrane « BROUILLON ».
  Un document validé s'imprime avec les **instantanés figés** à la validation : le PDF ne change pas si la fiche client
  est modifiée ensuite. Polices standard (latin) : un caractère hors latin est remplacé par « ? » au lieu de faire échouer.
- **Envoi par e-mail** (fiche facture / devis) : PDF en pièce jointe, destinataire par défaut = contact de facturation,
  sinon e-mail du client. Journal `email_log` en ajout seul (réussites **et** échecs), refus d'un second envoi identique
  dans la minute, sujet protégé contre l'injection d'en-têtes, corps HTML échappé.
- **Relances automatiques** (`/relances`, `/parametres/relances`) : trois niveaux (7, 15, 30 jours après l'échéance,
  modifiables) avec modèles à variables `{{numero}} {{client}} {{echeance}} {{reste_du}} {{jours_retard}} {{societe}}`.
  On envoie le niveau le plus élevé atteint, une seule fois par facture (index unique) ; une facture payée ou soldée
  n'est plus relancée ; le montant réclamé est le reste dû réel. Une réservation bloquée plus de 15 min redevient
  réessayable ; un échec d'envoi est journalisé et retenté à l'exécution suivante.
- **Déclenchement automatique** : `npm run reminders` (à planifier chaque jour) ou `POST /api/cron/reminders` avec
  `Authorization: Bearer $CRON_SECRET` (désactivée, 404, tant que `CRON_SECRET` est vide). Idempotent.

### Configuration de l'e-mail

Sans `SMTP_HOST`, **aucun e-mail réel n'est envoyé** : un résumé s'affiche dans la console du serveur (mode journal).
Pour envoyer pour de vrai, renseigner `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` et `MAIL_FROM`
(voir `.env.example`). Fonctionne avec tout fournisseur SMTP.

## Phase 6 : stock, bons de livraison, chantiers BTP (terminée)

- **Stock** (`/stock`) : suivi par article (biens uniquement, case « Suivre le stock » sur la fiche). Le stock est la somme
  d'un **registre de mouvements en ajout seul** (entrée, sortie, ajustement d'inventaire motivé, livraison) ; une erreur se
  corrige par un ajustement. Le stock ne peut **jamais devenir négatif**, même avec deux sorties simultanées (verrou sur le
  produit). Seuil d'alerte, ruptures, historique par article.
- **Bons de livraison** (`/livraisons`) : brouillon avec stock affiché, puis **validation** = numéro `BL-…` sans trou **et**
  sortie de stock dans la même transaction (stock insuffisant : tout est annulé, numéro restitué). Bon verrouillé ensuite
  (trigger) ; **annulation** motivée avec remise en stock tant qu'il n'est pas facturé. Prix et TVA copiés de l'article :
  la facture reste reproductible. PDF sans prix, avec zone de signature « Reçu par ».
- **Facturation des bons** : on coche des bons validés d'un même client → un brouillon de facture, chaque bon rattaché
  (jamais facturé deux fois ; supprimer le brouillon libère les bons).
- **Chantiers BTP** (`/chantiers`) : bordereau du marché (postes, quantités, prix, TVA), **situations de travaux** sur
  l'**avancement cumulé** de chaque poste (seule la part ajoutée est facturée), une facture de situation par étape.
  Les quantités sont arrondies sur le cumul, jamais sur l'écart : la somme des situations retombe exactement sur le marché
  à 100 %. Bordereau verrouillé dès la première situation.
- **Retenue de garantie** (% du TTC, déduite du net à payer, en plus de la retenue à la source) : suivie par chantier
  (retenue, libérations, reste), registre de libérations en ajout seul plafonné au reste. Un avoir reprend la retenue de la
  facture d'origine.
- **Retenue de garantie et paiements** : le net à payer l'exclut, donc la partie retenue n'est jamais « en retard ».

Limites connues : pas de valorisation du stock (coût d'achat, CUMP), pas d'avenants au marché, un avoir sur une situation ne
fait pas reculer l'avancement du chantier, et l'encaissement d'une libération de retenue se saisit à part comme un paiement.

## Landing page

`landing/index.html` : page d'accueil statique autonome (HTML/CSS/JS sans dépendance). L'adresse de l'application
se règle avec la constante `APP_URL` en bas du fichier.

## Conventions pour les phases suivantes

- `DATABASE_POOL_MAX` (défaut 10) règle la taille du pool de connexions.
- Montants en `NUMERIC(…, 3)` (millimes) ; jamais de `number` flottant pour les calculs monétaires.
- Toute écriture métier passe par une transaction qui inclut son entrée d'audit (`audit(tx, …)`).
- Les fonctions de service prennent `db` en paramètre (type `Db`) pour être testables sur PGlite.
