# ERP Facturation

Invoicing app for a Tunisian business: quotes (devis), invoices (factures), credit notes (avoirs), payments, clients, products and PDF export. The UI is available in French, English, Arabic (RTL) and German.

Stack: Next.js 16 (App Router), Prisma 7 + PostgreSQL, Auth.js v5 (credentials), Tailwind CSS 4, AG Grid.

## Requirements

- Node.js 22 or newer
- PostgreSQL 16 (you can use the provided `docker-compose.yml`)

## Local installation

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
#    then set AUTH_SECRET (generate one with: npx auth secret)

# 3. Start PostgreSQL (exposed on port 5433)
docker compose up -d

# 4. Apply migrations and create the admin user
#    (the Prisma client is generated automatically by npm install)
npx prisma migrate deploy
npx prisma db seed

# 5. Start the dev server
npm run dev
```

Open http://localhost:3000 and sign in with the admin account printed by the seed step.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_SECRET` | yes | Secret used to sign sessions. Without it, sign-in fails. |
| `NEXTAUTH_URL` | no | Public URL of the app, e.g. `https://erp.example.com` |
| `SEED_ADMIN_EMAIL` | for seeding | Email of the admin account created by `prisma db seed` |
| `SEED_ADMIN_PASSWORD` | for seeding | Password of that admin account |

Always set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before seeding a real database. Otherwise the seed uses built-in defaults.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |

## Deployment

The app runs on any Node.js host (VPS, Docker, Render, Railway, Vercel) with a PostgreSQL database.

1. Provision PostgreSQL and set `DATABASE_URL`, `AUTH_SECRET` and `NEXTAUTH_URL` on the host.
2. Build:

   ```bash
   npm ci
   npm run build
   ```

   `npm ci` also generates the Prisma client (`src/generated/prisma`, not committed) through the `postinstall` script.

3. Apply migrations on each release, then seed once on the first deployment:

   ```bash
   npx prisma migrate deploy
   npx prisma db seed   # first deployment only
   ```

4. Start the server (port 3000 by default; use `-p` to change it):

   ```bash
   npm start
   ```

Behind a reverse proxy (Nginx, Caddy), forward the `Host` and `X-Forwarded-Proto` headers and serve the app over HTTPS.

On Vercel, keep the default build command and add the environment variables in the project settings. Run `npx prisma migrate deploy` against the production database from your machine or a CI step.
