/**
 * Карта scope композера → беседа (#239): окну вложений нужен состав
 * участников для автокомплита @упоминаний в подписи, но scope треда
 * (`thread:<rootId>`) не содержит conversationId — его знает только
 * смонтированный композер хоста. Композер регистрирует пару на монте;
 * окно читает мапу на открытии. Записи не чистятся по закрытию окна —
 * scop'ы конечны, композер перезапишет своё значение следующим монтом.
 */
const scopeConversations = new Map<string, string>();

export function registerScopeConversation(scope: string, conversationId?: string): void {
  if (conversationId) scopeConversations.set(scope, conversationId);
  else scopeConversations.delete(scope);
}

export function scopeConversationOf(scope: string): string | undefined {
  return scopeConversations.get(scope);
}
