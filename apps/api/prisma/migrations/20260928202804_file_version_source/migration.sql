-- AlterTable
ALTER TABLE "file_versions" ADD COLUMN     "source_key" TEXT,
ADD COLUMN     "source_lastsave" BIGINT;
