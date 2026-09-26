#!/usr/bin/env python3
"""Evaluate final intent accuracy and latency for base/small Whisper settings.

Audio dataset manifest (JSON Lines): {"audio":"path.wav","text":"spoken text","expected_command":"mp3"}.
Optional transcript can pin reference to avoid requiring human transcription during command scoring.
This benchmark emits one JSON summary per model/thread/worker/concurrency configuration.
"""
import argparse
import concurrent.futures
import json
import os
import time
import urllib.error
import urllib.request

def percentile(values, p):
    if not values:
        return 0
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, max(0, int((len(ordered) - 1) * p)))], 2)


def transcribe(base_url, audio_path, language):
    import requests

    started = time.perf_counter()
    with open(audio_path, "rb") as audio:
        response = requests.post(
            base_url.rstrip("/") + "/transcribe",
            files={"file": (os.path.basename(audio_path), audio, "audio/wav")},
            data={"language": language, "task": "transcribe", "vad_filter": "false"},
            timeout=30,
        )
    response.raise_for_status()
    return response.json(), (time.perf_counter() - started) * 1000


def check_service(url):
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=1) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8090")
    parser.add_argument("--manifest", help="JSONL audio dataset for real command-level benchmark")
    parser.add_argument("--language", default="pt")
    parser.add_argument("--concurrency", default="1,2,4,8")
    parser.add_argument("--models", default="base,small")
    parser.add_argument("--threads", default="1,2,4,8,16")
    parser.add_argument("--workers", default="1,2,4")
    parser.add_argument("--endpoint-confirmed-model", action="store_true", help="Confirm the service has been restarted with each requested model/thread config; otherwise configs are reported as skipped.")
    parser.add_argument("--include-overflow", action="store_true", help="Include 8-worker x 8-request tests; useful diagnostically but not recommended for latency-sensitive serving.")
    args = parser.parse_args()
    configs = [(m, int(t), int(w), int(c)) for m in args.models.split(",") for t in args.threads.split(",") for w in args.workers.split(",") for c in args.concurrency.split(",")]
    if not args.include_overflow:
        configs = [config for config in configs if not (config[2] * config[3] > 16)]
    if not check_service(args.base_url):
        print(json.dumps({"status": "service_unavailable", "url": args.base_url, "configs": configs}, indent=2))
        return 2
    if not args.manifest:
        print(json.dumps({"status": "service_available", "note": "Pass --manifest with labeled real audio to measure final command accuracy."}, indent=2))
        return 0

    with open(args.manifest, encoding="utf8") as manifest:
        dataset = [json.loads(line) for line in manifest if line.strip()]
    results = []
    for model, threads, workers, concurrency in configs:
        if not args.endpoint_confirmed_model:
            results.append({"status": "configuration_requires_service_restart", "model": model, "cpu_threads": threads, "workers": workers, "concurrency": concurrency})
            continue
        latencies, correct, total = [], 0, 0
        # The service must be restarted with these settings before each config.
        for start in range(0, len(dataset), concurrency):
            batch = dataset[start:start + concurrency]
            with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
                for item, (response, total_ms) in zip(batch, pool.map(lambda row: transcribe(args.base_url, row["audio"], args.language), batch)):
                    expected = item.get("expected_command")
                    actual = item.get("actual_command")
                    hypothesis = response.get("text", "")
                    if actual is None and expected is not None and reference:
                        try:
                            router_payload = json.dumps({"text": hypothesis, "context": item.get("context", "")}).encode("utf8")
                            request = urllib.request.Request(
                                os.environ.get("SEMANTIC_BENCH_URL", "http://127.0.0.1:8082/classify"),
                                data=router_payload,
                                headers={"Content-Type": "application/json"},
                            )
                            with urllib.request.urlopen(request, timeout=4) as router_response:
                                actual = json.loads(router_response.read()).get("command")
                        except (OSError, urllib.error.URLError, json.JSONDecodeError):
                            actual = None
                    if actual is not None:
                        correct += actual == expected
                    total += 1
                    latencies.append(total_ms)
        results.append({
            "model": model, "cpu_threads": threads, "workers": workers, "concurrency": concurrency,
            "samples": total, "command_accuracy": (correct / total if total and os.environ.get("SEMANTIC_BENCH_URL") else None),
            "transcription_p50_ms": percentile(latencies, .50),
            "transcription_p95_ms": percentile(latencies, .95),
            "transcription_p99_ms": percentile(latencies, .99),
        })
    print(json.dumps(results, indent=2))
    if not args.endpoint_confirmed_model:
        print(json.dumps({"status": "no_accuracy_or_latency_claim", "note": "Restart the isolated service for each config and pass --endpoint-confirmed-model. No values were inferred from configuration names."}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
