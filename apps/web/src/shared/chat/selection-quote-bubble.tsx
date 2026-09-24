import { Quote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Paginated } from '@nodus/contracts';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { useQueryClient } from '@tanstack/react-query';

import { chatKeys } from './api.js';
import { useChatDrafts } from './chat-drafts.js';
import { focusComposer } from './composer-focus.js';

/**
 * Баббл-цитата над выделением (вердикт 24.09: модель Bitrix24 — выделил текст
 * сообщения → круглая кнопка с кавычками у выделения, клик = ответ с ЧАСТИЧНОЙ
 * цитатой выделенного). Живёт ОДИН на приложение (хост в app-shell): слушает
 * document, сообщение находит по data-атрибутам триггера MessageMenu
 * (data-chat-*), оригинал — в кэше TanStack Query ленты (снапшот ответа
 * строится из ChatMessage, как в контекстном меню). Граничные условия:
 * выделение в одном сообщении (anchor и focus в одном контейнере), пусто/
 * свёрнуто — баббл гаснет; скролл и клик мимо — гаснет; selectionchange во
 * время протяжки не рисует баббл раньше mouseup (канон Bitrix: после отжатия).
 */

const MESSAGE_SELECTOR = '[data-chat-message]';

interface BubbleState {
  x: number;
  y: number;
  scope: string;
  conversationId: string;
  messageId: string;
}

function containerOf(node: Node | null): Element | null {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return el?.closest(MESSAGE_SELECTOR) ?? null;
}

export function SelectionQuoteBubble() {
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    function compute() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setBubble(null);
        return;
      }
      if (selection.toString().trim().length === 0) {
        setBubble(null);
        return;
      }
      const container = containerOf(selection.anchorNode);
      const focusContainer = containerOf(selection.focusNode);
      if (!container || container !== focusContainer) {
        setBubble(null);
        return;
      }
      // Позиция — СПРАВА от конца выделения, по вертикали последней строки
      // (модель Bitrix24, вердикт 24.09: bubble компактный и не нависает).
      const rects = selection.getRangeAt(0).getClientRects();
      const last = rects.length > 0 ? rects[rects.length - 1] : null;
      if (!last || (last.width === 0 && last.height === 0)) {
        setBubble(null);
        return;
      }
      setBubble({
        x: Math.min(Math.max(last.right + 24, 20), window.innerWidth - 20),
        y: last.top + last.height / 2,
        scope: container.getAttribute('data-chat-scope') ?? '',
        conversationId: container.getAttribute('data-chat-conversation') ?? '',
        messageId: container.getAttribute('data-chat-message') ?? '',
      });
    }

    function hideOnCollapse() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) setBubble(null);
    }

    function hideOnPress(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-quote-bubble]')) return;
      setBubble(null);
    }

    function hide() {
      setBubble(null);
    }

    document.addEventListener('mouseup', compute);
    document.addEventListener('keyup', compute);
    document.addEventListener('selectionchange', hideOnCollapse);
    document.addEventListener('mousedown', hideOnPress, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mouseup', compute);
      document.removeEventListener('keyup', compute);
      document.removeEventListener('selectionchange', hideOnCollapse);
      document.removeEventListener('mousedown', hideOnPress, true);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  function apply() {
    if (!bubble) return;
    const fragment = window.getSelection()?.toString().trim() ?? '';
    window.getSelection()?.removeAllRanges();
    setBubble(null);
    if (fragment.length === 0 || bubble.scope.length === 0) return;
    const cached = queryClient.getQueryData<Paginated<ChatMessage>>(
      chatKeys.messages(bubble.conversationId),
    );
    const message = cached?.items.find((m) => m.id === bubble.messageId);
    if (!message) return;
    useChatDrafts.getState().setReply(bubble.scope, message, fragment);
    window.setTimeout(() => focusComposer(bubble.scope), 0);
  }

  if (!bubble) return null;
  return createPortal(
    <button
      type="button"
      data-quote-bubble
      onClick={apply}
      aria-label={ui.chat.quoteBubble}
      title={ui.chat.quoteBubble}
      className="fixed z-[80] flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card text-info shadow-md transition-colors hover:bg-accent"
      style={{ left: bubble.x, top: bubble.y }}
    >
      <Quote className="size-3.5" strokeWidth={1.75} />
    </button>,
    document.body,
  );
}
