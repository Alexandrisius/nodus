import { useProjectStructure } from '../api/project-structure.js';
import { TaskStructureField } from './task-structure-field.js';

/** Состояние поля «Структура» окна создания задачи (#467): узлы выбранного
 *  проекта, обязательность и загрузка. Подзадача (parentId) узел наследует
 *  на сервере — поле ей не показываем. */
export function useTaskCreateStructure(
  projectId: string | undefined,
  parentId: string | undefined,
) {
  const query = useProjectStructure(projectId);
  const nodes = query.data?.nodes ?? [];
  const loading = Boolean(projectId) && query.isLoading;
  const required = Boolean(projectId) && !parentId && nodes.length > 0;
  return {
    nodes,
    loading,
    required,
    visible: Boolean(projectId) && !parentId && nodes.length > 0,
  };
}

export type TaskCreateStructureState = ReturnType<typeof useTaskCreateStructure>;

export function TaskCreateStructure({
  structure,
  value,
  onChange,
}: {
  structure: TaskCreateStructureState;
  value: string | null;
  onChange: (nodeId: string) => void;
}) {
  if (!structure.visible) return null;
  return (
    <TaskStructureField
      nodes={structure.nodes}
      value={value}
      required={structure.required}
      onChange={onChange}
    />
  );
}
