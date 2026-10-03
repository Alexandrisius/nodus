import type { ReactNode } from 'react';
import { Pin } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatTime, shortPersonName } from '../lib/format.js';
import { personTone } from '../ui/person-tone.js';
import { snapDevicePx } from '../ui/ui-scale.js';
import { mediaBubbleWidth, MessageAttachments } from './attachments.js';
import { SelectSilhouetteRing } from './bubble-outline.js';
import { ForwardedHeader, ReplyHeader } from './message-headers.js';
import { MessageMeta } from './message-meta.js';
import { MessageReactions } from './message-reactions.js';
import { hasEntityPreviews, MessageText } from './message-text.js';
import { ReadTicks } from './read-ticks.js';

/**
 * Медиа-сообщение Telegram (issue #187, раунды вердиктов) — АРХИТЕКТУРА
 * «ЧАСТЕЙ» (вердикт раунда 3 п.3): верхняя и нижняя части — ОТДЕЛЬНЫЕ
 * пузыри-блоки, между ними картинка. За картинкой НЕТ никакого фона —
 * совпадение краёв гарантировано конструкцией (края картинки = края блоков,
 * одна ширина), швов/дуг/полос не бывает ни в одном масштабе. Именно так
 * рисует Telegram: «нижняя и верхняя часть отдельными пузырями, между ними
 * картинка».
 *
 * - ШАПКА (есть имя/цитата/пересылка): полноценная верхняя часть пузыря
 *   (раунд 3 п.4 — не «чип», а обычная пузырная часть, rounded-top); зазор
 *   под именем до картинки увеличен растяжением бара (раунд 5 п.9,
 *   pb-9px — без вставных распорок).
 * - КАРТИНКА: full-bleed; верх прямой под шапкой, скруглённый без неё;
 *   низ скруглён когда нижней части нет. Чистое изображение — БЕЗ
 *   хвостика (раунд 5 п.4), чип времени в нижнем углу ПОВЕРХ картинки
 *   (п.6), реакции чипами под сообщением.
 * - НИЗ (есть текст/срочно): rounded-bottom часть с подписью; ВРЕМЯ —
 *   пара MetaGhost+MetaPin (раунд 10, стабильная модель Telegram):
 *   призрак в потоке резервирует ширину (узкая карточка всегда вмещает,
 *   полная строка — метка своей строкой внизу), булавка — абсолют от
 *   края (5px от низа / 12.5px справа — ВСЕГДА одинаково). Реакции —
 *   строкой ниже, время в её правом краю. Хвостовик — у нижней части
 *   (BubbleFin СНАРУЖИ части, геометрия outlinePath).
 * - Селект: тон-щит поверх картинки + ЕДИНЫЙ контур SelectSilhouetteRing
 *   по всей стопке (включая хвостовик).
 */
export function MediaMessage({
  message,
  mine,
  showName,
  finSide,
  onJumpToReply,
  onJumpToForwardSource,
  children,
}: {
  message: ChatMessage;
  mine: boolean;
  showName: boolean;
  /** Сторона хвостовика у нижней части (последнее сообщение серии). */
  finSide: 'left' | 'right' | null;
  onJumpToReply: (replyId: string) => void;
  onJumpToForwardSource: () => void;
  /** Пилюля реакций хозяина (ReactionPicker) — внутри стопки, снаружи клипа. */
  children?: ReactNode;
}) {
  const reply = message.reply;
  const hasHeader = showName || !!message.forwardedFrom || reply;
  const hasText = Boolean(message.text?.trim());
  // Текст с карточками-превью (flex-col) — мета строкой ниже, не уголком.
  const entityRow = Boolean(message.text && hasEntityPreviews(message.text));
  // Нижняя часть — ТОЛЬКО для текста/срочности (раунд 5 п.2): реакции НЕ
  // создают её — у чистого изображения реакции чипами ПОД сообщением,
  // время остаётся чипом на картинке.
  const hasBottom = hasText || message.urgent;
  const bare = !hasHeader && !hasBottom;
  const tone = mine ? 'out' : 'in';
  const rawWidth = mediaBubbleWidth(message.attachments, { bare, hasTextColumn: !bare });
  // Ширина на device-сетке (раунд 5 п.7/п.8): дробный DPR оставляет рёбрам
  // картинки субпиксельное смещение — «пляшущие» дуги AA и расхождение с
  // контуром селекта.
  const width = rawWidth === null ? null : snapDevicePx(rawWidth);
  const hasReactions = message.reactions.length > 0;
  return (
    <div
      data-slot="media-message"
      className="group/bubble relative flex w-fit max-w-full flex-col"
      style={width ? { width, maxWidth: '100%' } : undefined}
    >
      {hasHeader ? (
        <div
          data-slot="media-part"
          data-tone={tone}
          className="flex flex-col gap-[2px] rounded-t-xl px-2.5 pt-2.5 pb-[9px] leading-tight"
        >
          {showName ? (
            <span
              className={cn(
                '-mt-[3px] text-sm leading-[19px] font-semibold',
                personTone(message.author.id),
              )}
            >
              {shortPersonName(message.author.displayName)}
            </span>
          ) : null}
          {message.forwardedFrom ? (
            <ForwardedHeader from={message.forwardedFrom} onClick={onJumpToForwardSource} />
          ) : null}
          {reply ? (
            <ReplyHeader reply={reply} onFilled={mine} onClick={() => onJumpToReply(reply.id)} />
          ) : null}
        </div>
      ) : null}
      {/* КАРТИНКА: края = края сообщения (за ней фона нет — швам неоткуда
          взяться); верх прямой под шапкой, скруглённый без неё; низ
          скруглён когда нижней части нет. Соло-изображение — БЕЗ хвостика
          и без прямого угла (раунд 5 п.4: у чистой картинки хвостика нет).
          Клип-спан ОБЯЗАН быть relative: щит селекта (absolute inset-0)
          иначе якорится к внешнему фрейму и НЕ клипается скруглением —
          серые квадратные уголки поверх дуг картинки (#187 валидатор).
          Радиус соло-углов — 12css (раунд 12): AA скруглённого угла яркой
          картинки на тёмной ленте даёт видимую 1px дугу-бленд; у Telegram
          фото-радиус ЗАМЕТНО меньше пузырёвого (~12px против наших 17.5) —
          короче дуга, слабее артефакт. Контур селекта обязан тем же радиусом
          (SelectSilhouetteRing radius). */}
      <span className="relative block">
        <span
          className={cn(
            'relative block',
            // 12css-радиус — только у ПОЛНОСТЬЮ голого медиа (без шапки и
            // низа): фото-радиус Telegram; составные сообщения несут
            // пузыревой rounded-xl по краям своих частей
            !hasHeader &&
              (hasBottom ? 'overflow-hidden rounded-t-xl' : 'overflow-hidden rounded-t-[12px]'),
            !hasBottom &&
              (hasHeader ? 'overflow-hidden rounded-b-xl' : 'overflow-hidden rounded-b-[12px]'),
          )}
        >
          <MessageAttachments message={message} mine={mine} />
          <span
            aria-hidden
            data-slot="media-shield"
            className="pointer-events-none absolute inset-0"
          />
          {!hasBottom ? <MediaTimeChip message={message} mine={mine} /> : null}
        </span>
      </span>
      {hasBottom ? (
        <div
          data-slot="media-part"
          data-tone={tone}
          className={cn(
            'relative rounded-b-xl px-2.5 pt-[5px] pb-[5px] leading-tight',
            finSide === 'left' && 'rounded-bl-none',
            finSide === 'right' && 'rounded-br-none',
          )}
        >
          {hasText ? (
            <span className="block">
              <MessageText text={message.text} />
              {hasReactions || entityRow ? null : <MetaGhost message={message} mine={mine} />}
              {entityRow && !hasReactions ? (
                <span className="flex justify-end">
                  <MessageMeta message={message} onFilled={mine} ticks={mine} />
                </span>
              ) : null}
            </span>
          ) : null}
          {hasReactions ? (
            <span className="flex items-end gap-2">
              <MessageReactions message={message} onFilled={mine} />
              <MessageMeta message={message} onFilled={mine} ticks={mine} className="ml-auto" />
            </span>
          ) : entityRow ? null : (
            <MetaPin message={message} mine={mine} />
          )}
          {finSide ? <BubbleFin side={finSide} tone={tone} /> : null}
        </div>
      ) : hasReactions ? (
        <span className="mt-[3px]">
          <MessageReactions message={message} onFilled={false} />
        </span>
      ) : null}
      {/* Единый контур селекта по всей стопке: с хвостовиком только когда
          есть нижняя часть (раунд 5 п.4 — у соло-изображения хвостика нет). */}
      {/* Единый контур селекта: радиус соло-медиа = фото-радиус клипа (12css),
          составные стопки — пузыревой; хвостовик только при нижней части. */}
      <SelectSilhouetteRing side={hasBottom ? finSide : null} radius={bare ? 12 : undefined} />
      {children}
    </div>
  );
}

/** Пара «призрак + булавка» — СТАБИЛЬНАЯ модель Telegram (раунд 10:
 * «супер стабильное положение метки от низа пузыря и от правой части»):
 *
 * - MetaGhost — НЕВИДИМАЯ копия меты В ПОТОКЕ в конце текста: резервирует
 *   её ТОЧНУЮ ширину (состав меты меняется — копия всегда точна, замеров
 *   нет); узкое сообщение ВСЕГДА достаточно широкое (р.7 п.1); последняя
 *   строка полна — призрак уходит своей строкой, и та становится рядом
 *   меты (текст никогда не заходит в зону меты — поток не позволяет).
 * - MetaPin — видимая метка АБСОЛЮТОМ, ребёнок ПОВЕРХНОСТИ (пузырь/часть
 *   медиа; в постах — блок текста на всю ширину карточки): right-2.5
 *   (12.5css = боковое поле текста от края) и bottom-5px — ОДИНАКОВЫ при
 *   любой длине текста и переносах, в один ряд с метой рядов реакций.
 *
 * Якорь НЕ может быть блоком текста с собственным px (паддинг-ловушка
 * right-0 = 0px от края, р.6 п.3) и не должен нести части паддинг (унос
 * метки на 11px от низа — расхождение с рядами реакций, р.10). Флоат
 * запрещён (на своей строке линия нулевой высоты — метка проваливалась
 * вниз без зазора, р.10); чистый абсолют без призрака тоже (не расширял
 * карточку, р.7 п.1). */
export function MetaGhost({
  message,
  mine,
  onFilled,
}: {
  message: ChatMessage;
  mine: boolean;
  onFilled?: boolean;
}) {
  return (
    <MessageMeta
      message={message}
      onFilled={onFilled ?? mine}
      ticks={mine}
      // ml-14px — ОБЯЗАТЕЛЬНЫЙ зазор текст→мета (раунд 11 п.1: «примерно
      // две цифры метки»): текст не касается метки НИКОГДА; строка кончилась —
      // призрак (с зазором) уходит своей строкой вниз, текст продолжает
      // расти в своей — поведение Telegram.
      className="invisible ml-[14px] inline-flex"
    />
  );
}

export function MetaPin({
  message,
  mine,
  onFilled,
}: {
  message: ChatMessage;
  mine: boolean;
  onFilled?: boolean;
}) {
  return (
    <span data-slot="meta-corner" className="pointer-events-none absolute right-2.5 bottom-[5px]">
      <MessageMeta message={message} onFilled={onFilled ?? mine} ticks={mine} />
    </span>
  );
}

/** Блок медиа поста канала: full-bleed вложения + щит селекта (тон поверх
 * картинки) + опциональный чип времени соло-изображения (р.3 п.2). */
export function MediaArea({
  message,
  mine,
  children,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Доп. оверлеи хозяина (чип времени) — поверх картинки. */
  children?: ReactNode;
}) {
  return (
    <span className="relative block">
      <MessageAttachments message={message} mine={mine} />
      <span aria-hidden data-slot="media-shield" className="pointer-events-none absolute inset-0" />
      {children}
    </span>
  );
}

/** Чип времени чистого изображения (без нижней части): нижний правый угол
 * ПОВЕРХ картинки, тёмная полупрозрачная заливка, мягкие углы, белый текст;
 * галочки — только у своих (currentColor = белый). */
export function MediaTimeChip({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <span className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-badge font-medium text-white">
      {message.pinned ? (
        <Pin role="img" aria-label={ui.chat.menu.pin} className="size-3" strokeWidth={1.75} />
      ) : null}
      {message.editedAt ? <span>{ui.chat.edited}</span> : null}
      <time className="font-mono tabular-nums" dateTime={message.createdAt}>
        {formatTime(message.createdAt)}
      </time>
      {mine ? <ReadTicks read={message.readBy.length > 0} /> : null}
    </span>
  );
}

/** Рамка выделения НАД контентом (border-2 по краю, не шире): для хостов
 * без SVG-силуэта (посты каналов) — единый с пузырями стиль рамки селекта. */
export function SelectRing() {
  return (
    <span
      aria-hidden
      data-slot="select-ring"
      className="pointer-events-none absolute inset-0 rounded-xl border-2 opacity-0 transition-opacity"
      style={{ borderColor: 'var(--selection-ring)' }}
    />
  );
}

/** Хвостовик нижней части медиа-сообщения: маленький SVG у нижнего угла
 * части, заливка тоном части; кривая — та же геометрия плавника outlinePath
 * (20-юнитовая сетка), замкнутая по краю части. SVG живёт СНАРУЖИ части
 * (`right-full`/`left-full` — раунд 5 п.2б: якорь left-0/right-0 рисовал
 * зеркальный путь ВНУТРИ части той же заливкой — плавник был невидим, а у
 * соло-картинки торчал поверх пикселей «намёком на хвостик»). */
export function BubbleFin({ side, tone }: { side: 'left' | 'right'; tone: 'in' | 'out' }) {
  const u = 1.25; // css px на юнит при UI_SCALE 1.25
  const w = 8 * u;
  const h = 9 * u;
  const f = (n: number) => (n * u).toFixed(2);
  // Локальные координаты: x=w — край части (для левого плавника svg висит
  // СЛЕВА от части: right-full), x=0 — край части у правого (left-full).
  const d =
    side === 'left'
      ? `M${f(8)} 0 L${f(2.8)} 0 Q${f(0.2)} ${f(-0.4)} ${f(1.5)} ${f(-1.5)} C${f(4.5)} ${f(-2.5)} ${f(8)} ${f(-4.5)} ${f(8)} ${f(-9)} Z`
      : `M0 0 L${f(5.2)} 0 Q${f(7.8)} ${f(-0.4)} ${f(6.5)} ${f(-1.5)} C${f(3.5)} ${f(-2.5)} 0 ${f(-4.5)} 0 ${f(-9)} Z`;
  return (
    <svg
      aria-hidden
      data-slot="bubble-fin"
      className={cn(
        'pointer-events-none absolute bottom-0',
        side === 'left' ? 'right-full' : 'left-full',
      )}
      width={w}
      height={h}
      viewBox={`0 ${(-9 * u).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`}
    >
      <path d={d} className={tone === 'in' ? 'fill-bubble-in' : 'fill-bubble-out'} />
    </svg>
  );
}
