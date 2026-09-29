-- AlterTable
ALTER TABLE "file_objects" ADD COLUMN     "derived_from" UUID;

-- AlterTable
ALTER TABLE "message_attachments" ADD COLUMN     "thumb_file_id" UUID;
