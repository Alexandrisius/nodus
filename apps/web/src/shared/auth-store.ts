import { create } from 'zustand';
import type { AuthTokens, AuthUser } from '@nodus/contracts';

import { api } from './api-client.js';

type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  /** Логин: токены + карточка me. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Прозрачное обновление access по refresh-cookie; false — сессия мертва. */
  tryRefresh: () => Promise<boolean>;
  /** Стартовый bootstrap: есть ли живая сессия. */
  bootstrap: () => Promise<void>;
}

/**
 * Auth-состояние SPA (zustand): access-токен только в памяти (не localStorage —
 * защита от XSS-угона), refresh — httpOnly-cookie на стороне API.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  accessToken: null,
  user: null,

  async login(email, password) {
    const tokens = await api<AuthTokens>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    set({ accessToken: tokens.accessToken });
    const user = await api<AuthUser>('/auth/me');
    set({ status: 'authenticated', user });
  },

  async logout() {
    try {
      await api('/auth/logout', { method: 'POST', auth: false });
    } finally {
      set({ status: 'anonymous', accessToken: null, user: null });
    }
  },

  async tryRefresh() {
    try {
      const tokens = await api<AuthTokens>('/auth/refresh', { method: 'POST', auth: false });
      set({ accessToken: tokens.accessToken });
      return true;
    } catch {
      set({ status: 'anonymous', accessToken: null, user: null });
      return false;
    }
  },

  async bootstrap() {
    if (get().status !== 'unknown') return;
    const alive = await get().tryRefresh();
    if (alive) {
      try {
        const user = await api<AuthUser>('/auth/me');
        set({ status: 'authenticated', user });
      } catch {
        set({ status: 'anonymous', accessToken: null, user: null });
      }
    }
  },
}));
