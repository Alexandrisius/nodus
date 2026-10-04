-- CreateTable
CREATE TABLE "message_links" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "thread_root_id" UUID,
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_vault_stats" (
    "conversation_id" UUID NOT NULL,
    "media_count" INTEGER NOT NULL DEFAULT 0,
    "document_count" INTEGER NOT NULL DEFAULT 0,
    "link_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "conversation_vault_stats_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateIndex
CREATE INDEX "message_links_conversation_id_thread_root_id_position_idx" ON "message_links"("conversation_id", "thread_root_id", "position");

-- CreateIndex
CREATE INDEX "message_links_author_id_idx" ON "message_links"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_links_message_id_position_key" ON "message_links"("message_id", "position");

-- AddForeignKey
ALTER TABLE "message_links" ADD CONSTRAINT "message_links_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_vault_stats" ADD CONSTRAINT "conversation_vault_stats_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
