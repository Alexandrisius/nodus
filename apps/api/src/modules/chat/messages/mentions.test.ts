import { describe, expect, it, vi } from 'vitest';

import { addMentionWatchers, resolveMentionTargets } from './mentions.js';

/** @упоминания (#176): резолвер токенов `@[текст](user:id)` — парсер живёт
 *  в contracts (свои тесты там), здесь правила фильтрации: активные
 *  участники беседы ∩ ≠ автор, порядок по появлению в тексте. */

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '44444444-4444-4444-8444-444444444444';

function deps(members: string[], active: string[]) {
  return {
    userProfiles: {
      filterActiveUserIds: vi.fn(async (ids: string[]) => ids.filter((id) => active.includes(id))),
    },
    conversations: {
      // Без searchUserIds (ветка «Все») — весь состав; с фильтром — по id.
      listMembersPage: vi.fn(async (_cid: string, opts: { searchUserIds?: string[] }) => {
        const pool = opts.searchUserIds ?? members.concat(AUTHOR);
        return pool
          .filter((id) => members.includes(id) || id === AUTHOR)
          .map((userId) => ({ userId, role: 'member', joinedAt: new Date() }));
      }),
    },
  };
}

describe('resolveMentionTargets', () => {
  it('токены → активные участники, порядок по появлению в тексте', async () => {
    const d = deps([UUID_A, UUID_B], [UUID_A, UUID_B]);
    const ids = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      `@[Б](user:${UUID_B}) и @[А](user:${UUID_A})`,
      AUTHOR,
    );
    expect(ids).toEqual([UUID_B, UUID_A]);
  });

  it('не-участник беседы не упоминается (канон Slack «не в беседе»)', async () => {
    const d = deps([UUID_A], [UUID_A, UUID_C]);
    const ids = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      `@[А](user:${UUID_A}) @[Директор](user:${UUID_C})`,
      AUTHOR,
    );
    expect(ids).toEqual([UUID_A]);
  });

  it('деактивированный участник не упоминается (чип остаётся, пинга нет)', async () => {
    const d = deps([UUID_A, UUID_B], [UUID_B]);
    const ids = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      `@[Уволен](user:${UUID_A}) @[Б](user:${UUID_B})`,
      AUTHOR,
    );
    expect(ids).toEqual([UUID_B]);
  });

  it('автора собственное упоминание не пингует (дедуп по id)', async () => {
    const d = deps([AUTHOR, UUID_A], [AUTHOR, UUID_A]);
    const ids = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      `@[я сам](user:${AUTHOR}) @[А](user:${UUID_A}) @[снова я](user:${AUTHOR})`,
      AUTHOR,
    );
    expect(ids).toEqual([UUID_A]);
  });

  it('голый @текст и email не упоминаются — только явные токены', async () => {
    const d = deps([UUID_A], [UUID_A]);
    const ids = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      'напиши @Анна и a@b.by, склонения без чипа не считаются',
      AUTHOR,
    );
    expect(ids).toEqual([]);
    expect(d.conversations.listMembersPage).not.toHaveBeenCalled();
  });

  it('нет участников — справочник не читается', async () => {
    const d = deps([], []);
    const ids = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      `@[А](user:${UUID_A})`,
      AUTHOR,
    );
    expect(ids).toEqual([]);
    expect(d.userProfiles.filterActiveUserIds).not.toHaveBeenCalled();
  });
});

describe('addMentionWatchers', () => {
  it('упомянутые становятся наблюдателями, автор — нет', async () => {
    const upsert = vi.fn(async () => undefined);
    await addMentionWatchers(
      { upsert } as never,
      'tx' as never,
      'root',
      [UUID_A, AUTHOR, UUID_B],
      AUTHOR,
    );
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith('root', UUID_A, 'mentioned', 'tx');
    expect(upsert).toHaveBeenCalledWith('root', UUID_B, 'mentioned', 'tx');
  });

  it('«Все» (#224): разворачивается во всех активных участников кроме автора', async () => {
    const d = deps([UUID_A, UUID_B], [UUID_A, UUID_B]);
    const ids = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      '@[Все](user:all) — планёрка',
      AUTHOR,
    );
    expect(ids.sort()).toEqual([UUID_A, UUID_B]);
  });

  it('«Все» поглощает индивидуальные токены того же сообщения (#224)', async () => {
    const d = deps([UUID_A, UUID_B], [UUID_A, UUID_B]);
    const ids = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      `@[Б](user:${UUID_B}) @[Все](user:all)`,
      AUTHOR,
    );
    expect(ids.sort()).toEqual([UUID_A, UUID_B]);
  });

  it('«Все» без активных участников — пусто; автор исключается', async () => {
    const d = deps([UUID_A], []);
    const empty = await resolveMentionTargets(
      d.userProfiles,
      d.conversations,
      'cid',
      '@[Все](user:all)',
      AUTHOR,
    );
    expect(empty).toEqual([]);
  });
});
