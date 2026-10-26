import { FilePlus2, Mail, MailCheck, ScanLine, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { letterRows, useLettersInfinite } from '../../../../shared/api/letters-list.js';
import { useDebouncedValue } from '../../../../shared/lib/use-debounced-value.js';
import { uiPx } from '../../../../shared/ui/ui-scale.js';
import { useSplitWidth } from '../../../../shared/ui/use-split-width.js';
import { useDeleteSpamLetter } from '../../api/letters-mutations.js';
import { useLetterDetail } from '../../api/letters-queries.js';
import { letterSubject, receivedLabel } from '../../lib/letter-format.js';
import {
  isEditableTarget,
  neighbourId,
  nextAfterRemoval,
  pipelineKeyAction,
} from '../../lib/pipeline-keys.js';
import { BodyEmpty, LetterBodyView } from '../letter-body-view.js';
import { LettersEmpty, LettersLoadError } from '../letters-empty.js';
import { LettersHeader } from '../letters-header.js';
import { ManualLetterDialog } from '../manual-letter-dialog.js';
import { NewLettersList } from './new-letters-list.js';
import { RegistrationPanel, type RegistrationPanelControl } from './registration-panel.js';
import { SpamConfirmDialog } from './spam-confirm-dialog.js';

/**
 * Конвейер «Новые» (#55, U4) — рабочее место канцелярии: очередь писем
 * (ресайз), документ по центру (общий просмотрщик по ширине), форма
 * регистрации справа (~420 px). После регистрации — тост с номером,
 * следующее письмо и фокус в «Корреспондент». Клавиатура: Alt+↑/↓ —
 * соседнее, Ctrl+Enter — регистрация, Shift+Delete — спам (вне поля ввода).
 * Модальные окна поверх конвейера сочетания не получают.
 */
export function NewLettersPipeline() {
  const [text, setText] = useState('');
  const search = useDebouncedValue(text.trim(), 250);
  const query = useLettersInfinite('new', { search: search || undefined });
  const letters = letterRows(query.data);
  const ids = letters.map((letter) => letter.id);
  const [picked, setPicked] = useState<string | null>(null);
  const selectedId = picked && ids.includes(picked) ? picked : (ids[0] ?? null);
  const detail = useLetterDetail(selectedId ?? '');
  const letter = detail.data;
  // Скелеты — только пока что-то едет: пустой поиск и пропавшее письмо
  // (404 — зарегистрировал коллега) получают свои состояния, не вечную загрузку.
  const pending = query.isLoading || (selectedId !== null && !letter && !detail.isError);
  const failed = query.isError && !query.data;
  const panelRef = useRef<RegistrationPanelControl | null>(null);
  const listColumnRef = useRef<HTMLDivElement>(null);
  const split = useSplitWidth(listColumnRef, {
    storeKey: 'nodus-letters-new-list-w',
    defaultRatio: 0.24,
    min: uiPx(260),
    minOther: uiPx(760),
  });
  const deleteSpam = useDeleteSpamLetter();
  const [spamOpen, setSpamOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  /** Письмо ушло из очереди (регистрация, закрытие, спам) — следующее. */
  const advanceFrom = (removedId: string) => setPicked(nextAfterRemoval(ids, removedId));

  // Свежие значения для слушателя клавиатуры без переподписки на каждый рендер.
  const keyState = useRef({ ids, selectedId, canSpam: false });
  keyState.current = { ids, selectedId, canSpam: letter?.access.canDeleteSpam ?? false };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // Поверх конвейера — окно (переход, спам, ручное создание): его клавиши.
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      const action = pipelineKeyAction(event, isEditableTarget(event.target));
      if (!action) return;
      const state = keyState.current;
      event.preventDefault();
      if (action === 'prev' || action === 'next') {
        setPicked(neighbourId(state.ids, state.selectedId, action === 'prev' ? -1 : 1));
      } else if (action === 'register') {
        panelRef.current?.register();
      } else if (state.canSpam) {
        setSpamOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const createButton = (
    <Button onClick={() => setManualOpen(true)}>
      <FilePlus2 data-icon="inline-start" />
      {ui.common.create}
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LettersHeader
        count={query.isSuccess ? `${letters.length}${query.hasNextPage ? '+' : ''}` : undefined}
      >
        {createButton}
      </LettersHeader>
      {failed ? (
        <div className="min-h-0 flex-1 border-t border-border">
          <LettersLoadError onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 border-t border-border">
          <div
            ref={listColumnRef}
            className="relative flex min-h-0 shrink-0 flex-col border-r border-border"
            style={split.style}
          >
            <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  // Enter в поиске — в форму регистрации (сценарий «≤ 30 секунд»):
                  // «Галур» → Enter → «Корреспондент» уже в фокусе.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && selectedId) {
                      e.preventDefault();
                      panelRef.current?.focusFirst();
                    }
                  }}
                  placeholder={ui.letters.pipeline.searchPlaceholder}
                  aria-label={ui.letters.pipeline.searchPlaceholder}
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>
            {query.isLoading ? (
              <div className="flex flex-col gap-2 p-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-[10px]" />
                ))}
              </div>
            ) : letters.length === 0 && search ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                {ui.letters.pipeline.searchEmpty}
              </p>
            ) : (
              <NewLettersList
                letters={letters}
                selectedId={selectedId}
                onSelect={setPicked}
                onEnter={() => panelRef.current?.focusFirst()}
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                onLoadMore={() => void query.fetchNextPage()}
              />
            )}
            <div
              onPointerDown={split.onDividerDown}
              role="separator"
              aria-orientation="vertical"
              aria-label={ui.common.resizePanel}
              title={ui.common.resizePanel}
              className="group absolute top-0 right-0 z-10 h-full w-3 translate-x-1/2 cursor-col-resize"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-port/60 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>

          {query.isSuccess && letters.length === 0 && !search ? (
            <LettersEmpty
              icon={MailCheck}
              title={ui.letters.pipeline.empty}
              hint={ui.letters.pipeline.emptyHint}
            >
              {createButton}
            </LettersEmpty>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-col border-r border-border">
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                  {letter ? (
                    <>
                      {letter.source === 'manual' ? (
                        <ScanLine
                          className="size-4 shrink-0 text-muted-foreground"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      ) : (
                        <Mail
                          className="size-4 shrink-0 text-muted-foreground"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm font-medium',
                          !letter.subject && 'text-muted-foreground',
                        )}
                        title={letterSubject(letter)}
                      >
                        {letterSubject(letter)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {ui.letters.source[letter.source]} ·{' '}
                        <span className="font-mono tabular-nums">
                          {receivedLabel(letter.receivedAt)}
                        </span>
                      </span>
                    </>
                  ) : pending ? (
                    <Skeleton className="h-4 w-64" />
                  ) : null}
                </div>
                <div className="min-h-0 flex-1">
                  {letter ? (
                    <LetterBodyView
                      key={letter.id}
                      letter={letter}
                      empty={
                        <BodyEmpty
                          title={ui.letters.pipeline.documentMissing}
                          hint={ui.letters.pipeline.documentMissingHint}
                        />
                      }
                    />
                  ) : detail.isError ? (
                    <BodyEmpty title={ui.letters.card.notFound} />
                  ) : null}
                </div>
              </div>
              <div className="flex min-h-0 shrink-0 flex-col" style={{ width: uiPx(420) }}>
                {letter ? (
                  <RegistrationPanel
                    key={letter.id}
                    letter={letter}
                    controlRef={panelRef}
                    onRegistered={() => advanceFrom(letter.id)}
                    onClosed={() => advanceFrom(letter.id)}
                    onDeleteSpam={() => setSpamOpen(true)}
                  />
                ) : pending ? (
                  <div className="flex flex-col gap-3 p-4">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}

      <SpamConfirmDialog
        open={spamOpen}
        onCancel={() => setSpamOpen(false)}
        onConfirm={() => {
          setSpamOpen(false);
          if (!selectedId) return;
          advanceFrom(selectedId);
          deleteSpam.mutate(selectedId);
        }}
      />
      <ManualLetterDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onCreated={(created) => {
          setText('');
          setPicked(created.id);
        }}
      />
    </div>
  );
}
