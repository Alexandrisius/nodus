-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "visibility" TEXT,
    "project_id" UUID,
    "task_id" UUID,
    "letter_id" UUID,
    "permissions" JSONB NOT NULL,
    "last_seq" BIGINT NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "user_min" UUID,
    "user_max" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "last_read_seq" BIGINT NOT NULL DEFAULT 0,
    "last_read_at" TIMESTAMPTZ,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "snoozed" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "seq" BIGINT NOT NULL,
    "author_id" UUID NOT NULL,
    "client_message_id" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "reply_to_id" UUID,
    "reply_snapshot" JSONB,
    "thread_root_id" UUID,
    "fwd_conversation_id" UUID,
    "fwd_message_id" UUID,
    "fwd_author_id" UUID,
    "fwd_thread_root_id" UUID,
    "edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "obliterated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id","user_id","emoji")
);

-- CreateTable
CREATE TABLE "conversation_pins" (
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "pinned_by" UUID NOT NULL,
    "pinned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "conversation_drafts" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversation_drafts_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "thread_participants" (
    "thread_root_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_participants_pkey" PRIMARY KEY ("thread_root_id","user_id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID,
    "file_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_last_message_at_id_idx" ON "conversations"("last_message_at" DESC, "id");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_seq_idx" ON "messages"("conversation_id", "seq" DESC);

-- CreateIndex
CREATE INDEX "messages_thread_root_id_idx" ON "messages"("thread_root_id");

-- CreateIndex
CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_seq_key" ON "messages"("conversation_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "messages_author_id_client_message_id_key" ON "messages"("author_id", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_pins_message_id_key" ON "conversation_pins"("message_id");

-- CreateIndex
CREATE INDEX "conversation_pins_conversation_id_pinned_at_idx" ON "conversation_pins"("conversation_id", "pinned_at" DESC);

-- CreateIndex
CREATE INDEX "thread_participants_user_id_idx" ON "thread_participants"("user_id");

-- CreateIndex
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");

-- CreateIndex
CREATE INDEX "message_attachments_owner_id_idx" ON "message_attachments"("owner_id");

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_root_id_fkey" FOREIGN KEY ("thread_root_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_drafts" ADD CONSTRAINT "conversation_drafts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_root_id_fkey" FOREIGN KEY ("thread_root_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ручные дополнения (не выражаются в schema.prisma — комментарий в модели):

-- CreateIndex
-- Уникальность direct-пары: частичный индекс (только direct-беседы).
CREATE UNIQUE INDEX "conversations_direct_pair_key" ON "conversations"("user_min", "user_max") WHERE "type" = 'direct';

-- CreateIndex
-- Unread-агрегат списка бесед: покрывающий подсчёт по курсору прочтения.
CREATE INDEX "conversation_members_conversation_id_last_read_seq_idx" ON "conversation_members"("conversation_id") INCLUDE ("last_read_seq");

-- AlterTable
-- Пара direct-участников: обе колонки вместе, min <= max («Заметки» — равны),
-- и пара существует только у direct-бесед.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_direct_pair_check" CHECK (
  ("user_min" IS NULL AND "user_max" IS NULL AND "type" <> 'direct')
  OR ("user_min" IS NOT NULL AND "user_max" IS NOT NULL AND "user_min" <= "user_max" AND "type" = 'direct')
);
