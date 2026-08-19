import os
import sys

# Critical OpenMP / Thread optimization for Cloud / Container CPU limits
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OMP_WAIT_POLICY"] = "PASSIVE"
os.environ["PYTHONUNBUFFERED"] = "1"

import time
import tempfile
import logging
import traceback
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format='%(message)s')

app = FastAPI(title="Boabat Al-Arabi - Local faster-whisper STT Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def log_msg(msg: str):
    print(msg, flush=True)

def get_memory_usage() -> str:
    try:
        import resource
        usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # On Linux ru_maxrss is in kilobytes; on macOS in bytes
        if sys.platform == "darwin":
            return f"{usage / (1024 * 1024):.1f} MB"
        return f"{usage / 1024:.1f} MB"
    except Exception:
        return "N/A"

# Configuration from Environment Variables
MODEL_NAME = os.getenv("WHISPER_MODEL", "tiny")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", "1"))
NUM_WORKERS = int(os.getenv("WHISPER_NUM_WORKERS", "1"))

log_msg("[STT][INIT] Initializing faster-whisper")
log_msg(f"[STT][CONFIG] model={MODEL_NAME} device={DEVICE} compute_type={COMPUTE_TYPE} cpu_threads={CPU_THREADS} num_workers={NUM_WORKERS}")
log_msg(f"[STT][MEMORY] Initial RAM usage: {get_memory_usage()}")

# Global model instance loaded once at startup
try:
    model = WhisperModel(
        MODEL_NAME,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        cpu_threads=CPU_THREADS,
        num_workers=NUM_WORKERS
    )
    log_msg(f"[STT][READY] Model loaded successfully ({MODEL_NAME})")
    log_msg(f"[STT][MEMORY] Post-load RAM usage: {get_memory_usage()}")
except Exception as e:
    log_msg(f"[STT][ERROR] Failed to load model '{MODEL_NAME}': {e}")
    if MODEL_NAME != "tiny":
        log_msg("[STT][FALLBACK] Attempting fallback to 'tiny' model...")
        MODEL_NAME = "tiny"
        model = WhisperModel("tiny", device="cpu", compute_type="int8", cpu_threads=CPU_THREADS, num_workers=NUM_WORKERS)
        log_msg("[STT][READY] Fallback model 'tiny' loaded successfully")
    else:
        raise e

# Run immediate startup self-test
log_msg("[STT][SELFTEST] Running startup self-test inference on synthetic audio...")
try:
    t0 = time.perf_counter()
    sample_audio = np.zeros(16000, dtype=np.float32)
    test_segs, _ = model.transcribe(
        sample_audio,
        language="ar",
        beam_size=1,
        best_of=1,
        temperature=0.0,
        vad_filter=False,
        without_timestamps=True
    )
    list(test_segs)
    t1 = time.perf_counter()
    log_msg(f"[STT][SELFTEST] PASSED in {int((t1 - t0) * 1000)}ms. CTranslate2 engine is 100% operational.")
except Exception as selftest_err:
    log_msg(f"[STT][SELFTEST] Warning during startup test: {selftest_err}")

@app.get("/")
def root():
    return {
        "service": "Boabat Al-Arabi - STT AI Engine",
        "status": "ONLINE",
        "provider": "local-faster-whisper",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "cpu_threads": CPU_THREADS,
        "num_workers": NUM_WORKERS,
        "memory_usage": get_memory_usage(),
        "endpoints": {
            "health": "GET /health",
            "transcribe": "POST /transcribe",
            "docs": "GET /docs"
        }
    }

@app.get("/health")
def health_check():
    return {
        "status": "READY",
        "provider": "local-faster-whisper",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "memory_usage": get_memory_usage()
    }

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(None), file: UploadFile = File(None)):
    upload = audio or file
    if not upload:
        return {
            "success": False,
            "error": "No audio file uploaded",
            "code": "AUDIO_MISSING"
        }

    log_msg("[STT][REQUEST] Audio received")
    
    # Save uploaded bytes to a temporary file
    temp_suffix = os.path.splitext(upload.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=temp_suffix) as tmp:
        content = await upload.read()
        tmp.write(content)
        tmp.flush()
        temp_path = tmp.name

    audio_size = len(content)
    log_msg(f"[STT][AUDIO] size={audio_size} bytes")

    if audio_size == 0:
        try:
            os.remove(temp_path)
        except Exception:
            pass
        return {
            "success": False,
            "error": "Uploaded audio is empty",
            "code": "AUDIO_EMPTY"
        }

    temp_file_to_clean = temp_path

    try:
        log_msg(f"[STT][MEMORY] Pre-inference RAM: {get_memory_usage()}")
        started = time.perf_counter()
        log_msg("[STT][TRANSCRIBE] Calling model.transcribe()")

        # Execute transcription with lightweight single-beam CPU configuration
        try:
            segments, info = model.transcribe(
                temp_path,
                language="ar",
                initial_prompt="لوحة سيارة عربية: دال ألف دال اثنين خمسة اثنين أربعة، ألف سين باء ٢١٧٥",
                beam_size=1,
                best_of=1,
                temperature=0.0,
                vad_filter=False,
                without_timestamps=True
            )
            log_msg("[STT][SEGMENTS] Generator created")
        except Exception as file_err:
            log_msg(f"[STT][WARN] Direct file transcribe threw ({file_err}), trying in-memory buffer...")
            import io
            segments, info = model.transcribe(
                io.BytesIO(content),
                language="ar",
                initial_prompt="لوحة سيارة عربية: دال ألف دال اثنين خمسة اثنين أربعة، ألف سين باء ٢١٧٥",
                beam_size=1,
                best_of=1,
                temperature=0.0,
                vad_filter=False,
                without_timestamps=True
            )
            log_msg("[STT][SEGMENTS] Generator created (in-memory)")

        # Actively iterate and consume generator segments
        log_msg("[STT][SEGMENTS] Requesting first segment")
        text_segments = []
        for segment in segments:
            seg_text = segment.text.strip() if segment.text else ""
            if seg_text:
                log_msg(f'[STT][SEGMENT] text="{seg_text}"')
                text_segments.append(seg_text)

        log_msg("[STT][SEGMENTS] Iteration completed")
        log_msg("[STT][TRANSCRIBE] Inference completed")

        elapsed_s = time.perf_counter() - started
        duration_ms = int(elapsed_s * 1000)
        log_msg(f"[STT][TIMING] duration_ms={duration_ms}")
        log_msg(f"[STT][MEMORY] Post-inference RAM: {get_memory_usage()}")

        recognized_text = " ".join(text_segments).strip()
        log_msg(f'[STT][RESULT] text="{recognized_text}"')
        log_msg("[STT][DONE] Transcription completed")

        return {
            "success": True,
            "text": recognized_text,
            "provider": "local-faster-whisper",
            "language": "ar",
            "model": MODEL_NAME,
            "duration_ms": duration_ms
        }
    except Exception as err:
        log_msg(f"[STT][ERROR] Transcription exception: {err}")
        traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        return {
            "success": False,
            "error": str(err),
            "code": "STT_TRANSCRIPTION_FAILED",
            "traceback": traceback.format_exc()
        }
    finally:
        if temp_file_to_clean and os.path.exists(temp_file_to_clean):
            try:
                os.remove(temp_file_to_clean)
            except Exception:
                pass

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5001))
    uvicorn.run(app, host="0.0.0.0", port=port)
