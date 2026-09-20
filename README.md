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

## Phase 4 : devis, acomptes, paiements (en cours)

Déjà présent dans cette branche :
- montants signés dans le moteur de calcul (lignes de déduction d'acompte), arrondi symétrique ;
- schéma et migrations `0006` / `0007` : devis (`quotes`, `quote_lines`), type `deposit_invoice`, paiements,
  imputations, certificats de retenue, vue `invoice_balances`, et leurs triggers d'immutabilité.

**Pas encore implémenté** : services et pages pour les devis, la facture d'acompte, l'enregistrement des paiements
et le statut payé/en retard. Ces tables ne sont donc pas utilisées par l'application pour l'instant.

## Landing page

`landing/index.html` : page d'accueil statique autonome (HTML/CSS/JS sans dépendance). L'adresse de l'application
se règle avec la constante `APP_URL` en bas du fichier.

## Conventions pour les phases suivantes

- `DATABASE_POOL_MAX` (défaut 10) règle la taille du pool de connexions.
- Montants en `NUMERIC(…, 3)` (millimes) ; jamais de `number` flottant pour les calculs monétaires.
- Toute écriture métier passe par une transaction qui inclut son entrée d'audit (`audit(tx, …)`).
- Les fonctions de service prennent `db` en paramètre (type `Db`) pour être testables sur PGlite.
