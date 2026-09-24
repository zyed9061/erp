-- CreateEnum
CREATE TYPE "MlRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ClientSegment" AS ENUM ('KEY_ACCOUNT', 'RELIABLE', 'OCCASIONAL_LATE', 'SLOW_PAYER', 'INACTIVE', 'NEW');

-- CreateTable
CREATE TABLE "ml_invoice_scores" (
    "factureId" TEXT NOT NULL,
    "lateProbability" DECIMAL(5,4),
    "riskLevel" "MlRiskLevel",
    "reasons" JSONB,
    "predictedDaysLate" INTEGER,
    "expectedPaymentDate" TIMESTAMP(3),
    "isAnomaly" BOOLEAN NOT NULL DEFAULT false,
    "anomalyScore" DECIMAL(6,4),
    "anomalyReasons" JSONB,
    "modelVersion" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ml_invoice_scores_pkey" PRIMARY KEY ("factureId")
);

-- CreateTable
CREATE TABLE "ml_client_segments" (
    "clientId" TEXT NOT NULL,
    "segment" "ClientSegment" NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ml_client_segments_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "ml_model_runs" (
    "modelVersion" TEXT NOT NULL,
    "trainedAt" TIMESTAMP(3) NOT NULL,
    "demoData" BOOLEAN NOT NULL,
    "metrics" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_model_runs_pkey" PRIMARY KEY ("modelVersion")
);

-- CreateIndex
CREATE INDEX "ml_invoice_scores_riskLevel_idx" ON "ml_invoice_scores"("riskLevel");

-- AddForeignKey
ALTER TABLE "ml_invoice_scores" ADD CONSTRAINT "ml_invoice_scores_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_client_segments" ADD CONSTRAINT "ml_client_segments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
