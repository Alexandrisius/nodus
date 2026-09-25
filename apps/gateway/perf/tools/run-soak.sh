#!/usr/bin/env bash
# Часовой профиль НФТ #117: 300 сокетов, ~500 сообщ/мин, p95 < 200 мс.
# На 30-й минуте — docker restart nodus_gateway (массовый реконнект #119),
# сквозной прогон с саморазрывами сокетов (selfChurnProb в hour-soak.js).
# Запуск: bash tools/run-soak.sh  (cwd = apps/gateway/perf)
set -u
cd "$(dirname "$0")/.."
mkdir -p run

DURATION_S=${DURATION_S:-3660}
RESTART_AT=${RESTART_AT:-1800} # сек до рестарта gateway

bash tools/monitor.sh run/monitor-soak.log &
MON_PID=$!

# Массовый реконнект: рестарт gateway в середине прогона (снаружи k6 —
# как реальный сбой/обновление), клиенты переподключаются бэкоффом.
(sleep "$RESTART_AT" && echo "$(date +%H:%M:%S) restarting gateway" >> run/soak-restart.log && docker restart nodus_gateway >> run/soak-restart.log 2>&1) &
RESTART_PID=$!

MSYS_NO_PATHCONV=1 docker run --rm --name nodus_k6_soak \
  -v "$(pwd):/perf:ro" -w /perf \
  -e API=${API:-http://host.docker.internal:3001} \
  -e GW=${GW:-ws://host.docker.internal:3002} \
  -e VUS=${VUS:-300} -e SEND_EVERY_MS=${SEND_EVERY_MS:-20000} \
  -e DURATION_MS=$((DURATION_S * 1000)) \
  grafana/k6:0.58.0 run hour-soak.js 2>&1 | tee run/soak.log

kill "$MON_PID" "$RESTART_PID" 2>/dev/null || true
echo "soak завершён — итоговые пороги выше; мониторинг: run/monitor-soak.log"
