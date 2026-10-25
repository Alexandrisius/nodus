-- #380: окно перехода — часть документа маршрута (ADR-0021: публикуется вместе с ним).
ALTER TABLE "workflow_transitions" ADD COLUMN "form" JSONB NOT NULL DEFAULT '{}';
