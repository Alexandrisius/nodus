import type { OrgUnitKind } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { SegmentedControl } from '../../../shared/ui/segmented-control.js';

/**
 * Переключатель управленческая/юридическая структура — пилюля ТОГО же образца,
 * что переключатель ящиков «Общий / Личная» в корреспонденции (вердикт
 * владельца 24.09.2026: кнопка создания и переключатель — в образце стиля
 * корреспонденции, правый угол шапки свободен): рамка rounded-lg p-0.5,
 * активный сегмент — bg-accent rounded-md, неактивный — muted с hover.
 */
export function StructureKindSwitcher({
  kind,
  onChange,
}: {
  kind: OrgUnitKind;
  onChange: (kind: OrgUnitKind) => void;
}) {
  return (
    <SegmentedControl
      value={kind}
      options={[
        { value: 'management', label: ui.employees.kindManagement },
        { value: 'legal', label: ui.employees.kindLegal },
      ]}
      onChange={onChange}
      ariaLabel={ui.employees.structure}
      className="shrink-0"
      size="sm"
      activeClassName="bg-accent text-foreground"
    />
  );
}
