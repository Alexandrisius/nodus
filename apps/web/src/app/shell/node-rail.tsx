import {
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  House,
  ListTodo,
  Mail,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { useHomeSummary } from '../../features/home/api/home-api.js';
import { useShellStore } from './shell-store.js';
import { LogoIcon } from './logo-icon.js';
import { LogoWordmark } from './logo-wordmark.js';

/** Ось шины в px от левого края рейки (импортируется circuit-geometry). */
export const RAIL_TRUNK_X = 24;
/** Центр порта модуля (конец отвода). */
const PORT_X = 42;
/** Диаметр порта 7px (вердикт владельца 15.09.2026: 9px — «толстоваты»):
 *  крупнее точек вкладок контура (5–6px) быть не должны — порт рейки
 *  декоративный (pointer-events-none), не интерактивный. Центр — всегда
 *  PORT_X: геометрия контура (замер по data-module-port) не зависит от Ø. */
const PORT = 7;
/** Радиус порта — конец отвода магистрали (circuit-geometry) прячется ПОД
 *  кромку круга: линия заканчивается ВНУТРИ порта, зазора шва нет. */
export const MODULE_PORT_R = PORT / 2;
/** Отступ контента ряда от порта. */
const CONTENT_X = 60;
/** Геометрия рядов: h-10 + gap-0.5 → шаг 42, центр первого ряда 20. */
const ROW_STRIDE = 42;
const ROW_CENTER = 20;

interface MenuItem {
  to: string;
  label: string;
  icon: typeof House;
  exact: boolean;
  badge?: number;
}

/**
 * Левая рейка модулей как магистраль графа (реф node-based UI): хребет секции
 * со скруглёнными отводами к портам модулей; активные отвод и порт светятся.
 * Навигационная вспышка — NavigationFlash: измеряет порты по data-атрибутам.
 */
export function NodeRail() {
  const collapsed = useShellStore((s) => s.menuCollapsed);
  const toggle = useShellStore((s) => s.toggleMenu);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: home } = useHomeSummary();
  const { data: chats } = useConversations();

  const tasksBadge = home
    ? home.tasks.overdue.length + home.tasks.today.length + home.tasks.weekCount
    : 0;
  const lettersBadge = home?.letters.unregisteredCount ?? 0;
  const chatBadge = (chats?.items ?? []).reduce((sum, c) => sum + c.unreadCount, 0);

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: ui.nav.sectionWork,
      items: [
        { to: '/', label: ui.nav.home, icon: House, exact: true },
        { to: '/tasks', label: ui.nav.tasks, icon: ListTodo, exact: false, badge: tasksBadge },
        { to: '/letters', label: ui.nav.letters, icon: Mail, exact: false, badge: lettersBadge },
        { to: '/projects', label: ui.nav.projects, icon: FolderOpen, exact: false },
      ],
    },
    {
      title: ui.nav.sectionComm,
      items: [
        { to: '/chat', label: ui.nav.chat, icon: MessageSquare, exact: false, badge: chatBadge },
        { to: '/employees', label: ui.nav.employees, icon: Users, exact: false },
      ],
    },
  ];

  const isActive = (item: MenuItem) =>
    item.exact ? pathname === '/' : pathname.startsWith(item.to);

  return (
    <aside
      data-rail
      className={cn(
        'relative flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground',
        'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Логотип — оптически по центру рейки (вердикт владельца 11.09.2026);
          порт контура измеряется из DOM, центровка геометрию не ломает. */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center justify-center px-4',
          'transition-[gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'gap-0 px-0' : 'gap-2.5',
        )}
      >
        <span data-logo-port className="flex shrink-0">
          <LogoIcon className="size-9 text-foreground" />
        </span>
        <span
          className={cn(
            'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            collapsed ? 'max-w-0 opacity-0' : 'max-w-44 opacity-100',
          )}
        >
          <LogoWordmark className="text-xl tracking-[0.18em] text-foreground uppercase" />
        </span>
      </div>

      {/* Якорь узла бокового шва схлопнутой рейки. САМА точка рисуется
          оверлеем контура (svg-круг в circuit-frame — как точки вкладок):
          DOM-точка внутри рейки резалась напополам её overflow-hidden и
          выглядела «сплющенной» (вердикт владельца 12.09.2026). Рейка БЕЗ
          вертикальной границы и в один тон с периметром (воздушность, план
          R1): узел сидит на ЛЕВОМ КРАЕ мягкой области (8px за рейкой) —
          связь опирается на границу мягкой зоны. Центр якоря — НА оси
          контура: 8px отступ рамы + топбар 56px = 64px. */}
      {collapsed && (
        <span data-left-node aria-hidden className="absolute top-[63px] -right-[8.5px] size-px" />
      )}

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto py-3">
        {sections.map((section) => {
          return (
            <div key={section.title} className="flex flex-col gap-0.5">
              {/* Метки секций и подписи рядов не демонтируются при сворачивании,
                  а гасятся кросс-фейдом (max-width/opacity) — рейка скользит
                  без рывков и обрезания текста на полуслове (вердикт владельца). */}
              <span
                className={cn(
                  'block overflow-hidden whitespace-nowrap font-mono text-[11px] font-medium tracking-[0.16em] text-sidebar-foreground/40 uppercase',
                  'transition-[max-height,opacity,padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                  collapsed ? 'max-h-0 pb-0 opacity-0' : 'max-h-6 pb-1 opacity-100',
                )}
                style={{ paddingLeft: CONTENT_X }}
              >
                {section.title}
              </span>
              <div className="relative flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = isActive(item);
                  const link = (
                    <Link
                      to={item.to}
                      className={cn(
                        'relative flex h-10 items-center overflow-hidden rounded-md text-sm font-medium',
                        'transition-[color,gap,padding,background-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                        'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
                        active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                        // Плашка ховера/активного ряда — ПРАВЕЕ графа: магистраль
                        // и порты остаются на чистом фоне шелла (структура ≠
                        // ховер, вердикт владельца 12.09.2026). В свёрнутой
                        // рейке графа внутри нет — плашка как прежде.
                        collapsed ? 'mx-3' : 'mr-3 ml-[52px]',
                        collapsed ? 'gap-0' : 'gap-3',
                      )}
                      // Развёрнутая: плашка с 52px, иконка 52+8=60 — каноническая
                      // ось CONTENT_X (плашка не сдвигает контент, вердикт 12.09.2026).
                      style={{ paddingLeft: collapsed ? 11 : 8 }}
                    >
                      <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                      <span
                        className={cn(
                          'truncate transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                          collapsed ? 'max-w-0 opacity-0' : 'max-w-40 opacity-100',
                        )}
                      >
                        {item.label}
                      </span>
                      <span
                        className={cn(
                          'ml-auto pr-2.5 font-mono text-[11px] text-muted-foreground/80 tabular-nums',
                          'transition-[max-width,opacity,padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                          collapsed ? 'max-w-0 opacity-0 pr-0' : 'max-w-12 opacity-100',
                        )}
                      >
                        {item.badge ?? ''}
                      </span>
                      {item.badge ? (
                        <span
                          className={cn(
                            'absolute top-0.5 right-0.5 rounded bg-secondary px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground tabular-nums',
                            'transition-opacity duration-300',
                            collapsed ? 'opacity-100' : 'opacity-0',
                          )}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                  return collapsed ? (
                    <Tooltip key={item.to}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span key={item.to}>{link}</span>
                  );
                })}
                {/* Порты модулей — только в развёрнутой рейке (в схлопнутой
                    контур опирается на узел бокового шва, как на правой панели). */}
                {!collapsed &&
                  section.items.map((item, i) => {
                    const active = isActive(item);
                    return (
                      <span
                        key={item.to}
                        data-module-port={item.to}
                        data-active={active ? 'true' : undefined}
                        aria-hidden
                        className={cn(
                          'pointer-events-none absolute rounded-full border transition-colors',
                          active
                            ? 'border-port bg-port shadow-[0_0_10px_var(--glow)]'
                            : 'border-edge bg-transparent',
                        )}
                        style={{
                          left: PORT_X - PORT / 2,
                          top: ROW_CENTER + i * ROW_STRIDE - PORT / 2,
                          width: PORT,
                          height: PORT,
                        }}
                      />
                    );
                  })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? ui.nav.expand : ui.nav.collapse}
          className="flex h-8 w-full items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>
    </aside>
  );
}
