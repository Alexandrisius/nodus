/** Демо-id подразделений обеих структур (#84). Люди — `users.ts`, сами
 *  подразделения и сборка дерева — `departments.ts` (без циклов импортов). */
const did = (n: number): string => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const departmentIds = {
  /** Управленческая: компания → [Проектное → BIM-отдел, Административное]. */
  company: did(1),
  project: did(2),
  bim: did(3),
  admin: did(4),
  /** Юридическая: компания → Группа ГИПов (инженеры по трудовой, #18). */
  legalCompany: did(11),
  legalGip: did(12),
};
