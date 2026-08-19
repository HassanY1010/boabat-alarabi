/**
 * Boabat Al-Arabi - Real-Time MediaRecorder Audio Engine & STT Pipeline
 * Clean Single-Lifecycle Architecture with timeslice recording and queueing
 */

class AudioEngine {
  constructor(onSpokenText, onTranscriptUpdate, onStatusChange) {
    this.onSpokenText = onSpokenText; // Central pipeline callback: app.processSpokenText
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.onStatusChange = onStatusChange;

    this.isListening = false;
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.sessionToken = 0;
    this.chunkSequence = 0;
    this.uploadQueue = [];
    this.isUploading = false;
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

  async startListening() {
    if (this.isListening) return;

    // Clean up any stale recorder or stream before starting
    this.cleanup();

    this.isListening = true;
    const currentSession = ++this.sessionToken;
    this.chunkSequence = 0;
    this.uploadQueue = [];
    this.isUploading = false;

    console.log('[VOICE][SESSION] Started');
    this.updateStatus('🎙️ جاري التسجيل والاستماع... تفضل بنطق لوحة السيارة');

    // 1. Request microphone stream
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

    // 2. Select optimal audio MIME type
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      else mimeType = '';
    }

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
    }

    console.log('[VOICE][RECORDER] Created');

    // 3. ondataavailable handler (fires every ~3.2 seconds due to start(3200))
    this.mediaRecorder.ondataavailable = (event) => {
      if (this.sessionToken !== currentSession || !this.isListening) return;

      if (event.data && event.data.size > 0) {
        console.log('[VOICE][RECORDER] dataavailable size=' + event.data.size);

        if (event.data.size > 1500) {
          const chunkId = ++this.chunkSequence;
          this.uploadQueue.push({ chunkId, blob: event.data, token: currentSession });
          this.processUploadQueue();
        }
      }
    };

    this.mediaRecorder.onstop = () => {
      console.log('[VOICE][RECORDER] stop()');
    };

    // 4. Start recording in continuous stream with 3200ms timeslice (NO repeated stop() calls)
    try {
      this.mediaRecorder.start(3200);
      console.log('[VOICE][RECORDER] start()');
    } catch (err) {
      console.error('[VOICE][ERROR] MediaRecorder start failed:', err);
      this.stopListening();
      return;
    }

    this.startSimulatedVisualizer();
  }

  async processUploadQueue() {
    if (this.isUploading || this.uploadQueue.length === 0) return;

    const item = this.uploadQueue.shift();
    if (!item || item.token !== this.sessionToken) {
      this.processUploadQueue();
      return;
    }

    this.isUploading = true;
    const { chunkId, blob, token } = item;

    console.log('[VOICE][STT] Uploading chunk #' + chunkId + ' size=' + blob.size);
    this.updateStatus('⬆️ جاري إرسال المقطع الصوتي #' + chunkId + '...');

    const formData = new FormData();
    formData.append('audio', blob, 'speech_chunk_' + chunkId + '.webm');

    try {
      const res = await fetch('/api/v1/speech/transcribe', {
        method: 'POST',
        body: formData
      });

      if (token !== this.sessionToken) {
        this.isUploading = false;
        this.processUploadQueue();
        return;
      }

      const data = await res.json();
      console.log('[VOICE][STT] Response received chunk #' + chunkId, data);

      if (data.success && data.text && data.text.trim().length > 0) {
        const recognizedTranscript = data.text.trim();
        console.log('[VOICE][STT] Transcript chunk #' + chunkId + ': "' + recognizedTranscript + '"');
        console.log('[VOICE][PIPELINE] processSpokenText()');
        this.updateStatus('🔎 تم التعرف: "' + recognizedTranscript + '"');

        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(recognizedTranscript);
        }
        if (this.onSpokenText) {
          this.onSpokenText(recognizedTranscript);
        }
      } else {
        if (this.isListening) {
          this.updateStatus('🎙️ يستمع الآن... تفضل بنطق لوحة السيارة بشكل طبيعي');
        }
      }
    } catch (err) {
      console.error('[VOICE][STT] Chunk #' + chunkId + ' upload failed:', err.message);
      if (this.isListening) {
        this.updateStatus('⚠️ خطأ في معالجة الصوت، يستمر الاستماع...');
      }
    } finally {
      this.isUploading = false;
      this.processUploadQueue();
    }
  }

  stopListening() {
    this.isListening = false;
    this.sessionToken++;
    this.uploadQueue = [];
    this.isUploading = false;

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
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== 'inactive') {
        try {
          this.mediaRecorder.stop();
        } catch (e) {}
      }
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder = null;
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
