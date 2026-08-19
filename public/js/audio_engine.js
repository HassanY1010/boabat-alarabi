/**
 * Boabat Al-Arabi - Enterprise MediaRecorder Audio Engine & STT Pipeline
 * Sequential Full-Header WebM Recording Cycles (No timeslice slicing)
 * Architecture:
 * getUserMedia() -> create MediaRecorder -> record 3500ms -> recorder.stop()
 * -> Complete WebM Blob with valid Header -> POST /api/v1/speech/transcribe
 * -> faster-whisper STT -> app.processSpokenText() -> Next Recording Cycle
 */

const VOICE_CHUNK_DURATION_MS = window.VOICE_CHUNK_DURATION_MS || 3500;

class AudioEngine {
  constructor(onSpokenText, onTranscriptUpdate, onStatusChange) {
    this.onSpokenText = onSpokenText; // Central pipeline callback: app.processSpokenText
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.onStatusChange = onStatusChange;

    this.isListening = false;
    this.mediaStream = null;
    this.activeRecorder = null;
    this.sessionToken = 0;
    this.cycleTimer = null;
    this.animFrameId = null;

    this.canvas = document.getElementById('audioVisualizerCanvas');
    this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
    this.audioBadge = document.getElementById('audioLevelBadge');
    this.liveTranscript = document.getElementById('liveTranscript');
  }

  updateStatus(stateText, isError = false) {
    if (this.liveTranscript) {
      this.liveTranscript.textContent = stateText;
      this.liveTranscript.style.color = isError ? '#FF4D6D' : '';
    }
    if (this.onStatusChange) {
      this.onStatusChange(stateText, isError);
    }
  }

  getOptimalMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  async startListening() {
    if (this.isListening) return;

    this.cleanup();
    this.isListening = true;
    const currentSession = ++this.sessionToken;

    console.log('[VOICE][SESSION] Started');
    this.updateStatus('🎙️ جاري التسجيل والاستماع... تفضل بنطق لوحة السيارة');

    // 1. Acquire real microphone stream
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err) {
      console.error('[VOICE][ERROR] Microphone permission failed:', err);
      this.updateStatus('❌ تعذر الوصول إلى الميكروفون. يرجى منح الإذن في المتصفح.', true);
      this.stopListening();
      return;
    }

    if (!this.isListening || this.sessionToken !== currentSession) {
      this.cleanup();
      return;
    }

    this.startSimulatedVisualizer();

    // 2. Start initial discrete recording cycle
    this.startRecordingCycle(currentSession);
  }

  startRecordingCycle(sessionToken) {
    if (!this.isListening || this.sessionToken !== sessionToken || !this.mediaStream) {
      return;
    }

    const mimeType = this.getOptimalMimeType();
    let recorder;

    try {
      recorder = new MediaRecorder(this.mediaStream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      recorder = new MediaRecorder(this.mediaStream);
    }

    this.activeRecorder = recorder;
    const cycleChunks = [];
    const actualMime = recorder.mimeType || mimeType || 'audio/webm';

    console.log('[VOICE][RECORDER] Created');
    console.log('[VOICE][RECORDER] Config: mimeType="' + actualMime + '", duration=' + VOICE_CHUNK_DURATION_MS + 'ms');

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        cycleChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      console.log('[VOICE][RECORDER] Recording stopped');

      if (!this.isListening || this.sessionToken !== sessionToken) {
        return;
      }

      if (cycleChunks.length === 0) {
        console.warn('[VOICE][RECORDER] No audio chunks collected');
        this.scheduleNextCycle(sessionToken);
        return;
      }

      // Create a standalone WebM Blob with complete file header
      const completeAudioBlob = new Blob(cycleChunks, { type: actualMime });
      console.log('[VOICE][RECORDER] Complete standalone Blob created (' + completeAudioBlob.size + ' bytes)');

      if (completeAudioBlob.size > 1200) {
        await this.uploadAndTranscribeBlob(completeAudioBlob, sessionToken);
      }

      // Chain next recording cycle if session is still active
      if (this.isListening && this.sessionToken === sessionToken) {
        console.log('[VOICE][RECORDER] Starting next recording cycle');
        this.startRecordingCycle(sessionToken);
      }
    };

    // Start recording whole chunk (without timeslice, so onstop produces complete WebM file)
    try {
      recorder.start();
      console.log('[VOICE][RECORDER] Recording started');
    } catch (err) {
      console.error('[VOICE][ERROR] Recorder start failed:', err);
      this.stopListening();
      return;
    }

    // Schedule stop after configured duration
    this.cycleTimer = setTimeout(() => {
      if (this.isListening && this.sessionToken === sessionToken && recorder.state === 'recording') {
        try {
          recorder.stop();
        } catch (e) {}
      }
    }, VOICE_CHUNK_DURATION_MS);
  }

  scheduleNextCycle(sessionToken) {
    if (this.isListening && this.sessionToken === sessionToken) {
      setTimeout(() => {
        if (this.isListening && this.sessionToken === sessionToken) {
          console.log('[VOICE][RECORDER] Starting next recording cycle');
          this.startRecordingCycle(sessionToken);
        }
      }, 200);
    }
  }

  async uploadAndTranscribeBlob(audioBlob, sessionToken) {
    if (!this.isListening || this.sessionToken !== sessionToken) return;

    console.log('[VOICE][STT] Uploading audio (' + audioBlob.size + ' bytes, type=' + audioBlob.type + ')');
    this.updateStatus('⬆️ جاري إرسال الصوت وتحويله إلى نص...');

    const formData = new FormData();
    formData.append('audio', audioBlob, 'speech_recording.webm');

    try {
      const res = await fetch('/api/v1/speech/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!this.isListening || this.sessionToken !== sessionToken) return;

      const data = await res.json();
      console.log('[VOICE][STT] Response received:', data);

      if (data.success && data.text && data.text.trim().length > 0) {
        const recognizedTranscript = data.text.trim();
        console.log('[VOICE][STT] Transcript: "' + recognizedTranscript + '"');
        console.log('[VOICE][PIPELINE] processSpokenText()');
        this.updateStatus('🔎 تم التعرف: "' + recognizedTranscript + '"');

        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(recognizedTranscript);
        }
        if (this.onSpokenText) {
          this.onSpokenText(recognizedTranscript);
        }
      } else {
        if (data.error) {
          console.warn('[VOICE][STT] STT Notice:', data.error);
        }
        if (this.isListening && this.sessionToken === sessionToken) {
          this.updateStatus('🎙️ يستمع الآن... تفضل بنطق لوحة السيارة بشكل طبيعي');
        }
      }
    } catch (err) {
      console.error('[VOICE][STT] Upload error:', err.message);
      if (this.isListening && this.sessionToken === sessionToken) {
        this.updateStatus('⚠️ خطأ في الاتصال، يستمر الاستماع...');
      }
    }
  }

  stopListening() {
    this.isListening = false;
    this.sessionToken++;

    this.cleanup();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.clearVisualizer();
    if (this.audioBadge) this.audioBadge.textContent = 'صامت';
    this.updateStatus('تم إيقاف الجلسة الصوتية مؤقتًا');
  }

  cleanup() {
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }

    if (this.activeRecorder) {
      if (this.activeRecorder.state !== 'inactive') {
        try {
          this.activeRecorder.stop();
        } catch (e) {}
      }
      this.activeRecorder.ondataavailable = null;
      this.activeRecorder.onstop = null;
      this.activeRecorder = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    console.log('[VOICE][RECORDER] Cleanup complete');
  }

  startSimulatedVisualizer() {
    if (!this.isListening || !this.canvasCtx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    this.canvasCtx.clearRect(0, 0, width, height);

    const barCount = 18;
    const barWidth = (width / barCount) - 2;

    for (let i = 0; i < barCount; i++) {
      const randomVal = Math.sin(Date.now() / 180 + i) * 0.45 + 0.55;
      const barHeight = Math.max(3, randomVal * height);
      const x = i * (barWidth + 2);
      const y = height - barHeight;

      this.canvasCtx.fillStyle = '#26E6C8';
      this.canvasCtx.fillRect(x, y, barWidth, barHeight);
    }

    if (this.audioBadge) this.audioBadge.textContent = 'متوسط';
    this.animFrameId = requestAnimationFrame(() => this.startSimulatedVisualizer());
  }

  clearVisualizer() {
    if (!this.canvasCtx) return;
    this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

window.AudioEngine = AudioEngine;
