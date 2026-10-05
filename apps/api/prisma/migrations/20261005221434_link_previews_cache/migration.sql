-- CreateTable
CREATE TABLE "link_previews" (
    "id" UUID NOT NULL,
    "normalized_url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "site_name" TEXT,
    "image_file_id" UUID,
    "favicon_file_id" UUID,
    "fetched_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_previews_normalized_url_key" ON "link_previews"("normalized_url");

-- CreateIndex
CREATE INDEX "link_previews_status_expires_at_idx" ON "link_previews"("status", "expires_at");
