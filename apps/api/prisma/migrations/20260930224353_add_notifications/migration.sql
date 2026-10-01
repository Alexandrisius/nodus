-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "tier" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "source_seq" BIGINT NOT NULL,
    "actor_id" UUID,
    "preview" TEXT,
    "urgent_text" TEXT,
    "conversation_id" UUID,
    "conversation_title" TEXT,
    "message_id" UUID,
    "thread_root_id" UUID,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ,
    "ack_at" TIMESTAMPTZ,
    "repeats_stopped_at" TIMESTAMPTZ,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "user_id" UUID NOT NULL,
    "dnd_enabled" BOOLEAN NOT NULL DEFAULT false,
    "dnd_start" TEXT NOT NULL DEFAULT '22:00',
    "dnd_end" TEXT NOT NULL DEFAULT '08:00',

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_seq_key" ON "notifications"("seq");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_seq_idx" ON "notifications"("user_id", "read_at", "seq" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_seq_idx" ON "notifications"("user_id", "seq" DESC);

-- CreateIndex
CREATE INDEX "notifications_source_id_tier_ack_at_idx" ON "notifications"("source_id", "tier", "ack_at");

-- CreateIndex
CREATE INDEX "notifications_tier_read_at_created_at_idx" ON "notifications"("tier", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_event_id_user_id_key" ON "notifications"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_delivered_at_idx" ON "notification_deliveries"("notification_id", "delivered_at");

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
