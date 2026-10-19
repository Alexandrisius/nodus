import { useCallback, useRef, useState } from 'react';
import { ErrorCode, errorMessages, ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useReplaceTopCard } from '../../../app/shell/use-card-stack.js';
import { useRailShrink } from '../../../app/shell/right-rail.js';
import {
  useChatWidth,
  MIN_CHAT_WITH_PANEL,
  MIN_CHAT_W,
} from '../../../shared/ui/use-chat-width.js';
import { uiPx } from '../../../shared/ui/ui-scale.js';
import { ApiError } from '../../../shared/api-client.js';
import { useReadEntityNotifications } from '../../../shared/api/read-entity-notifications.js';
import { useTaskDetail } from '../api/tasks-api.js';
import { TaskAboutDrawer } from './task-about-drawer.js';
import { TaskBranchDrawer } from './task-branch-drawer.js';
import { TaskCardChainBar } from './task-card-chain-bar.js';
import { TaskCardSkeleton } from './task-card-skeleton.js';
import { TaskChecklist } from './task-checklist.js';
import { TaskDescription } from './task-description.js';
import { TaskResultSection } from './task-result.js';
import { TaskSubtasks } from './task-subtasks.js';
import { TaskDiscussion } from './task-discussion.js';
import { TaskFields } from './task-fields.js';
import { TaskActionBar } from './task-stage-controls.js';
import {
  BRANCH_MIN_W,
  MIN_TASK_MAIN_W,
  SHRINK_ORDER,
  chatColumnWidth,
} from '../lib/task-card-layout.js';
import { useBranchWidth } from '../lib/use-branch-width.js';

/** Ширина панели «О задаче»: на неё же сужается чат по общему канону буфера
 *  (ниже — пол чата, дальше двигается левая зона); панель полновысотная и
 *  занимает верхний бар, геометрия Битрикс24 15.09.2026. */
const ABOUT_W = uiPx(360);

/**
 * Карточка задачи (универсальный слайдер-слой): шапка — доменная цепочка
 * происхождения (Письмо → Резолюция → Поручение → Задача; само-узел — только
 * «ТИП · №», БЕЗ повтора названия — оно один раз в главном заголовке) и
 * кнопки панелей «Ветка»/«О задаче»; слева — название, описание, доска полей,
 * подзадачи и чек-лист + замоноличенный нижний бар действий; справа —
 * постоянная колонка обсуждения; «О задаче» — вталкивающая колонка справа.
 * Полоса цепочки — `task-card-chain-bar.tsx`; здесь — раскладка зон и канон
 * «чат — буфер сужений».
 */
export function TaskCard({ taskId }: { taskId: string }) {
  const { data: task, isLoading, error } = useTaskDetail(taskId);
  // Открыл задачу — её уведомления прочитаны (#252: «Требуют внимания» не вечные).
  useReadEntityNotifications('task', taskId);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Панель «О задаче» монтируется раз и остаётся: колонка анимируется
  // 0↔360px (плавный пуш), состояние (избранное, скролл) не теряется.
  const [aboutMounted, setAboutMounted] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  // Навигатор ветки монтируется раз и остаётся: колонка сетки анимируется
  // 0↔300px (плавный пуш контента), состояние панели не теряется.
  const [branchMounted, setBranchMounted] = useState(false);
  const replaceTopCard = useReplaceTopCard();
  // Сессия навигации ветки (режим «Навигация», вердикт владельца 2026-09-11):
  // корень — СТАРТОВАЯ задача карточки (неизменен — карта дерева стабильна);
  // history — переходы для «←» в навигаторе. Замена верхней карточки стека
  // (без ремаунта панели): стек не растёт, один Escape закрывает всё.
  const [rootId] = useState(taskId);
  const [history, setHistory] = useState<string[]>([]);

  /** Переход к связанной задаче ЗАМЕНОЙ содержимого: из навигатора ветки и
   *  полей «Подзадачи»/«Связи». Панель автооткрывается — видно, куда пришли. */
  const navigateInCard = useCallback(
    (id: string) => {
      if (id === taskId) return;
      setHistory((h) => [...h, taskId]);
      setBranchMounted(true);
      setBranchOpen(true);
      replaceTopCard({ kind: 'task', id });
    },
    [taskId, replaceTopCard],
  );

  /** «←» навигатора: шаг назад по переходам сессии (тоже заменой). */
  const navigateBack = useCallback(() => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      replaceTopCard({ kind: 'task', id: prev });
      return h.slice(0, -1);
    });
  }, [replaceTopCard]);
  const chatRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  // КАНОН «чат — буфер сужений» (issue #63, вердикт владельца 21.09.2026):
  // ЛЮБОЕ стоящее сужение ряда — рельса, навигатор ветки (его ТЕКУЩАЯ
  // тянущаяся ширина, #365), «О задаче» — сначала съедает колонку обсуждения
  // ДО ЕЁ МИНИМУМА (общий пол = drag-минимум MIN_CHAT_W; глубже — только
  // временное исключение открытой «О задаче» MIN_CHAT_WITH_PANEL); дальше —
  // порядок уступок flex-ряда (SHRINK_ORDER, разметка ниже). Рендер и оба
  // drag (чата и навигатора) ходят по ОДНОЙ формуле chatWidthFor, transition
  // колонки — те же 200мс ease-out, что у рельсы/панелей: сумма «ряд − чат»
  // постоянна покадрово, граница зон не дёргается.
  const railShrink = useRailShrink();
  const chatFloor = aboutOpen ? MIN_CHAT_WITH_PANEL : MIN_CHAT_W;
  const fixedShrink = (aboutOpen ? ABOUT_W : 0) + railShrink;
  const branch = useBranchWidth({ rowRef, branchRef, chatRef });
  const branchColumnW = branchOpen ? branch.branchW : 0;
  const { chatW, onDividerDown, dragging } = useChatWidth(
    chatRef,
    fixedShrink + branchColumnW,
    chatFloor,
  );
  const chatWidthFor = (branchW: number) =>
    chatColumnWidth(chatW, fixedShrink + branchW, chatFloor);
  const chatColumnW = chatWidthFor(branchColumnW);
  const resizing = dragging || branch.dragging;
  // Стабильные колбэки: дочерние панели мемоизированы, инлайн-стрелки
  // ломали бы memo на каждом рендере.
  const closeBranch = useCallback(() => setBranchOpen(false), []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

  // Задачи нет (удалена, сняли с участия, чужая ссылка): объяснение вместо
  // вечного скелетона.
  if (!task && error instanceof ApiError && error.status === 404) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {errorMessages[ErrorCode.NOT_FOUND]}
      </div>
    );
  }
  if (isLoading || !task) {
    return <TaskCardSkeleton chatW={chatColumnW} />;
  }

  return (
    // Панель «О задаче» — ПОЛНОВЫСОТНЫЙ сиблинг всей карточки (геометрия
    // Битрикс24, вердикт владельца 15.09.2026): занимает верхнюю полосу
    // карточки тоже, её шапка продолжает бар, тоггл уезжает влево.
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Полоса цепочки: бордюр — структура (с первого кадра роста), контент — fade */}
        <TaskCardChainBar
          task={task}
          branchOpen={branchOpen}
          aboutOpen={aboutOpen}
          onToggleBranch={() => {
            setBranchMounted(true);
            setBranchOpen((v) => !v);
          }}
          onToggleAbout={() => {
            setAboutMounted(true);
            setAboutOpen((v) => !v);
          }}
        />

        {/* Ряд «навигатор | данные задачи | чат» — flex с ПОРЯДКОМ УСТУПОК
          (#365, SHRINK_ORDER): хватает места — центр забирает остаток, ширины
          панелей и чата заданы каноном буфера сужений; не хватает — CSS сам
          ужимает навигатор до его минимума, затем чат до пола, и только в
          крайнем случае центр ниже MIN_TASK_MAIN_W (не выдавливая чат за
          край, gotchas #63). Без замеров и setState на кадр; во время drag
          перегородок ширины идут императивно в rAF, transition снят (gotchas:
          transition при ручном ресайзе = фризы). Пуш панелей — transition
          ширины и min-width на их колонках (min-width — тем же темпом, иначе
          пол прыгает раньше ширины). */}
        <div ref={rowRef} className="relative flex min-h-0 flex-1">
          <div
            ref={branchRef}
            className={cn(
              'min-h-0 overflow-hidden',
              !resizing && 'transition-[width,min-width] duration-200 ease-out',
            )}
            style={{
              width: branchColumnW,
              minWidth: branchOpen ? BRANCH_MIN_W : 0,
              flexShrink: SHRINK_ORDER.branch,
            }}
          >
            {branchMounted ? (
              <TaskBranchDrawer
                rootId={rootId}
                currentId={taskId}
                canBack={history.length > 0}
                onBack={navigateBack}
                onNavigate={navigateInCard}
                onClose={closeBranch}
              />
            ) : null}
          </div>
          {/* Левая зона: скроллится только контент; нижний бар действий
            замоноличен (не двигается скроллом — модель Битрикса).
            border-r — СТРУКТУРНАЯ вертикальная граница с чатом: горизонтальные
            линии бара действий и композера упираются ровно в неё (вердикт
            владельца о несходящихся линиях). Ручка ресайза — оверлей поверх
            границы (внутри этой зоны, не съедает трек).
            @container — сетка полей перестраивается от ширины зоны (ресайз чата) */}
          <div
            className="relative flex min-h-0 min-w-0 flex-col border-r border-border @container"
            style={{ flex: `1 ${SHRINK_ORDER.main} ${MIN_TASK_MAIN_W}px` }}
          >
            {/* Перегородка навигатора ветки (#365): оверлей поверх его границы
              (border-r панели = левый край этой зоны), механика ручки чата;
              двойной клик — дефолтная ширина. */}
            {branchOpen ? (
              <div
                onPointerDown={(e) =>
                  branch.onDividerDown(e, { floor: chatFloor, widthFor: chatWidthFor })
                }
                onDoubleClick={branch.onDividerReset}
                role="separator"
                aria-orientation="vertical"
                aria-label={ui.common.resizePanel}
                title={ui.common.resizePanel}
                className="group absolute top-0 left-0 z-10 h-full w-3 -translate-x-1/2 cursor-col-resize"
              >
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-port/60 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            ) : null}
            <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6">
              {/* Колонка контента — max-w-4xl, ОДНА вертикаль с сеткой полей
                (#311, вердикт «огромные широкие пункты на широком экране»):
                описание, чек-лист, подзадачи и результат не растягиваются
                на всю зону. Название — в хроме слайдера (вердикт владельца),
                в теле не дублируется: тело начинается с описания. Секции
                разделяются отступами, без висячих линий-сепараторов. */}
              <div className="mx-auto max-w-4xl pb-4">
                <TaskDescription task={task} />
                <TaskFields task={task} />
                {/* Чек-лист — сразу после полей, ДО подзадач (вердикт
                  владельца 15.09.2026: «чек-листам — важное место»). */}
                <TaskChecklist task={task} />
                <TaskSubtasks task={task} onOpen={navigateInCard} />
                <TaskResultSection task={task} />
              </div>
            </div>

            {/* Замоноличенный нижний бар: главные кнопки движения/завершения
              всегда под рукой, не уезжают со скроллом (модель Битрикса).
              Высота h-16 = высоте композера чата: их верхние линии образуют
              ОДНУ горизонталь через границу зон (вердикт владельца) */}
            <div className="flex h-16 shrink-0 items-center border-t border-border px-5">
              <TaskActionBar task={task} />
            </div>

            {/* Ручка ресайза чата: невидимый оверлей ПОВЕРХ структурной
              границы (border-r зоны) — hit-area 12px центрирована на линии,
              трека в сетке нет, линии зон сходятся в одну вертикаль */}
            <div
              onPointerDown={onDividerDown}
              role="separator"
              aria-orientation="vertical"
              aria-label={ui.common.resizePanel}
              title={ui.common.resizePanel}
              className="group absolute top-0 right-0 z-10 h-full w-3 translate-x-1/2 cursor-col-resize"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-port/60 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>

          {/* Зона чата: тёмный фон — структура (виден с первого кадра роста,
            НЕ появляется вместе с контентом — иначе читается как смена цвета
            в середине раскрытия); fade — только содержимое обсуждения.
            БУФЕР СУЖЕНИЙ (issue #63): рельса/ветка/«О задаче» сужают ЭТУ
            колонку (chatColumnW, те же 200мс ease-out, что у источника
            сужения) — левая зона и разделитель стоят на месте; после упора
            чата в его минимум (MIN_CHAT_W, при «О задаче» —
            MIN_CHAT_WITH_PANEL) сужение двигает левую зону. */}
          <div
            ref={chatRef}
            className={cn(
              'min-h-0 overflow-hidden',
              // transition — ТОЛЬКО для программного toggle панелей;
              // во время ручного drag — снят, ширина идёт императивно (gotchas)
              !resizing && 'transition-[width,min-width] duration-200 ease-out',
            )}
            style={{ width: chatColumnW, minWidth: chatFloor, flexShrink: SHRINK_ORDER.chat }}
          >
            <div className="h-full w-full bg-background">
              <div className="content-fade h-full">
                <TaskDiscussion taskId={taskId} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Панель «О задаче» — полновысотная вталкивающая колонка справа (не
          оверлей: чат и кнопка отправки остаются доступны — вердикт владельца;
          занимает верхний бар карточки, шапка панели продолжает бар). */}
      <div
        className={cn(
          'h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
          aboutOpen ? 'w-[22.5rem]' : 'w-0',
        )}
      >
        {aboutMounted ? <TaskAboutDrawer task={task} onClose={closeAbout} /> : null}
      </div>
    </div>
  );
}
