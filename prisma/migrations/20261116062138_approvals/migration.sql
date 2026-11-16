-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "discountAmount" DECIMAL(14,2),
ADD COLUMN     "listPrice" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "salesDiscountLimitPct" DECIMAL(5,2) NOT NULL DEFAULT 3;
