#!/usr/bin/env bash
# Монитор стека для k6-прогонов #117: каждые 10 с — CPU/RAM контейнеров,
# активные PG-сессии, события за минуту, длина Redis-стрима и pending-хвост
# consumer-группы gateway (рост pending = fanout не успевает за потоком).
# Запуск: bash tools/monitor.sh run/monitor-<профиль>.log  (Ctrl+C — стоп)
set -u
OUT=${1:-run/monitor.log}
mkdir -p "$(dirname "$OUT")"
echo "ts cpu/mem api|gateway|pg|redis pg_active events_1m stream_len stream_pending" >> "$OUT"
while true; do
  ts=$(date +%H:%M:%S)
  stats=$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' \
    nodus_api nodus_gateway nodus_postgres nodus_redis 2>/dev/null \
    | sort | sed 's/  */ /g' | tr '\n' ';' )
  pg_active=$(docker exec nodus_postgres psql -U nodus -d nodus -tAc \
    "SELECT count(*) FROM pg_stat_activity WHERE state='active'" 2>/dev/null)
  events_1m=$(docker exec nodus_postgres psql -U nodus -d nodus -tAc \
    "SELECT count(*) FROM events WHERE created_at > now() - interval '1 minute'" 2>/dev/null)
  stream_len=$(docker exec nodus_redis redis-cli XLEN nodus:chat:events 2>/dev/null)
  stream_pending=$(docker exec nodus_redis redis-cli --raw XPENDING nodus:chat:events nodus:gateway 2>/dev/null | head -1)
  echo "$ts [$stats] pg_active=$pg_active events_1m=$events_1m stream_len=$stream_len pending=$stream_pending" >> "$OUT"
  sleep 10
done
