import { useMemo } from 'react';

import { useViewStore } from './view-store.js';

/** Поле представления из реестра модуля: новое поле = +1 строка реестра. */
export interface FieldDef {
  id: string;
  /** Лейбл из contracts i18n (уже разрешённая строка). */
  label: string;
  defaultVisible: boolean;
  /** Ширина колонки таблицы по умолчанию, px. */
  defaultWidth?: number;
  minWidth?: number;
  /** Растягивается, заполняя свободное место (колонка названия). */
  flex?: boolean;
  /** Нельзя скрыть (название сущности). */
  locked?: boolean;
}

export type ViewField<T extends FieldDef = FieldDef> = T & {
  visible: boolean;
  width?: number;
};

/**
 * Настройки вида: реестр модуля ⊕ сохранённое (неизвестные id отбрасываются,
 * новые поля модуля подхватываются дефолтами реестра — так система
 * масштабируется без миграций пресетов). Дженерик сохраняет поля реестра
 * (render и т.п.) в возвращаемом типе.
 */
export function useViewFields<T extends FieldDef>(viewKey: string, defs: T[]) {
  const stored = useViewStore((s) => s.views[viewKey]);
  const setFieldVisible = useViewStore((s) => s.setFieldVisible);
  const setFieldWidth = useViewStore((s) => s.setFieldWidth);
  const resetView = useViewStore((s) => s.resetView);

  const fields = useMemo<ViewField<T>[]>(
    () =>
      defs.map((d) => {
        const prefs = stored?.[d.id];
        return {
          ...d,
          visible: prefs?.visible ?? d.defaultVisible,
          width: prefs?.width ?? d.defaultWidth,
        };
      }),
    [defs, stored],
  );

  return {
    fields,
    visibleFields: useMemo(() => fields.filter((f) => f.visible), [fields]),
    isVisible: (id: string) => fields.find((f) => f.id === id)?.visible ?? false,
    toggleField: (id: string, visible: boolean) => setFieldVisible(viewKey, id, visible),
    setWidth: (id: string, width: number) => setFieldWidth(viewKey, id, width),
    reset: () => resetView(viewKey),
  };
}
