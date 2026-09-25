#!/usr/bin/env bash
# Лестница «предел прочности» #117: последовательные k6-ступени VUS:SEND_EVERY_MS:СЕК.
# Темп на юзера постоянен (~1.65 сообщ/мин/VU), нагрузка растёт с сокетами:
#   300 сокетов ≈ 500 сообщ/мин (канон НФТ) → 2000 сокетов ≈ 3300 сообщ/мин.
# Автостоп: k6 exit != 0 (стек лёг) или gateway health не отвечает между ступенями.
# Запуск: bash tools/run-ladder.sh  (cwd = apps/gateway/perf)
set -u
cd "$(dirname "$0")/.."
mkdir -p run

STAGES=(

  "600:20000:150"
  "900:20000:150"
  "1200:20000:150"
  "1500:20000:150"
  "2000:20000:150"
)
API_HOST=${API:-http://host.docker.internal:3001}
GW_HOST=${GW:-ws://host.docker.internal:3002}

for stage in "${STAGES[@]}"; do
  IFS=':' read -r vus every secs <<<"$stage"
  if ! curl -sf http://127.0.0.1:3002/health > /dev/null; then
    echo "!! gateway health failed — лестница остановлена перед ступенью $vus"
    break
  fi
  echo "=== ступень ${vus} сокетов, тик ${every}ms, ${secs}s — $(date +%H:%M:%S) ==="
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/perf:ro" -w /perf \
    -e API="$API_HOST" -e GW="$GW_HOST" \
    -e VUS="$vus" -e SEND_EVERY_MS="$every" -e DURATION_MS=$((secs * 1000)) \
    grafana/k6:0.58.0 run super-load.js 2>&1 | tee "run/ladder-${vus}.log" | tail -25
  # рестарты/падение gateway ловим по RestartCount (docker wait блокируется
  # на живом контейнере — нельзя ставить между ступенями)
  restarts=$(docker inspect nodus_gateway --format '{{.RestartCount}}' 2>/dev/null)
  if [ "${restarts:-0}" != "0" ]; then
    echo "!! gateway рестартировал ($restarts) на ступени $vus"
  fi
  sleep 25
done

echo "=== лестница завершена — $(date +%H:%M:%S); сводка: ==="
for f in run/ladder-*.log; do
  echo "--- $f"
  grep -E 'chat_delivery_ms|ws_connect_ms|chat_missed_events|chat_send_failures|chat_op_failures|ws_events_rx|ws_failed_attempts|ws_connect_errors' "$f" | grep -E 'avg|count' | head -12
done
