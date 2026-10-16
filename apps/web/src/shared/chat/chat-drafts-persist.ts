import { createJSONStorage, type PersistOptions } from 'zustand/middleware';

import { chatDraftsEnvelopeSchema, zodPersistMerge } from '../lib/persist-zod.js';
import type { ChatDraft, DraftsState } from './chat-drafts.js';
import { fromWireText, toWireText, type DraftMention } from './composer-mention-registry.js';

/** Персист черновиков (chat-drafts.ts): что пишется в localStorage, миграции
 *  формы и нормализация rehydrate — отдельно от действий стора. */
type PersistedDraft = Pick<
  ChatDraft,
  'text' | 'mentions' | 'reply' | 'edit' | 'preEditText' | 'preEditMentions'
>;
type PersistedDrafts = { drafts: Record<string, PersistedDraft> };

export const chatDraftsPersistOptions: PersistOptions<DraftsState, PersistedDrafts> = {
  name: 'nodus-chat-drafts-v1',
  storage: createJSONStorage(() => localStorage),
  // Вложения (File/objectURL) не сериализуются — только текст и контекст.
  partialize: (s) => ({
    drafts: Object.fromEntries(
      Object.entries(s.drafts).map(([key, d]) => [
        key,
        {
          text: d.text,
          mentions: d.mentions ?? [],
          reply: d.reply,
          edit: d.edit,
          preEditText: d.preEditText,
          preEditMentions: d.preEditMentions,
        },
      ]),
    ),
  }),
  version: 3,
  // Миграции (#228): v1 хранил СЫРОЙ текст с токенами; v2 — display с
  // «@Имя». v3 — display без «@» (dev-фидбек 06.10): старый черновик
  // проходит roundtrip wire→display, «@» срезается, диапазоны честные.
  migrate: (persisted, version) => {
    if (version >= 3) return persisted as never;
    const state = persisted as {
      drafts?: Record<
        string,
        { text?: string; mentions?: DraftMention[] } & Record<string, unknown>
      >;
    };
    const roundtrip = (text: string, mentions: DraftMention[] | undefined) =>
      fromWireText(toWireText(text, mentions ?? []));
    const drafts = Object.fromEntries(
      Object.entries(state.drafts ?? {}).map(([key, d]) => {
        const parsed = roundtrip(typeof d.text === 'string' ? d.text : '', d.mentions);
        // preEditText персистился СЫРЫМ (v1 — с токенами) — тот же
        // roundtrip, иначе отмена правки после F5 вернёт в поле
        // сырую разметку при пустом реестре (code-ревью #228).
        const pre =
          typeof d.preEditText === 'string' && d.preEditText.length > 0
            ? roundtrip(d.preEditText, [])
            : null;
        return [
          key,
          {
            ...d,
            text: parsed.text,
            mentions: parsed.mentions,
            preEditText: pre ? pre.text : null,
            preEditMentions: pre ? pre.mentions : null,
          },
        ];
      }),
    );
    return { ...state, drafts } as never;
  },
  // После rehydrate в черновиках НЕТ attachments (не персистятся) —
  // нормализация обязательна, иначе draft.attachments.some() падает
  // (баг найден скриншот-прогоном 24.09: белый экран после F5).
  merge: (persisted, current) => {
    const merged = zodPersistMerge<DraftsState>(chatDraftsEnvelopeSchema)(persisted, current);
    return {
      ...merged,
      drafts: Object.fromEntries(
        Object.entries(merged.drafts).map(([key, d]) => [
          key,
          { ...d, attachments: d.attachments ?? [] },
        ]),
      ),
    };
  },
};
