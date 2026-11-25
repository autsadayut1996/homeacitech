-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "priceIncludesVat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quoteClosingEn" TEXT,
ADD COLUMN     "quoteClosingTh" TEXT,
ADD COLUMN     "quoteFormCode" TEXT,
ADD COLUMN     "quoteIntroEn" TEXT,
ADD COLUMN     "quoteIntroTh" TEXT,
ADD COLUMN     "specTemplate" JSONB;
