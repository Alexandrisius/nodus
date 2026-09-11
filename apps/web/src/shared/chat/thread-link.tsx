import type { NodeEdgePoint } from '@nodus/ui/components/node-edge';
import { NodeEdge } from '@nodus/ui/components/node-edge';

import { FLASH_DRAW_CAP_S, FLASH_PULSE_CAP_S } from './channel-layout.js';

/**
 * Связь треда: СТАТИЧНОЕ hairline-ребро с портами-точками на обоих концах
 * (узел-пост → порт левого края окна треда), пока тред открыт в двух зонах.
 * Связь — структура (как контур: шина/отводы/порты постоянны); вспышка —
 * СОБЫТИЕ поверх: рисовка + пульс со свечением на открытие/смену треда,
 * пробегает по тому же ребру и гаснет (dock-edge-fade), ребро остаётся.
 * Геометрия — живые rect (channel-view): ребро следует за постом при
 * скролле ленты и за окном при transition ширины; пост не целиком в ленте —
 * линия ОБРЫВАЕТСЯ на кромке скроллера без горизонтали и без точки источника
 * (prop pinned): сегмент обрыва идёт вдоль кромки ВНУТРИ контейнера канала,
 * за его пределы (шапка страницы, композер) ребро не выходит.
 * Перемонтирование вспышки (key) — повторный пробег при смене треда.
 */
export function ThreadLink({
  points,
  pinned,
  flash,
  flashRun,
}: {
  points: NodeEdgePoint[];
  /** пост за краем ленты: линия оборвана, точки-источника нет */
  pinned: boolean;
  flash: { points: NodeEdgePoint[]; fadeMs: number } | null;
  flashRun: number;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      <NodeEdge points={points} ports={pinned ? 'end' : 'both'} />
      {flash ? (
        <div
          key={flashRun}
          className="dock-edge-fade absolute inset-0"
          style={{ animationDuration: `${flash.fadeMs}ms` }}
        >
          <NodeEdge
            points={flash.points}
            ports="none"
            drawOn
            pulse="once"
            active
            drawCapS={FLASH_DRAW_CAP_S}
            pulseCapS={FLASH_PULSE_CAP_S}
          />
        </div>
      ) : null}
    </div>
  );
}
