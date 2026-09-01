# prisma-migrations — additional patterns

## Zero-Downtime: Blue-Green with Prisma

Goal: old (blue) and new (green) code run simultaneously against one schema during a deploy. The schema must satisfy both until the cutover completes.

Phases for moving `email` → `email_new`:

```sql
-- Phase 1 (expand): both shapes work
ALTER TABLE "users" ADD COLUMN "email_new" TEXT;
```

- Phase 2: deploy code writing to **both** columns (dual-write in the repository, one `prisma.$transaction`).

```sql
-- Phase 3 (backfill, batched)
UPDATE "users" SET "email_new" = "email" WHERE "email_new" IS NULL;
-- repeat in chunks; verify: SELECT count(*) FROM "users" WHERE "email_new" IS NULL;
```

- Phase 4: deploy code reading only `email_new`.

```sql
-- Phase 5 (contract): a separate migration AFTER green is fully live
ALTER TABLE "users" DROP COLUMN "email";
ALTER TABLE "users" RENAME COLUMN "email_new" TO "email";
```

Rule: never let one deploy both change the schema destructively and require new code — split into expand-migration → code → contract-migration.

## Monthly Partitioning (`messages`)

Postgres declarative partitioning, created in the **first** migration containing `messages` (retrofitting partitions over 100M rows is the expensive path we avoid):

```sql
CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  -- ...
  PRIMARY KEY ("id", "created_at")  -- partition key must be part of PK
) PARTITION BY RANGE ("created_at");

CREATE TABLE "messages_2026_09" PARTITION OF "messages"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
-- ...
```

- New partitions are created ahead of time by a scheduled BullMQ job (monthly), never lazily on insert failure.
- PK/unique constraints must include the partition key — plan FK references accordingly (other tables reference `messages(id, created_at)` or don't FK at all).
- Detach + archive old partitions instead of `DELETE` when retention policy requires.

## JSONB `custom_fields`

Values of custom fields live in a JSONB column per entity (see data-model.md):

```sql
ALTER TABLE "tasks" ADD COLUMN "custom_fields" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX "tasks_custom_fields_gin" ON "tasks" USING GIN ("custom_fields");
```

- Query by key: `"custom_fields" ->> 'building_type' = '<dictionary-item-uuid>'`.
- Fields flagged "index for reporting" are additionally materialized into typed **generated columns** in a follow-up migration:

```sql
ALTER TABLE "tasks" ADD COLUMN "cf_building_type" UUID
  GENERATED ALWAYS AS (("custom_fields" ->> 'building_type')::uuid) STORED;
CREATE INDEX "tasks_cf_building_type_idx" ON "tasks" ("cf_building_type");
```

## Full-Text Search (Russian)

```sql
ALTER TABLE "messages" ADD COLUMN "search_vector" tsvector;
CREATE INDEX "messages_search_idx" ON "messages" USING GIN ("search_vector");
-- backfill in chunks (see SKILL.md), then keep fresh via trigger or app-side write
```

Use the `russian` text search configuration; the SearchProvider interface hides this so Meilisearch can replace it in V2 without contract changes.

## Moving Data Between Services (rare)

Prefer domain events over bulk copies. When a bulk move is unavoidable (e.g., re-parenting), do it in a BullMQ job with idempotent batching (record `last_processed_id`), not in a migration — migrations must stay fast and lock-light.

## Checklist Additions for Reviewers

- [ ] No `CREATE INDEX CONCURRENTLY` inside the Prisma transaction (run via separate `--create-only` edit)
- [ ] Long backfills are batched (≤ 5–10k rows per statement) or moved to a BullMQ job
- [ ] Destructive phases are split across deploys (expand/contract), not stacked into one PR
- [ ] New partitions for `messages` covered up to next quarter
