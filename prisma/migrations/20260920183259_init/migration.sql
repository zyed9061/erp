-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'COMPTABLE', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DEVIS', 'FACTURE', 'AVOIR');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('PARTICULIER', 'ENTREPRISE');

-- CreateEnum
CREATE TYPE "ProduitType" AS ENUM ('PRODUIT', 'SERVICE');

-- CreateEnum
CREATE TYPE "DevisStatus" AS ENUM ('BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'CONVERTI');

-- CreateEnum
CREATE TYPE "FactureStatus" AS ENUM ('BROUILLON', 'ENVOYEE', 'PARTIELLEMENT_PAYEE', 'PAYEE', 'EN_RETARD', 'ANNULEE');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('VIREMENT', 'CHEQUE', 'ESPECES', 'CARTE', 'AUTRE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'COMMERCIAL',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profile" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "matriculeFiscal" TEXT,
    "registreCommerce" TEXT,
    "adresse" TEXT,
    "ville" TEXT,
    "codePostal" TEXT,
    "pays" TEXT NOT NULL DEFAULT 'Tunisie',
    "telephone" TEXT,
    "email" TEXT,
    "siteWeb" TEXT,
    "iban" TEXT,
    "banque" TEXT,
    "logoUrl" TEXT,
    "devise" TEXT NOT NULL DEFAULT 'TND',
    "tauxTimbreFiscal" DECIMAL(10,3) NOT NULL DEFAULT 1.000,
    "conditionsDefaut" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numbering_sequences" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "annee" INTEGER NOT NULL,
    "dernierNumero" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "numbering_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'ENTREPRISE',
    "nom" TEXT NOT NULL,
    "matriculeFiscal" TEXT,
    "email" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "ville" TEXT,
    "codePostal" TEXT,
    "pays" TEXT NOT NULL DEFAULT 'Tunisie',
    "notes" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produits" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "designation" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProduitType" NOT NULL DEFAULT 'SERVICE',
    "prixUnitaireHT" DECIMAL(12,3) NOT NULL,
    "uniteMesure" TEXT NOT NULL DEFAULT 'unite',
    "tauxTva" DECIMAL(5,2) NOT NULL DEFAULT 19,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devis" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateValidite" TIMESTAMP(3),
    "statut" "DevisStatus" NOT NULL DEFAULT 'BROUILLON',
    "notes" TEXT,
    "conditions" TEXT,
    "sousTotalHT" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalTva" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalTTC" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_devis" (
    "id" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "designation" TEXT NOT NULL,
    "description" TEXT,
    "quantite" DECIMAL(12,3) NOT NULL,
    "prixUnitaireHT" DECIMAL(12,3) NOT NULL,
    "remisePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tauxTva" DECIMAL(5,2) NOT NULL,
    "totalHT" DECIMAL(14,3) NOT NULL,
    "devisId" TEXT NOT NULL,
    "produitId" TEXT,

    CONSTRAINT "lignes_devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateEcheance" TIMESTAMP(3),
    "statut" "FactureStatus" NOT NULL DEFAULT 'BROUILLON',
    "notes" TEXT,
    "conditionsPaiement" TEXT,
    "sousTotalHT" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalTva" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "timbreFiscal" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "totalTTC" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "montantPaye" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "devisOrigineId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_facture" (
    "id" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "designation" TEXT NOT NULL,
    "description" TEXT,
    "quantite" DECIMAL(12,3) NOT NULL,
    "prixUnitaireHT" DECIMAL(12,3) NOT NULL,
    "remisePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tauxTva" DECIMAL(5,2) NOT NULL,
    "totalHT" DECIMAL(14,3) NOT NULL,
    "factureId" TEXT NOT NULL,
    "produitId" TEXT,

    CONSTRAINT "lignes_facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avoirs" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT,
    "sousTotalHT" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalTva" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalTTC" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "factureOrigineId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "avoirs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_avoir" (
    "id" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "designation" TEXT NOT NULL,
    "description" TEXT,
    "quantite" DECIMAL(12,3) NOT NULL,
    "prixUnitaireHT" DECIMAL(12,3) NOT NULL,
    "tauxTva" DECIMAL(5,2) NOT NULL,
    "totalHT" DECIMAL(14,3) NOT NULL,
    "avoirId" TEXT NOT NULL,
    "produitId" TEXT,

    CONSTRAINT "lignes_avoir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "datePaiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montant" DECIMAL(14,3) NOT NULL,
    "modePaiement" "ModePaiement" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "factureId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "numbering_sequences_type_annee_key" ON "numbering_sequences"("type", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "produits_reference_key" ON "produits"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "devis_numero_key" ON "devis"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "factures_numero_key" ON "factures"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "factures_devisOrigineId_key" ON "factures"("devisOrigineId");

-- CreateIndex
CREATE UNIQUE INDEX "avoirs_numero_key" ON "avoirs"("numero");

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_devis" ADD CONSTRAINT "lignes_devis_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_devis" ADD CONSTRAINT "lignes_devis_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_devisOrigineId_fkey" FOREIGN KEY ("devisOrigineId") REFERENCES "devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avoirs" ADD CONSTRAINT "avoirs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avoirs" ADD CONSTRAINT "avoirs_factureOrigineId_fkey" FOREIGN KEY ("factureOrigineId") REFERENCES "factures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avoirs" ADD CONSTRAINT "avoirs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_avoir" ADD CONSTRAINT "lignes_avoir_avoirId_fkey" FOREIGN KEY ("avoirId") REFERENCES "avoirs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_avoir" ADD CONSTRAINT "lignes_avoir_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
