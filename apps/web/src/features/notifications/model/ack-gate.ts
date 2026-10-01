/** Гейт «долистал до конца» листа ознакомления (Ф4, вердикт 30.09):
 *  включается только для текста длиннее порога — короткие сразу активны
 *  (C6/C7). Чистая функция (юнит-покрыта). */
export const ACK_SCROLL_GATE_LINES = 8;

export function isAckGateNeeded(text: string | null): boolean {
  if (!text) return false;
  return text.split('\n').length > ACK_SCROLL_GATE_LINES || text.length > 400;
}
