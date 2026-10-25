import type { TransitionForm } from '@nodus/contracts';

/**
 * Окна перехода системного каталога (ревизия 4, #380). Отдельный файл —
 * чтобы оба маршрута (стандартный и быстрый) брали одинаковые формы без
 * цикла импортов system-catalog ↔ system-catalog-quick.
 */

/** Окно с одной причиной: приостановка/возврат/отмена. */
export function commentWindow(label: string, required: boolean): TransitionForm {
  return { enabled: true, sections: [{ kind: 'comment', label, required }] };
}

/** Окно закрытия работы: необязательный итог, файлы и сообщения чата как
 *  отчёт. Обязательность итога — гейт result_present (Р3). */
export function resultWindow(): TransitionForm {
  return {
    enabled: true,
    sections: [
      { kind: 'result' },
      { kind: 'result_files', label: 'Файлы итога' },
      { kind: 'result_messages', required: false },
    ],
  };
}
