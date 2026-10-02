-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "avatar_file_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_file_id" UUID;
