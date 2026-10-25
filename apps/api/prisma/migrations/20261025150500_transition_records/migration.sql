-- Общий журнал переходов «Процессов» (#428, ADR-0024 п.4; схема — спека
-- #380). Создаётся пустым: пишет его движок в #380. Ссылки на сущности,
-- переходы и стадии — plain UUID без FK (I3: сущности живут в модулях-
-- владельцах, стадии и переходы не удаляются, а архивируются).

CREATE TABLE "transition_records" (
    "id" UUID NOT NULL,
    "entity_kind" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "transition_id" UUID,
    "from_stage_id" UUID NOT NULL,
    "to_stage_id" UUID NOT NULL,
    "actor_id" UUID,
    "rule" TEXT,
    "record_kind" TEXT NOT NULL,
    "participant_id" UUID,
    "comment" TEXT,
    "result_id" TEXT,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "time_entry_id" UUID,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transition_records_pkey" PRIMARY KEY ("id")
);

-- Журнал карточки: свежие записи первыми (история и аналитика).
CREATE INDEX "transition_records_entity_kind_entity_id_created_at_idx"
  ON "transition_records"("entity_kind", "entity_id", "created_at" DESC);
