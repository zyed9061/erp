-- CreateEnum
CREATE TYPE "AvoirStatus" AS ENUM ('BROUILLON', 'EMIS', 'APPLIQUE', 'REMBOURSE', 'ANNULE');

-- AlterTable
ALTER TABLE "avoirs" ADD COLUMN     "statut" "AvoirStatus" NOT NULL DEFAULT 'EMIS';

-- AlterTable
ALTER TABLE "produits" ADD COLUMN     "categorie" TEXT,
ADD COLUMN     "stock" INTEGER;
