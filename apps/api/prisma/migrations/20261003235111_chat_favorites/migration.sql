-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "labels" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","message_id")
);

-- CreateIndex
CREATE INDEX "favorites_user_id_created_at_idx" ON "favorites"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
