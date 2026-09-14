import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { PresenceEntry } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { usePresence } from '../../features/directory/api/directory-api.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';
import { ProfileMenu } from './profile-menu.js';
import { useShellStore } from './shell-store.js';

const dotColor: Record<string, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-foreground/30',
};

/** Ширина полосы: свёрнутая / раскрытая (240 − 20% ≈ 192, план R4).
 *  Экспортируется для карточек-слайдеров: их правый край = правый край
 *  мягкой рамы = левый край полосы (единая геометрия шелла). */
export const EDGE_W_COLLAPSED = 40;
export const EDGE_W_EXPANDED = 192;

function ColleagueRow({
  entry,
  expanded,
  onOpen,
}: {
  entry: PresenceEntry;
  expanded: boolean;
  onOpen: (userId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.user.id)}
      className="flex w-full shrink-0 items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-accent"
    >
      <span className="relative shrink-0">
        <PersonAvatar
          name={entry.user.displayName}
          avatarUrl={entry.user.avatarUrl}
          className="size-7"
        />
        <span
          className={cn(
            // Полоса живёт на тоне периметра (вне мягкой рамы) — ореол
            // точки статуса в тон периметра, не «листа».
            'absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-background',
            dotColor[entry.status],
          )}
        />
      </span>
      {/* Имя — кросс-фейд max-width/opacity, как строки рейки: рефлоу
          ширины полосы идёт без рывков и обрезания текста на полуслове. */}
      <span
        className={cn(
          'overflow-hidden truncate whitespace-nowrap text-[13px] text-foreground',
          'transition-[max-width,opacity] duration-200 ease-out',
          expanded ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0',
        )}
      >
        {entry.user.displayName}
      </span>
    </button>
  );
}

/**
 * Служебная полоса (план владельца 14.09.2026, R3/R4/R8/R9): главный профиль
 * и аватарки коллег живут ЗА ПРЕДЕЛАМИ мягкой рамы — в правом периметре, на
 * его тоне и БЕЗ вертикальных границ (структуру несёт ступень тона рамы).
 * Раскрытие по dwell ≥ 800 мс — РЕФЛОУ: ширина полосы анимируется 40 → 192px,
 * мягкая рама (flex-сосед) сужается влево синхронно; карточки сущностей
 * держат правый край по раме (slider-panel). Контур перемеряется покадрово
 * существующим слушателем transition width (circuit-frame). Триггер dwell —
 * ТОЛЬКО список: наведение на аватарку профиля полосу не раскрывает (R8).
 * В раскрытом виде строка профиля подписана «Мой профиль» (ProfileMenu).
 * Профиль — size-7 по центру полосы, точно над аватарками коллег (R3).
 */
export function RightRail() {
  const { data } = usePresence();
  const { data: chats } = useConversations();
  const navigate = useNavigate();
  const edgeOpen = useShellStore((s) => s.edgeOpen);
  const setEdgeOpen = useShellStore((s) => s.setEdgeOpen);
  const dwellTimer = useRef<number | null>(null);

  function dwellStart() {
    if (dwellTimer.current !== null) return;
    dwellTimer.current = window.setTimeout(() => {
      dwellTimer.current = null;
      setEdgeOpen(true);
    }, 800);
  }

  function dwellStop() {
    if (dwellTimer.current !== null) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
    setEdgeOpen(false);
  }

  useEffect(
    () => () => {
      if (dwellTimer.current !== null) clearTimeout(dwellTimer.current);
    },
    [],
  );

  function openChat(userId: string) {
    const direct = (chats?.items ?? []).find(
      (c) => c.type === 'direct' && c.membersPreview.some((m) => m.id === userId),
    );
    if (direct)
      void navigate({ to: '/chat/$conversationId', params: { conversationId: direct.id } });
    else void navigate({ to: '/chat' });
  }

  const online = (data ?? []).filter((p) => p.status !== 'offline');

  return (
    <aside
      className={cn(
        // mr-2 — щель периметра справа от полосы (8px до края вьюпорта).
        'relative mr-2 flex shrink-0 flex-col pt-2 transition-[width] duration-200 ease-out',
        edgeOpen ? 'w-48' : 'w-10',
      )}
    >
      {/* Ячейка профиля: h-14 + pt-2 полосы → центр аватарки y=36, ровно
          центр топбара рамы; ВНЕ зоны dwell (R8). */}
      <div className="flex h-14 shrink-0 items-center">
        <ProfileMenu expanded={edgeOpen} />
      </div>
      <div
        onMouseEnter={dwellStart}
        onMouseLeave={dwellStop}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          data-no-scrollbar
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pt-1 pb-1"
        >
          {online.map((entry) => (
            <ColleagueRow key={entry.user.id} entry={entry} expanded={edgeOpen} onOpen={openChat} />
          ))}
        </div>
      </div>
    </aside>
  );
}
