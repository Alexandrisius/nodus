/**
 * `pnpm live-stack status`: состояние контура и режима (dev / preview /
 * dev+mock). Вынесено из live-stack.mjs (I5): список портов и пробы
 * передаются вызывающим, модуль ничего не знает о старте процессов.
 */
export async function printStatus({ pids, pidAlive, portBusy, ports, mode }) {
  if (mode) console.log(`mode     ${mode}`);
  for (const [name, port] of Object.entries(ports)) {
    const pid = pids[name];
    const busy = await portBusy(port);
    const state = pidAlive(pid)
      ? `running (pid ${pid})`
      : busy
        ? 'port taken by FOREIGN process (orphan?)'
        : 'free';
    console.log(`${name.padEnd(8)} :${port}  ${state}`);
  }
  // Контур владельца (чужой процесс — только проба порта): сюда отсылают на
  // приёмку, а он может быть выключен — видимость вместо предположения.
  const devUp = await portBusy(5173);
  console.log(`dev-owner :5173  ${devUp ? 'up (владельца)' : 'down — приёмку отдавать на :4173'}`);
}
