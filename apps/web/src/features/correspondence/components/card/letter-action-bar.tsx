import {
  ArrowRight,
  Check,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Stamp,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { LetterDetail, WorkflowTransition } from '@nodus/contracts';
import { isFinalState, ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { stageTone } from '../../../../shared/ui/board/stage-tone.js';
import { groupProcessButtons } from '../../../../shared/workflow/process-buttons.js';
import { useLetterTransitions } from '../../api/letters-queries.js';
import { useLetterTransitionRunner } from '../letter-transition-runner.js';

/* Кнопки бара — одной высоты h-8 (канон панели процесса задачи); важность —
 * заливкой: главная одна, видимые по порядку, «Ещё ⋯» — меню. */
const btn =
  'inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-40';

const isRegistration = (t: WorkflowTransition) =>
  t.form?.sections.some((section) => section.kind === 'registration') ?? false;

/** Иконка кнопки письма: регистрация — штамп, в закрытие — крестик/галка,
 *  дальше по маршруту — стрелка. */
function transitionIcon(t: WorkflowTransition): LucideIcon {
  if (isRegistration(t)) return Stamp;
  if (isFinalState(t.toStageState)) return t.toStageOutcome === 'success' ? Check : X;
  return ArrowRight;
}

/**
 * Нижний бар карточки письма (h-16, замоноличен; #55, U7): кнопки маршрута
 * типа письма — у нового «Зарегистрировать» (окно с разделом регистрации,
 * `renderSection`) и «Закрыть без регистрации» (причина), у
 * зарегистрированного — по маршруту; закрытое письмо — чип итога. В «Ещё» —
 * пункты меню маршрута и «Удалить как спам» (новое, канцелярия). Справа —
 * «Присоединиться к обсуждению» (Р10), пока сотрудник не в чате письма.
 */
export function LetterActionBar({
  letter,
  joining,
  onJoin,
  onDeleteSpam,
}: {
  letter: LetterDetail;
  joining: boolean;
  onJoin: () => void;
  onDeleteSpam: () => void;
}) {
  const { data: transitions } = useLetterTransitions(letter.id);
  const runner = useLetterTransitionRunner(letter);
  const closed = isFinalState(letter.stage.systemState);
  const { primary, visible, menu } = groupProcessButtons(transitions ?? []);
  const hasMenu = menu.length > 0 || letter.access.canDeleteSpam;

  const renderButton = (t: WorkflowTransition, main: boolean) => {
    const running = runner.runningId === t.id;
    const Icon = running ? Loader2 : transitionIcon(t);
    return (
      <button
        key={t.id}
        type="button"
        aria-busy={running || undefined}
        aria-label={t.name}
        title={`${t.name}: ${t.toStageName}`}
        onClick={() => runner.run(t)}
        className={cn(
          btn,
          main
            ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
            : 'min-w-0 shrink text-muted-foreground hover:bg-accent hover:text-foreground',
          t.blockedBy.length > 0 && 'opacity-50',
        )}
      >
        <Icon className={cn('size-4 shrink-0', running && 'animate-spin')} strokeWidth={1.75} />
        {/* Узкая левая зона: подписи сбрасываются по контейнеру ДО того, как
            flex-ряд сожмёт кнопку в огрызок. Пороги — замер суммы ширин кнопок
            бара: обе подписи влезают с ~780px контейнера, вторичная без
            «обсуждения» — с ~560px. */}
        <span className={cn('max-w-44 min-w-0 truncate', !main && '@max-[580px]:hidden')}>
          {t.name}
        </span>
      </button>
    );
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      {runner.dialog}
      {closed ? (
        <span
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium',
            stageTone[letter.stage.color].chip,
          )}
        >
          {letter.stage.outcome === 'success' ? (
            <Check className="size-4" strokeWidth={2} />
          ) : (
            <X className="size-4" strokeWidth={2} />
          )}
          {letter.stage.name}
        </span>
      ) : null}
      {primary ? renderButton(primary, true) : null}
      {visible.map((t) => renderButton(t, false))}
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={ui.letters.pipeline.more}
            title={ui.letters.pipeline.more}
            className={cn(btn, 'px-2 text-muted-foreground hover:bg-accent hover:text-foreground')}
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-max min-w-44">
            {menu.map((t) => (
              <DropdownMenuItem key={t.id} title={t.toStageName} onSelect={() => runner.run(t)}>
                {t.name}
              </DropdownMenuItem>
            ))}
            {letter.access.canDeleteSpam ? (
              <>
                {menu.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem variant="destructive" onSelect={onDeleteSpam}>
                  <Trash2 className="size-3.5" />
                  {ui.letters.pipeline.deleteSpam}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {transitions && transitions.length === 0 && !closed ? (
        <span className="truncate px-1 text-sm text-muted-foreground">
          {ui.letters.card.noActions}
        </span>
      ) : null}
      <span className="ml-auto" />
      {letter.access.canJoin ? (
        <button
          type="button"
          onClick={onJoin}
          disabled={joining}
          aria-busy={joining || undefined}
          aria-label={ui.letters.card.join}
          title={ui.letters.card.join}
          className={cn(
            btn,
            'min-w-0 border border-border text-foreground hover:bg-accent disabled:opacity-60',
          )}
        >
          {joining ? (
            <Loader2 className="size-4 shrink-0 animate-spin" strokeWidth={1.75} />
          ) : (
            <MessageSquarePlus className="size-4 shrink-0" strokeWidth={1.75} />
          )}
          {/* Подпись «обсуждения» уходит первой: действие дублируется гостевой
              вкладкой «Чат», а кнопка маршрута важнее. */}
          <span className="min-w-0 truncate @max-[800px]:hidden">{ui.letters.card.join}</span>
        </button>
      ) : null}
    </div>
  );
}
