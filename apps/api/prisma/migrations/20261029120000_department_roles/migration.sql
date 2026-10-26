-- #379 (ADR-0034, п. 3): роль можно привязать к управленческому подразделению —
-- она действует на его сотрудников и сотрудников всех вложенных подразделений.
-- Expand-only: новая таблица, существующие данные не трогаются. Откат — DROP TABLE.
CREATE TABLE "department_roles" (
    "department_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_roles_pkey" PRIMARY KEY ("department_id","role_id")
);

-- Удаление роли ищет её привязки; FK на roles уже даёт индекс по role_id,
-- но явный индекс фиксирует намерение и переживает смену PK.
CREATE INDEX "department_roles_role_id_idx" ON "department_roles"("role_id");

ALTER TABLE "department_roles" ADD CONSTRAINT "department_roles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "department_roles" ADD CONSTRAINT "department_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
