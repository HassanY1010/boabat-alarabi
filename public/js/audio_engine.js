/**
 * Boabat Al-Arabi - Real-Time MediaRecorder Audio Engine & STT Pipeline
 * Architecture:
 * Microphone -> MediaRecorder -> Audio Blob -> POST /api/v1/speech/transcribe
 * -> Transcript -> app.processSpokenText() -> Plate Parser -> Table Record -> Wanted Check
 */

class AudioEngine {
  constructor(onSpokenText, onTranscriptUpdate, onStatusChange) {
    this.onSpokenText = onSpokenText; // Central pipeline callback: app.processSpokenText
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.onStatusChange = onStatusChange;

    this.isListening = false;
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.sliceTimer = null;
    this.animFrameId = null;
    this.isUploading = false;

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
    this.isListening = true;

    console.log('[VOICE][SESSION] Started');
    this.updateStatus('🎙️ جاري التسجيل والاستماع... تفضل بنطق لوحة السيارة');

    // 1. Request real microphone stream
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

    console.log('[VOICE][RECORDER] Recording started');

    // 2. Select optimal audio MIME type supported by browser
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

    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      if (this.audioChunks.length > 0) {
        const currentMime = this.mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: currentMime });
        console.log('[VOICE][RECORDER] Recording stopped (' + audioBlob.size + ' bytes)');

        if (audioBlob.size > 1200) {
          this.uploadAndTranscribe(audioBlob);
        }
      }
    };

    // 3. Start recording chunks continuously in cycles of ~3.2 seconds
    this.mediaRecorder.start();
    this.startSimulatedVisualizer();

    this.sliceTimer = setInterval(() => {
      if (this.isListening && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
        setTimeout(() => {
          if (this.isListening && this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            try {
              this.mediaRecorder.start();
            } catch (e) {}
          }
        }, 60);
      }
    }, 3200);
  }

  async uploadAndTranscribe(audioBlob) {
    if (this.isUploading) return;
    this.isUploading = true;

    console.log('[VOICE][STT] Uploading audio');
    this.updateStatus('⬆️ جاري إرسال الصوت وتحويله إلى نص...');

    const formData = new FormData();
    formData.append('audio', audioBlob, 'speech_chunk.webm');

    try {
      const res = await fetch('/api/v1/speech/transcribe', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      console.log('[VOICE][STT] Response received:', data);

      if (data.success && data.text && data.text.trim().length > 0) {
        const recognizedTranscript = data.text.trim();
        console.log('[VOICE][STT] Transcript: "' + recognizedTranscript + '"');
        console.log('[VOICE][PIPELINE] processSpokenText()');
        this.updateStatus('🔎 جاري فحص اللوحة: "' + recognizedTranscript + '"');

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
      console.error('[VOICE][STT] Network / upload error:', err.message);
      if (this.isListening) {
        this.updateStatus('⚠️ تعذر تحويل الصوت إلى نص. يستمر الاستماع...');
      }
    } finally {
      this.isUploading = false;
    }
  }

  stopListening() {
    this.isListening = false;
    this.isUploading = false;

    if (this.sliceTimer) {
      clearInterval(this.sliceTimer);
      this.sliceTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (e) {}
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.clearVisualizer();
    if (this.audioBadge) this.audioBadge.textContent = 'صامت';
    this.updateStatus('تم إيقاف الجلسة الصوتية مؤقتًا');
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
