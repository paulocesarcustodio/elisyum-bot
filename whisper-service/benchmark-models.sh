#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="${WHISPER_PYTHON:-$ROOT/whisper-service/.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  printf 'Create the isolated environment and install whisper-service/requirements.txt first.\n' >&2
  exit 2
fi

for model in base small; do
  for threads in 1 2 4 8 16; do
    service_pid="$(pgrep -f '[u]vicorn server:app.*8090' || true)"
    if [[ -n "$service_pid" ]]; then kill $service_pid; fi
    WHISPER_MODEL="$model" \
    WHISPER_COMPUTE_TYPE=int8 \
    WHISPER_DEVICE=cpu \
    WHISPER_CPU_THREADS="$threads" \
    WHISPER_INTRA_THREADS=1 \
    WHISPER_MAX_CONCURRENT=1 \
      "$PYTHON" -m uvicorn server:app --app-dir "$ROOT/whisper-service" --host 127.0.0.1 --port 8090 >"$ROOT/whisper-service/benchmark-service.log" 2>&1 &
    service_pid=$!
    trap 'kill "$service_pid" 2>/dev/null || true' EXIT
    ready=0
    for _ in $(seq 1 180); do
      if curl -fsS http://127.0.0.1:8090/health >/dev/null; then ready=1; break; fi
      sleep 1
    done
    if [[ "$ready" -ne 1 ]]; then printf 'Whisper failed to start (%s threads, %s).\n' "$threads" "$model" >&2; exit 1; fi
    BENCH_SERVICE_MODEL="$model" BENCH_SERVICE_THREADS="$threads" BENCH_SERVICE_WORKERS=1 \
      python3 "$ROOT/scripts/benchmark-voice-commands.py" --base-url http://127.0.0.1:8090 \
      --models "$model" --threads "$threads" --workers 1 --concurrency 1,2,4,8 \
      --endpoint-confirmed-model
    kill "$service_pid"
    wait "$service_pid" || true
    trap - EXIT
  done
done
