-- AlterTable
ALTER TABLE "message_attachments" ADD COLUMN     "sticker_meta" JSONB;

-- CreateTable
CREATE TABLE "sticker_packs" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "owner_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stickers" (
    "id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "emojis" TEXT[],
    "width" INTEGER,
    "height" INTEGER,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sticker_packs" (
    "user_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sticker_packs_pkey" PRIMARY KEY ("user_id","pack_id")
);

-- CreateIndex
CREATE INDEX "sticker_packs_owner_id_idx" ON "sticker_packs"("owner_id");

-- CreateIndex
CREATE INDEX "stickers_pack_id_idx" ON "stickers"("pack_id");

-- AddForeignKey
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "sticker_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sticker_packs" ADD CONSTRAINT "user_sticker_packs_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "sticker_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
