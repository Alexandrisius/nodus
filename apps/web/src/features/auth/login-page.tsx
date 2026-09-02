import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { errorMessages, ErrorCode } from '@nodus/contracts';

import { ApiError } from '../../shared/api-client.js';
import { useAuthStore } from '../../shared/auth-store.js';

/**
 * Страница входа. Функциональный минимум до дизайн-системы (M3, issue #4):
 * стилизация временная, каркас и терминология — постоянные.
 * TODO(M3): строки — в i18n-пакет (I15), когда появится модуль интерфейсных строк.
 */
export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email.trim(), password);
      await navigate({ to: '/' });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ErrorCode.INTERNAL_ERROR;
      setError(errorMessages[code as ErrorCode] ?? 'Не удалось войти, попробуйте ещё раз');
    } finally {
      setPending(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '10vh auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Nodus</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>Вход в корпоративный портал</p>
      <form onSubmit={(e) => void onSubmit(e)}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Рабочая почта</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Пароль</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
          />
        </label>
        {error ? (
          <p role="alert" style={{ color: '#c00', marginBottom: 12 }}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} style={{ width: '100%', padding: 10 }}>
          {pending ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
