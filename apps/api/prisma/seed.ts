/**
 * Сидинг (ADR-0002): демо-оргструктура ПассатПроект.
 * Идемпотентен (upsert по уникальным ключам): dev-БД сбрасывается свободно,
 * демо nodus.by — стабильные данные (те же upsert-ы, без deleteMany).
 *
 * Демонстрирует модель эпика M2:
 * - двойная структура: BIM-группа управленчески отдельно, юридически — «Группа ГИПов»;
 * - гибкая связь: помощник ГИПа подчинён ГИПу (managerId) в пределах одной группы;
 * - у подразделений — руководитель (head) и заместитель (deputy).
 */
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL не задан (запуск — через `prisma db seed`, он подхватывает .env)');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

const ALL_PERMISSIONS = [
  'core.admin',
  'task.create',
  'task.assign',
  'directory.read',
  'directory.manage',
  'user.manage',
  'role.manage',
  'dictionary.manage',
  'correspondence.create',
  'correspondence.archive',
];

async function main(): Promise<void> {
  // --- Роли (системные) ---
  const adminRole = await prisma.role.upsert({
    where: { code: 'admin' },
    update: {},
    create: {
      code: 'admin',
      name: 'Администратор',
      description: 'Полный доступ к порталу',
      isSystem: true,
      permissions: { create: ALL_PERMISSIONS.map((permission) => ({ permission })) },
    },
  });
  const headRole = await prisma.role.upsert({
    where: { code: 'head' },
    update: {},
    create: {
      code: 'head',
      name: 'Руководитель',
      description: 'Руководитель подразделения: постановка и назначение задач',
      isSystem: true,
      permissions: {
        create: ['directory.read', 'task.create', 'task.assign', 'correspondence.create'].map(
          (permission) => ({ permission }),
        ),
      },
    },
  });
  const employeeRole = await prisma.role.upsert({
    where: { code: 'employee' },
    update: {},
    create: {
      code: 'employee',
      name: 'Сотрудник',
      description: 'Базовая роль: чтение справочника, работа с задачами',
      isSystem: true,
      permissions: {
        create: ['directory.read', 'task.create'].map((permission) => ({ permission })),
      },
    },
  });

  // --- Должности ---
  async function position(name: string, kind: 'management' | 'legal', sortOrder = 0) {
    return prisma.position.upsert({
      where: { name_kind: { name, kind } },
      update: {},
      create: { name, kind, sortOrder },
    });
  }

  const posDirector = await position('Директор', 'management');
  const posGip = await position('Главный инженер проекта', 'management', 10);
  const posGipAssistant = await position('Помощник ГИПа', 'management', 20);
  const posBimManager = await position('BIM-менеджер', 'management', 30);
  const posEngineer = await position('Инженер-проектировщик', 'management', 40);

  const posLegalEngineer = await position('Инженер-проектировщик', 'legal');
  const posLegalLead = await position('Ведущий инженер-проектировщик', 'legal', 10);
  const posLegalDirector = await position('Директор', 'legal', 20);

  // --- Подразделения (upsert по детерминированному ключу: ищем по name+kind+parent) ---
  async function department(
    name: string,
    kind: 'management' | 'legal',
    parentId: string | null,
    sortOrder = 0,
  ) {
    const existing = await prisma.department.findFirst({
      where: { name, kind, parentId },
    });
    if (existing) return existing;
    return prisma.department.create({ data: { name, kind, parentId, sortOrder } });
  }

  const root = await department('ПассатПроект', 'management', null);
  const depAdmin = await department('Административное', 'management', root.id, 10);
  const depProject = await department('Проектное', 'management', root.id, 20);
  const depBim = await department('Группа BIM-технологий', 'management', depProject.id, 10);

  const legalRoot = await department('ПассатПроект', 'legal', null);
  const legalGip = await department('Группа ГИПов', 'legal', legalRoot.id, 10);
  const legalAdmin = await department('Административное', 'legal', legalRoot.id, 20);

  // --- Пользователи ---
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Nodus!Admin2026';
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'Nodus!Demo2026';
  const adminHash = await argon2.hash(adminPassword, ARGON2_OPTIONS);
  const demoHash = await argon2.hash(demoPassword, ARGON2_OPTIONS);

  async function user(data: {
    email: string;
    passwordHash: string;
    lastName: string;
    firstName: string;
    middleName?: string;
    departmentId?: string;
    positionId?: string;
    legalDepartmentId?: string;
    legalPositionId?: string;
    managerId?: string;
    roleId: string;
  }) {
    const displayName = [data.lastName, data.firstName, data.middleName].filter(Boolean).join(' ');
    const record = await prisma.user.upsert({
      where: { email: data.email },
      update: {},
      create: {
        email: data.email,
        passwordHash: data.passwordHash,
        lastName: data.lastName,
        firstName: data.firstName,
        middleName: data.middleName ?? null,
        displayName,
        departmentId: data.departmentId ?? null,
        positionId: data.positionId ?? null,
        legalDepartmentId: data.legalDepartmentId ?? null,
        legalPositionId: data.legalPositionId ?? null,
        managerId: data.managerId ?? null,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: record.id, roleId: data.roleId } },
      update: {},
      create: { userId: record.id, roleId: data.roleId },
    });
    return record;
  }

  const admin = await user({
    email: 'admin@nodus.by',
    passwordHash: adminHash,
    lastName: 'Администратор',
    firstName: 'Системный',
    departmentId: depAdmin.id,
    positionId: posEngineer.id,
    legalDepartmentId: legalAdmin.id,
    legalPositionId: posLegalEngineer.id,
    roleId: adminRole.id,
  });

  const director = await user({
    email: 'vasilevich@nodus.by',
    passwordHash: demoHash,
    lastName: 'Василевич',
    firstName: 'Евгений',
    departmentId: root.id,
    positionId: posDirector.id,
    legalDepartmentId: legalRoot.id,
    legalPositionId: posLegalDirector.id,
    roleId: headRole.id,
  });

  const gip = await user({
    email: 'ivanov@nodus.by',
    passwordHash: demoHash,
    lastName: 'Иванов',
    firstName: 'Сергей',
    middleName: 'Петрович',
    departmentId: depProject.id,
    positionId: posGip.id,
    legalDepartmentId: legalGip.id,
    legalPositionId: posLegalLead.id,
    roleId: headRole.id,
  });

  // Гибкая связь эпика M2: помощник подчинён ГИПу в пределах одной группы —
  // без фиктивного отдела «ГИП Иванов».
  const gipAssistant = await user({
    email: 'petrov@nodus.by',
    passwordHash: demoHash,
    lastName: 'Петров',
    firstName: 'Андрей',
    departmentId: depProject.id,
    positionId: posGipAssistant.id,
    legalDepartmentId: legalGip.id,
    legalPositionId: posLegalEngineer.id,
    managerId: gip.id,
    roleId: employeeRole.id,
  });

  const bimManager = await user({
    email: 'klimovich@nodus.by',
    passwordHash: demoHash,
    lastName: 'Климович',
    firstName: 'Александр',
    middleName: 'Геннадьевич',
    departmentId: depBim.id,
    positionId: posBimManager.id,
    // Юридически — «Группа ГИПов», ведущий инженер-проектировщик (эпик M2).
    legalDepartmentId: legalGip.id,
    legalPositionId: posLegalLead.id,
    roleId: headRole.id,
  });

  const bimEngineer = await user({
    email: 'sidorova@nodus.by',
    passwordHash: demoHash,
    lastName: 'Сидорова',
    firstName: 'Мария',
    departmentId: depBim.id,
    positionId: posEngineer.id,
    legalDepartmentId: legalGip.id,
    legalPositionId: posLegalEngineer.id,
    managerId: bimManager.id,
    roleId: employeeRole.id,
  });

  // --- Руководители и заместители подразделений (зам — эпик M2) ---
  await prisma.department.update({ where: { id: root.id }, data: { headId: director.id } });
  await prisma.department.update({
    where: { id: depProject.id },
    data: { headId: gip.id, deputyId: gipAssistant.id },
  });
  await prisma.department.update({
    where: { id: depBim.id },
    data: { headId: bimManager.id, deputyId: bimEngineer.id },
  });
  await prisma.department.update({
    where: { id: depAdmin.id },
    data: { headId: admin.id },
  });

  const users = await prisma.user.count();
  const departments = await prisma.department.count();
  console.log(`Seed OK: ${users} пользователей, ${departments} подразделений`);
  console.log('Вход: admin@nodus.by / (SEED_ADMIN_PASSWORD, по умолчанию Nodus!Admin2026)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
