import os
import sys
import tempfile
import logging
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(message)s')

app = FastAPI(title="Boabat Al-Arabi - Local faster-whisper STT Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from Environment Variables
MODEL_NAME = os.getenv("WHISPER_MODEL", "tiny")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

print("[STT][INIT] Initializing faster-whisper")
print(f"[STT][CONFIG] model={MODEL_NAME} device={DEVICE} compute_type={COMPUTE_TYPE}")

# Global model instance loaded once at startup
try:
    model = WhisperModel(
        MODEL_NAME,
        device=DEVICE,
        compute_type=COMPUTE_TYPE
    )
    print(f"[STT][READY] Model loaded successfully ({MODEL_NAME})")
except Exception as e:
    print(f"[STT][ERROR] Failed to load model '{MODEL_NAME}': {e}")
    # Fallback to tiny model if memory constrained
    if MODEL_NAME != "tiny":
        print("[STT][FALLBACK] Attempting fallback to 'tiny' model...")
        MODEL_NAME = "tiny"
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        print("[STT][READY] Fallback model 'tiny' loaded successfully")
    else:
        raise e

@app.get("/")
def root():
    return {
        "service": "Boabat Al-Arabi - STT AI Engine",
        "status": "ONLINE",
        "provider": "local-faster-whisper",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
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
        "compute_type": COMPUTE_TYPE
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

    print("[STT][REQUEST] Audio received")
    
    # Save uploaded bytes to a temporary file
    temp_suffix = os.path.splitext(upload.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=temp_suffix) as tmp:
        content = await upload.read()
        tmp.write(content)
        temp_path = tmp.name

    audio_size = len(content)
    print(f"[STT][AUDIO] size={audio_size} bytes")

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

    try:
        import time
        start_time = time.time()
        print("[STT][TRANSCRIBE] Calling model.transcribe()")

        try:
            segments, info = model.transcribe(
                temp_path,
                language="ar",
                initial_prompt="لوحة سيارة عربية: دال ألف دال اثنين خمسة اثنين أربعة، ألف سين باء ٢١٧٥",
                beam_size=5,
                temperature=0.0,
                vad_filter=False
            )
            text_segments = [s.text.strip() for s in segments if s.text and s.text.strip()]
        except Exception as file_err:
            print(f"[STT][WARN] Direct file transcribe failed ({file_err}), trying in-memory stream...")
            import io
            segments, info = model.transcribe(
                io.BytesIO(content),
                language="ar",
                initial_prompt="لوحة سيارة عربية: دال ألف دال اثنين خمسة اثنين أربعة، ألف سين باء ٢١٧٥",
                beam_size=5,
                temperature=0.0,
                vad_filter=False
            )
            text_segments = [s.text.strip() for s in segments if s.text and s.text.strip()]

        print("[STT][TRANSCRIBE] model.transcribe() returned")
        duration_ms = int((time.time() - start_time) * 1000)
        print(f"[STT][TIMING] duration_ms={duration_ms}")

        recognized_text = " ".join(text_segments).strip()
        print(f'[STT][RESULT] text="{recognized_text}"')
        print("[STT][DONE] Transcription completed")

        return {
            "success": True,
            "text": recognized_text,
            "provider": "local-faster-whisper",
            "language": "ar",
            "model": MODEL_NAME,
            "processing_ms": duration_ms
        }
    except Exception as err:
        print(f"[STT][ERROR] Transcription exception: {err}")
        return {
            "success": False,
            "error": str(err),
            "code": "STT_TRANSCRIPTION_FAILED"
        }
    finally:
        try:
            os.remove(temp_path)
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5001))
    uvicorn.run(app, host="0.0.0.0", port=port)
