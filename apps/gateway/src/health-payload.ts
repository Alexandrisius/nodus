/** Полезная нагрузка проверки живости `GET /health` WS-gateway. */
export function buildHealthPayload(): { status: 'ok'; timestamp: string } {
  return { status: 'ok', timestamp: new Date().toISOString() };
}
