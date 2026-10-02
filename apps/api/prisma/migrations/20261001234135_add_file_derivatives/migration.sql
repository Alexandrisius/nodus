-- CreateTable
CREATE TABLE "file_derivatives" (
    "id" UUID NOT NULL,
    "file_object_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "key" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mime" TEXT NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_derivatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_derivatives_file_object_id_idx" ON "file_derivatives"("file_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_derivatives_file_object_id_version_kind_key" ON "file_derivatives"("file_object_id", "version", "kind");

-- AddForeignKey
ALTER TABLE "file_derivatives" ADD CONSTRAINT "file_derivatives_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
