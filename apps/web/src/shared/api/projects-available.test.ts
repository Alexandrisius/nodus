import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-mock-config.js', () => ({ isDomainMocked: vi.fn() }));
vi.mock('../auth-store.js', () => ({ useAuthStore: { getState: vi.fn() } }));

import { useAuthStore } from '../auth-store.js';
import { isDomainMocked } from './api-mock-config.js';
import { projectsAvailable } from './projects-available.js';

const mockedDomain = vi.mocked(isDomainMocked);
const mockedGetState = vi.mocked(useAuthStore.getState);

function authWithModules(modules?: string[]): void {
  mockedGetState.mockReturnValue({
    user: modules === undefined ? null : { id: 'u1', modules },
  } as never);
}

describe('projectsAvailable (#52, Р14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('оба мира на моках — проект доступен', () => {
    mockedDomain.mockImplementation(() => true);
    authWithModules(undefined);
    expect(projectsAvailable('tasks')).toBe(true);
    expect(projectsAvailable('letters')).toBe(true);
  });

  it('проекты на моках, задача живая — недоступен (404 на projectId)', () => {
    mockedDomain.mockImplementation((domain) => domain === 'projects');
    authWithModules(['projects']);
    expect(projectsAvailable('tasks')).toBe(false);
  });

  it('живой мир + флаг projects в /auth/me — доступен', () => {
    mockedDomain.mockReturnValue(false);
    authWithModules(['projects', 'tasks']);
    expect(projectsAvailable('tasks')).toBe(true);
    expect(projectsAvailable('letters')).toBe(true);
  });

  it('живой мир без флага (или без карточки me) — недоступен', () => {
    mockedDomain.mockReturnValue(false);
    authWithModules([]);
    expect(projectsAvailable('tasks')).toBe(false);
    authWithModules(undefined);
    expect(projectsAvailable('tasks')).toBe(false);
  });

  it('живые проекты, но задача на моках — недоступен', () => {
    mockedDomain.mockImplementation((domain) => domain === 'tasks');
    authWithModules(['projects']);
    expect(projectsAvailable('tasks')).toBe(false);
  });
});
