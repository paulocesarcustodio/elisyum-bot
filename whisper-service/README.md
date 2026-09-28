# Local Whisper Service

Install in an isolated Python environment, then keep the process running so faster-whisper loads its model once:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
WHISPER_MODEL=large-v3-turbo WHISPER_COMPUTE_TYPE=int8 WHISPER_CPU_THREADS=6 WHISPER_INTRA_THREADS=1 WHISPER_MAX_CONCURRENT=1 \
  uvicorn server:app --app-dir whisper-service --host 127.0.0.1 --port 8090 --workers 1
```

The service accepts multipart `POST /transcribe` requests with `file`, `language=pt`, `task=transcribe` and `vad_filter=false`. It returns text, detected language, audio duration and inference time. One Uvicorn worker owns one resident model; the semaphore limits simultaneous inference without creating a model process per request.

The bot calls this endpoint only when `VOICE_COMMANDS_ENABLED=true`. Bot flags are documented in the project README; this service has no dependency on OpenJev or external inference APIs.

For an audio-to-command evaluation, put consented, locally stored samples and expected outcomes in JSONL (one `{"audio":"/path/sample.wav","text":"silencia João","expected_command":"silenciar","group":true}` per line), configure OpenJev, then run `bun run voice:bench manifest.jsonl`. It reports final intent accuracy and p50/p95/p99 transcription and end-to-end latency. The Python script measures only the Whisper service and is useful for base-vs-small/threads/concurrency sweeps; it does not claim semantic accuracy. `benchmark-models.sh` demonstrates base/small and 1/2/4/8/16 thread sweeps with a persistent service per configuration. It deliberately requires a pre-installed isolated environment and restarts between model/thread combinations; it does not download weights or install system packages on the bot host.

The complete setup uses pinned `mobiuslabsgmbh/faster-whisper-large-v3-turbo` weights, CPU int8 with six threads and one transcription at a time. It supplies an offline local model path and a 120-second bot request timeout. Use `bash scripts/setup/install.sh --start` after pulling changes; the service keeps its 15-second voice-command audio limit.
