import { Loader2, MoreHorizontal, PanelRightOpen, Stamp, X } from 'lucide-react';
import { useEffect, useRef, useState, type Ref } from 'react';
import type { LetterDetail, LetterRegistrationField, WorkflowTransition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { toast } from 'sonner';

import { useOpenCard } from '../../../../app/shell/use-card-stack.js';
import { alreadyRegisteredNumber, registrationIssueOf } from '../../api/letters-cache.js';
import { useExecuteLetterTransition } from '../../api/letters-mutations.js';
import { useLetterTransitions, useReceiptMethods } from '../../api/letters-queries.js';
import { todayIso } from '../../lib/letter-format.js';
import {
  defaultReceiptMethodId,
  draftIssues,
  initialDraft,
  missingFields,
  registrationInputOf,
  registrationReasonText,
  type RegistrationDraft,
} from '../../lib/registration-draft.js';
import { useLetterTransitionRunner } from '../letter-transition-runner.js';
import { focusRegistrationField, RegistrationFields } from '../registration/registration-fields.js';
import { RegistrationSummary } from '../registration/registration-summary.js';
import { PipelineHints } from './pipeline-hints.js';

/** Управление панелью снаружи (Ctrl+Enter конвейера). */
export interface RegistrationPanelControl {
  register: () => void;
  focusFirst: () => void;
}

const hasRegistration = (t: WorkflowTransition) =>
  t.form?.sections.some((section) => section.kind === 'registration') ?? false;

/** Спиннер — только если ожидание дольше 300 мс (быстрый ответ не мигает). */
function useDelayedFlag(flag: boolean, delay = 300): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const timer = window.setTimeout(() => setElapsed(true), delay);
    return () => {
      window.clearTimeout(timer);
      setElapsed(false);
    };
  }, [flag, delay]);
  return flag && elapsed;
}

/**
 * Панель регистрации конвейера (#55, U4): форма письма, «Не хватает» и
 * будущий номер, бар h-16 — «Зарегистрировать» (Ctrl+Enter), «Закрыть без
 * регистрации» (окно причины), «Ещё» → «Удалить как спам». Регистрация
 * пессимистична (номер — юридически значим): 422 — подсветка поля, 409 —
 * письмо уже зарегистрировано, конвейер идёт дальше. Монтируется заново на
 * каждое письмо (`key`) — черновик и фокус «Корреспондента» свежие.
 */
export function RegistrationPanel({
  letter,
  onRegistered,
  onClosed,
  onDeleteSpam,
  controlRef,
}: {
  letter: LetterDetail;
  onRegistered: (letter: LetterDetail) => void;
  onClosed: () => void;
  onDeleteSpam: () => void;
  controlRef?: Ref<RegistrationPanelControl>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const openCard = useOpenCard();
  const { data: transitions = [] } = useLetterTransitions(letter.id);
  const { data: methods = [] } = useReceiptMethods();
  const execute = useExecuteLetterTransition();
  const runner = useLetterTransitionRunner(letter, onClosed);
  const [draft, setDraft] = useState<RegistrationDraft>(() => initialDraft(letter, methods));
  const [attempted, setAttempted] = useState(false);
  const busy = useDelayedFlag(execute.isPending);

  const value =
    draft.receiptMethodId === null && methods.length > 0
      ? { ...draft, receiptMethodId: defaultReceiptMethodId(letter.source, methods) }
      : draft;
  const registerTransition = transitions.find(hasRegistration);
  const others = transitions.filter((t) => !hasRegistration(t));

  const invalidKeys: Partial<Record<LetterRegistrationField, string>> = {};
  if (attempted) {
    for (const field of missingFields(value)) invalidKeys[field] = ui.letters.form.required;
  }
  for (const issue of draftIssues(value, todayIso())) {
    invalidKeys[issue.field] = registrationReasonText[issue.reason];
  }
  const serverIssue = registrationIssueOf(execute.error);
  if (serverIssue) {
    invalidKeys[serverIssue.field as LetterRegistrationField] =
      registrationReasonText[serverIssue.reason as keyof typeof registrationReasonText];
  }

  function register() {
    if (!registerTransition || execute.isPending) return;
    const input = registrationInputOf(value, todayIso());
    if (!input) {
      setAttempted(true);
      const first = missingFields(value)[0] ?? draftIssues(value, todayIso())[0]?.field ?? null;
      focusRegistrationField(rootRef.current, first);
      return;
    }
    execute.mutate(
      {
        letterId: letter.id,
        transition: registerTransition,
        body: { form: { registration: input } },
      },
      {
        onSuccess: (result) => {
          toast.success(`${ui.letters.pipeline.registeredToast} ${result.letter.regNumber ?? ''}`, {
            action: {
              label: ui.letters.pipeline.openCard,
              onClick: () => openCard({ kind: 'letter', id: result.letter.id }),
            },
          });
          onRegistered(result.letter);
        },
        onError: (error) => {
          const issue = registrationIssueOf(error);
          if (issue) {
            focusRegistrationField(rootRef.current, issue.field as LetterRegistrationField);
          } else if (alreadyRegisteredNumber(error) !== null) {
            toast.info(ui.letters.pipeline.alreadyRegisteredToast);
            onClosed();
          }
        },
      },
    );
  }

  // Императивная ручка для клавиатуры конвейера (Ctrl+Enter, Enter в списке).
  if (controlRef && typeof controlRef === 'object') {
    controlRef.current = {
      register,
      focusFirst: () =>
        focusRegistrationField(rootRef.current, missingFields(value)[0] ?? 'counterpartyId'),
    };
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      {runner.dialog}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <NodeLabel label={ui.automation.window.sections.registration} className="min-w-0 flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={ui.letters.pipeline.openCard}
          title={ui.letters.pipeline.openCard}
          onClick={() => openCard({ kind: 'letter', id: letter.id })}
          className="text-muted-foreground"
        >
          <PanelRightOpen />
        </Button>
      </div>
      <div className="content-fade min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* Без автофокуса: смена письма не должна открывать список
            корреспондента сама — фокус ставит только действие сотрудника
            (Enter в поиске/очереди, «Не хватает»). */}
        <RegistrationFields
          letter={letter}
          value={value}
          onChange={setDraft}
          invalidKeys={invalidKeys}
        />
        <div className="mt-4 flex flex-col gap-3">
          <RegistrationSummary letter={letter} draft={value} />
          <PipelineHints />
        </div>
      </div>
      <div className="flex h-16 shrink-0 items-center gap-1.5 border-t border-border px-4">
        <Button
          onClick={register}
          disabled={!registerTransition}
          aria-busy={execute.isPending || undefined}
          className="shrink-0"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Stamp data-icon="inline-start" />}
          {ui.letters.pipeline.register}
        </Button>
        {others
          .filter((t) => t.display !== 'menu')
          .map((t) => (
            <Button
              key={t.id}
              variant="ghost"
              onClick={() => runner.run(t)}
              className="min-w-0 shrink text-muted-foreground"
              title={t.name}
            >
              <X data-icon="inline-start" />
              <span className="truncate">{t.name}</span>
            </Button>
          ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui.letters.pipeline.more}
              title={ui.letters.pipeline.more}
              className="ml-auto shrink-0 text-muted-foreground"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-max min-w-44">
            {others
              .filter((t) => t.display === 'menu')
              .map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => runner.run(t)}>
                  {t.name}
                </DropdownMenuItem>
              ))}
            {letter.access.canDeleteSpam ? (
              <DropdownMenuItem variant="destructive" onSelect={onDeleteSpam}>
                {ui.letters.pipeline.deleteSpam}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
