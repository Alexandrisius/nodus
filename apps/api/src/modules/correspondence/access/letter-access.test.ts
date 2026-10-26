import { Permission } from '@nodus/contracts';
import { describe, expect, it } from 'vitest';

import { canViewLetter, letterAccessOf } from './letter-access.js';

const REGISTRAR = { id: 'u1', permissions: [Permission.CORRESPONDENCE_REGISTER] };
const EMPLOYEE = { id: 'u2', permissions: [] as string[] };
const REGISTERED = {
  registeredAt: new Date('2026-10-01T08:00:00.000Z'),
  systemState: 'active',
  addresseeId: 'u2',
};
const NEW = { registeredAt: null, systemState: 'backlog', addresseeId: null };

describe('видимость письма (#55, Р7)', () => {
  it('зарегистрированное видят все, незарегистрированное — только канцелярия', () => {
    expect(canViewLetter(EMPLOYEE, REGISTERED)).toBe(true);
    expect(canViewLetter(EMPLOYEE, NEW)).toBe(false);
    expect(canViewLetter(REGISTRAR, NEW)).toBe(true);
  });
});

describe('права карточки письма (#55, Р11/Р12/Р10)', () => {
  it('канцелярия правит зарегистрированное и удаляет спам из «Нового»', () => {
    expect(letterAccessOf(REGISTRAR, REGISTERED, false)).toMatchObject({
      canEdit: true,
      canDeleteSpam: false,
      canJoin: true,
    });
    expect(letterAccessOf(REGISTRAR, NEW, false)).toMatchObject({
      canEdit: false,
      canDeleteSpam: true,
      canJoin: false,
    });
  });

  it('сотрудник не правит; адресат уже участник и не «присоединяется»', () => {
    expect(letterAccessOf(EMPLOYEE, REGISTERED, false)).toMatchObject({
      canEdit: false,
      canDeleteSpam: false,
      canJoin: false,
      isParticipant: true,
    });
    expect(letterAccessOf(REGISTRAR, { ...REGISTERED, addresseeId: 'u9' }, true)).toMatchObject({
      canJoin: false,
      isParticipant: true,
    });
  });

  it('закрытое незарегистрированное не удаляется как спам', () => {
    expect(letterAccessOf(REGISTRAR, { ...NEW, systemState: 'closed' }, false).canDeleteSpam).toBe(
      false,
    );
  });
});
