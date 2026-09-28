import asyncio
import io
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "medium")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "pt")
MAX_AUDIO_BYTES = int(os.environ.get("WHISPER_MAX_AUDIO_BYTES", str(8 * 1024 * 1024)))
MAX_CONCURRENT = int(os.environ.get("WHISPER_MAX_CONCURRENT", "1"))
CPU_THREADS = int(os.environ.get("WHISPER_CPU_THREADS", "4"))
INTRA_THREADS = int(os.environ.get("WHISPER_INTRA_THREADS", "1"))
MAX_DURATION_SECONDS = int(os.environ.get("WHISPER_MAX_DURATION_SECONDS", "15"))
INITIAL_PROMPT = os.environ.get("WHISPER_INITIAL_PROMPT", "Bot, Elisyum, menu, comandos, figurinha, grupo.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = WhisperModel(
        MODEL_NAME,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        cpu_threads=CPU_THREADS,
        num_workers=INTRA_THREADS,
    )
    app.state.slots = asyncio.Semaphore(MAX_CONCURRENT)
    yield
    del app.state.model


app = FastAPI(title="Local Whisper transcription", lifespan=lifespan)


def transcribe_audio(model, payload, language, vad_filter):
    # faster-whisper performs inference while consuming the segments iterator.
    # Keep decoding AND iteration off the event loop so /health stays responsive.
    segments, info = model.transcribe(
        io.BytesIO(payload), language=language, task="transcribe",
        beam_size=3, best_of=1, temperature=0,
        initial_prompt=INITIAL_PROMPT or None,
        condition_on_previous_text=False, word_timestamps=False,
        vad_filter=vad_filter,
    )
    if info.duration > MAX_DURATION_SECONDS:
        raise HTTPException(status_code=413, detail=f"Voice command audio exceeds {MAX_DURATION_SECONDS} seconds")
    return " ".join(segment.text.strip() for segment in segments).strip(), info


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME, "compute_type": COMPUTE_TYPE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(LANGUAGE),
    task: str = Form("transcribe"),
    vad_filter: bool = Form(False),
):
    if task != "transcribe":
        raise HTTPException(status_code=422, detail="Only transcription is supported")
    payload = await file.read(MAX_AUDIO_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=422, detail="Audio is empty")
    if len(payload) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail=f"Audio exceeds {MAX_AUDIO_BYTES} bytes")

    if not language or len(language) > 10 or not language.isalpha():
        raise HTTPException(status_code=422, detail="Language must be a short language code")

    async with app.state.slots:
        started = time.perf_counter()
        try:
            text, info = await asyncio.to_thread(
                transcribe_audio, app.state.model, payload, language or LANGUAGE, vad_filter,
            )
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(status_code=422, detail="Unable to decode or transcribe audio") from error
        inference_ms = (time.perf_counter() - started) * 1000

    result = {
        "text": text,
        "language": info.language or language or LANGUAGE,
        "duration_ms": int(info.duration * 1000),
        "inference_ms": round(inference_ms, 2),
        "model": MODEL_NAME,
        "compute_type": COMPUTE_TYPE,
    }
    return result
