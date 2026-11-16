-- AlterTable
ALTER TABLE "DesignVersion" ADD COLUMN     "aiSummary" JSONB,
ADD COLUMN     "parentId" TEXT,
ALTER COLUMN "number" DROP NOT NULL;
