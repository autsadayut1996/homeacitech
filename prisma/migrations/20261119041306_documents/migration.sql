-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "contractTemplateEn" TEXT,
ADD COLUMN     "contractTemplateTh" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "paymentTerms" JSONB,
ADD COLUMN     "quoteTermsEn" TEXT,
ADD COLUMN     "quoteTermsTh" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "DesignVersion" ADD COLUMN     "previewImage" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "snapshot" JSONB;
