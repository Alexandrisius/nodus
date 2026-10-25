import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { ui } from '@nodus/contracts';

import { BulkIsland, bulkActionClass } from '../../../../shared/views/bulk-island.js';

/**
 * Островок массовых действий реестра атрибутов: каркас — общий
 * `shared/views/bulk-island`, здесь только команды. Действия зависят от
 * выделения (вердикт 25.10.2026): «Скрыть» — если среди выбранных есть
 * видимые, «Показывать всем» — если есть скрытые, «Удалить» — всегда
 * (окно удаления проверит, где используются). Тестовый мусор чистится
 * пачкой — ради этого островок и есть.
 */
export function FieldBulkIsland({
  count,
  visible,
  hasVisible,
  hasHidden,
  pending,
  onSetHidden,
  onDelete,
  onClear,
}: {
  count: number;
  visible: boolean;
  hasVisible: boolean;
  hasHidden: boolean;
  pending: boolean;
  onSetHidden: (hidden: boolean) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const tabIndex = visible ? 0 : -1;
  return (
    <BulkIsland
      visible={visible}
      count={count}
      ariaLabel={ui.customFields.page.title}
      pending={pending}
      onClear={onClear}
    >
      {hasVisible ? (
        <button
          type="button"
          className={bulkActionClass}
          tabIndex={tabIndex}
          onClick={() => onSetHidden(true)}
        >
          <EyeOff className="size-4" strokeWidth={1.75} />
          {ui.customFields.menu.hide}
        </button>
      ) : null}
      {hasHidden ? (
        <button
          type="button"
          className={bulkActionClass}
          tabIndex={tabIndex}
          onClick={() => onSetHidden(false)}
        >
          <Eye className="size-4" strokeWidth={1.75} />
          {ui.customFields.menu.show}
        </button>
      ) : null}
      <button type="button" className={bulkActionClass} tabIndex={tabIndex} onClick={onDelete}>
        <Trash2 className="size-4" strokeWidth={1.75} />
        {ui.customFields.menu.delete}
      </button>
    </BulkIsland>
  );
}
