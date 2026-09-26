/**
 * > 355 строк — осознанное превышение ориентира I5: единый атомарный сид
 * > (роли → должности → отделы → люди → канал) читается как один сценарий;
 * > разнос по модулям усложнил бы порядок зависимостей.
 *
 * Сидинг (ADR-0002): пилотная группа мессенджера — Группа BIM-технологий
 * ПассатПроект (вердикт владельца 26.09.2026: 5 сотрудников + системный
 * админ, БОЛЬШЕ сотрудников и отделов на пилоте нет).
 * Идемпотентен (upsert по уникальным ключам): dev/CI-БД сеются свободно,
 * прод nodus.by — стабильные данные.
 *
 * Пароли (гигиена 26.09: известных дефолтов в git больше нет):
 * - SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD — явная установка (обновит
 *   пароль и у существующих записей — способ ротации стенда);
 * - без env — случайный пароль на каждого НОВОГО пользователя с одноразовой
 *   печатью ниже (существующие записи не перезаписываются).
 */
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
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

/** Созданные этой прогоном учётки с паролями — печать в конце сида
 * (только реально созданные записи — пуш в user()). */
const createdCredentials: { email: string; password: string }[] = [];

function newPassword(envValue: string | undefined): string {
  return envValue ?? `N-${randomBytes(9).toString('base64url')}`;
}

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

  // --- Должности (management; юр-структуры на пилоте нет) ---
  async function position(name: string, sortOrder = 0) {
    return prisma.position.upsert({
      where: { name_kind: { name, kind: 'management' } },
      update: {},
      create: { name, kind: 'management', sortOrder },
    });
  }

  const posHeadBim = await position('Руководитель группы BIM');
  const posBimManager = await position('BIM-менеджер', 10);
  const posBimMaster = await position('BIM-мастер', 20);

  // --- Подразделения: компания → единственная пилотная группа ---
  async function department(name: string, parentId: string | null, sortOrder = 0) {
    const existing = await prisma.department.findFirst({
      where: { name, kind: 'management', parentId },
    });
    if (existing) return existing;
    return prisma.department.create({ data: { name, kind: 'management', parentId, sortOrder } });
  }

  const company = await department('ПассатПроект', null);
  const bimGroup = await department('Группа BIM-технологий', company.id, 10);

  // --- Пользователи ---
  const demoPasswordEnv = process.env.SEED_DEMO_PASSWORD; // стенды: единый пароль
  const adminPassword = newPassword(process.env.SEED_ADMIN_PASSWORD);
  const adminHash = await argon2.hash(adminPassword, ARGON2_OPTIONS);

  const pilotHashes = new Map<string, string>();
  const pilotPasswords = new Map<string, string>();
  const pilots: {
    email: string;
    lastName: string;
    firstName: string;
    middleName?: string;
    positionId: string;
    roleId: string;
  }[] = [
    {
      email: 'a.klimovich@passatproekt.by',
      lastName: 'Климович',
      firstName: 'Александр',
      middleName: 'Геннадьевич',
      positionId: posHeadBim.id,
      roleId: headRole.id,
    },
    {
      email: 'a.matorin@passatproekt.by',
      lastName: 'Маторин',
      firstName: 'Артём',
      middleName: 'Николаевич',
      positionId: posBimManager.id,
      roleId: employeeRole.id,
    },
    {
      email: 'e.polomar@passatproekt.by',
      lastName: 'Поломар',
      firstName: 'Екатерина',
      middleName: 'Александровна',
      positionId: posBimMaster.id,
      roleId: employeeRole.id,
    },
    {
      email: 'd.klemantovich@passatproekt.by',
      lastName: 'Клемантович',
      firstName: 'Денис',
      middleName: 'Теофанович',
      positionId: posBimMaster.id,
      roleId: employeeRole.id,
    },
    {
      email: 'a.voronich@passatproekt.by',
      lastName: 'Воронич',
      firstName: 'Алина',
      middleName: 'Николаевна',
      positionId: posBimMaster.id,
      roleId: employeeRole.id,
    },
  ];
  for (const pilot of pilots) {
    const pass = newPassword(demoPasswordEnv);
    pilotPasswords.set(pilot.email, pass);
    pilotHashes.set(pilot.email, await argon2.hash(pass, ARGON2_OPTIONS));
  }

  /**
   * Upsert пользователя: пароль применяется к существующему ТОЛЬКО при явном
   * env (ротация стенда); без env — только при создании.
   */
  async function user(data: {
    email: string;
    passwordHash: string;
    updatePassword: boolean;
    /** Пароль, показанный один раз — только если запись реально создаётся. */
    generatedPassword?: string;
    lastName: string;
    firstName: string;
    middleName?: string;
    departmentId?: string;
    positionId?: string;
    managerId?: string;
    roleId: string;
  }) {
    const displayName = [data.lastName, data.firstName, data.middleName].filter(Boolean).join(' ');
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    const record = await prisma.user.upsert({
      where: { email: data.email },
      update: data.updatePassword ? { passwordHash: data.passwordHash } : {},
      create: {
        email: data.email,
        passwordHash: data.passwordHash,
        lastName: data.lastName,
        firstName: data.firstName,
        middleName: data.middleName ?? null,
        displayName,
        departmentId: data.departmentId ?? null,
        positionId: data.positionId ?? null,
        managerId: data.managerId ?? null,
      },
    });
    if (!existing && data.generatedPassword) {
      createdCredentials.push({ email: data.email, password: data.generatedPassword });
    }
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: record.id, roleId: data.roleId } },
      update: {},
      create: { userId: record.id, roleId: data.roleId },
    });
    return record;
  }

  // Системный админ (владелец): без отдела, полные права.
  const admin = await user({
    email: 'admin@nodus.by',
    passwordHash: adminHash,
    updatePassword: Boolean(process.env.SEED_ADMIN_PASSWORD),
    generatedPassword: process.env.SEED_ADMIN_PASSWORD ? undefined : adminPassword,
    lastName: 'Администратор',
    firstName: 'Системный',
    roleId: adminRole.id,
  });

  // Пилотная группа: все в Группе BIM-технологий, у группы — руководитель.
  const pilotRecords = [];
  for (const pilot of pilots) {
    pilotRecords.push(
      await user({
        ...pilot,
        passwordHash: pilotHashes.get(pilot.email)!,
        updatePassword: Boolean(demoPasswordEnv),
        generatedPassword: demoPasswordEnv ? undefined : pilotPasswords.get(pilot.email)!,
        departmentId: bimGroup.id,
      }),
    );
  }
  const head = pilotRecords[0]!;
  await prisma.department.update({ where: { id: bimGroup.id }, data: { headId: head.id } });
  for (const member of pilotRecords.slice(1)) {
    await prisma.user.update({ where: { id: member.id }, data: { managerId: head.id } });
  }

  await prisma.featureFlag.upsert({
    where: { key: 'chat' },
    update: {},
    create: { key: 'chat', enabled: true },
  });

  // Канал новостей компании (Ф4; вердикт 24.09: «Новости» — КАНАЛ, публикация
  // post=admin, обсуждение в тредах всем). Участники — админ + пилотная группа.
  const NEWS_CHANNEL_ID = '00000000-0000-4000-8000-000000000c01';
  await prisma.conversation.upsert({
    where: { id: NEWS_CHANNEL_ID },
    update: { type: 'project_channel' },
    create: {
      id: NEWS_CHANNEL_ID,
      type: 'project_channel',
      title: 'Новости компании',
      description: 'Официальные новости и объявления; обсуждение — в тредах постов.',
      visibility: 'open',
      permissions: {
        changeInfo: 'admin',
        addMembers: 'member',
        removeMembers: 'admin',
        post: 'admin',
        manageSettings: 'owner',
      },
      createdBy: admin.id,
      members: {
        create: [
          { userId: admin.id, role: 'owner' },
          ...pilotRecords.map((u) => ({ userId: u.id, role: 'member' as const })),
        ],
      },
    },
  });
  // Существующим (пилот мог завестись раньше канала) досеиваем участие.
  for (const member of pilotRecords) {
    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: NEWS_CHANNEL_ID, userId: member.id } },
      update: {},
      create: { conversationId: NEWS_CHANNEL_ID, userId: member.id, role: 'member' },
    });
  }

  // Приветствие пилота (детерминированные id — идемпотентный upsert).
  const newsPosts: { id: string; seq: number; authorId: string; text: string }[] = [
    {
      id: '00000000-0000-4000-8000-000000000c11',
      seq: 1,
      authorId: admin.id,
      text: 'Коллеги, добрый день! Это пилот корпоративного мессенджера Нодус. Пишите друг другу, пробуйте треды, реакции и закрепы — замечания и пожелания оставляйте прямо здесь в тредах под этим постом.',
    },
    {
      id: '00000000-0000-4000-8000-000000000c12',
      seq: 2,
      authorId: admin.id,
      text: 'Регламент: одно сообщение — до 4000 символов, вложения до 100 МБ. Если отправка не удалась, сообщение повторится автоматически и не задвоится.',
    },
    {
      id: '00000000-0000-4000-8000-000000000c13',
      seq: 3,
      authorId: head.id,
      text: 'От BIM-группы: все на связи. Вопросы по пилоту собираем в тредах, живые обсуждения — в наших чатах.',
    },
  ];
  for (const post of newsPosts) {
    await prisma.message.upsert({
      where: { id: post.id },
      update: {},
      create: {
        id: post.id,
        conversationId: NEWS_CHANNEL_ID,
        seq: BigInt(post.seq),
        authorId: post.authorId,
        clientMessageId: `seed:news:${post.seq}`,
        text: post.text,
      },
    });
  }
  // Курсор порядка только вперёд: ре-сид на живом пилоте не должен откатить
  // last_seq ниже уже отправленных (unique(conversation_id, seq)).
  await prisma.conversation.updateMany({
    where: { id: NEWS_CHANNEL_ID, lastSeq: { lt: 3n } },
    data: { lastSeq: 3n, lastMessageAt: new Date() },
  });

  const users = await prisma.user.count();
  const departments = await prisma.department.count();
  console.log(`Seed OK: ${users} пользователей, ${departments} подразделений`);
  console.log('Чат: флаг chat включён; канал «Новости компании» с приветствием пилоту');
  if (createdCredentials.length > 0) {
    console.log(
      '--- Созданные учётки (пароли показать один раз, передать лично; смена при первом входе) ---',
    );
    for (const c of createdCredentials) console.log(`${c.email} -> ${c.password}`);
  } else if (process.env.SEED_ADMIN_PASSWORD || demoPasswordEnv) {
    console.log('Пароли: применены из SEED_*_PASSWORD (в т.ч. у существующих)');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
