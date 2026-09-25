import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';

import { useSocketStatusStore } from './socket-status-store.js';
import { wsDebugEnabled } from './ws-debug.js';

/**
 * Отладочная точка состояния сокета (только `?wsdebug=1`, #104 раунд 2):
 * зелёная — соединение живо, красная — разрыв/реконнект. Постоянный слой
 * индикатора в продукте НЕ предусматривается (статус тихий, вердикт #104).
 */
export function WsDebugBadge() {
  if (!wsDebugEnabled) {
    return null;
  }
  return <WsDebugDot />;
}

function WsDebugDot() {
  const connected = useSocketStatusStore((s) => s.connected);
  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-[80]">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-slot="ws-debug-badge"
            aria-label={connected ? 'WS: подключено' : 'WS: нет соединения'}
            className={`block size-3 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
        </TooltipTrigger>
        <TooltipContent>
          {connected
            ? 'WS-сокет подключён (?wsdebug=1)'
            : 'WS-сокет отключён — реконнект/фолбэк (?wsdebug=1)'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
