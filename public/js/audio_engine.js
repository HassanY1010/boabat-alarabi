/**
 * Boabat Al-Arabi - Enterprise VAD-Powered MediaRecorder Audio Engine
 * Features:
 * - Real-Time AudioContext Voice Activity Detection (VAD)
 * - Automatic speech start and silence end detection (no arbitrary blind 3.5s cutting)
 * - Complete, standalone WebM files with valid headers per spoken plate
 * - Clean asynchronous pipeline: Speech -> Silence -> Stop -> Upload -> Whisper STT -> Plate Parser -> Table
 */

class AudioEngine {
  constructor(onSpokenText, onTranscriptUpdate, onStatusChange) {
    this.onSpokenText = onSpokenText; // Central pipeline callback: app.processSpokenText
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.onStatusChange = onStatusChange;

    this.isListening = false;
    this.mediaStream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.activeRecorder = null;
    this.sessionToken = 0;
    this.isProcessingSTT = false;

    // VAD Configuration
    this.SILENCE_TIMEOUT_MS = 900; // Time of silence before finalizing utterance
    this.MIN_SPEECH_DURATION_MS = 500; // Minimum speech to consider valid utterance
    this.MAX_RECORDING_DURATION_MS = 6000; // Safety maximum duration per utterance (6 seconds max)
    this.SPEECH_THRESHOLD = 0.016; // Audio RMS energy threshold

    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.hasSpokenInThisCycle = false;
    this.vadInterval = null;
    this.maxDurationTimer = null;

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
    this.updateStatus('🎙️ يستمع الآن... تفضل بنطق لوحة السيارة بشكل طبيعي');

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

    // 2. Setup Web Audio API Analyser for real-time VAD & visualizer
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;
      source.connect(this.analyser);
    } catch (e) {
      console.warn('[VOICE][WARN] AudioContext VAD initialization failed, fallback to timer mode:', e);
    }

    // 3. Start VAD monitoring loop & recording cycle
    this.startVadMonitoring(currentSession);
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

    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.hasSpokenInThisCycle = false;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        cycleChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      console.log('[VOICE][RECORDER] Recording stopped');

      if (this.maxDurationTimer) {
        clearTimeout(this.maxDurationTimer);
        this.maxDurationTimer = null;
      }

      if (!this.isListening || this.sessionToken !== sessionToken) {
        return;
      }

      const hadValidSpeech = this.hasSpokenInThisCycle;
      this.hasSpokenInThisCycle = false;
      this.isSpeaking = false;

      if (cycleChunks.length === 0 || !hadValidSpeech) {
        // No speech detected in this cycle, seamlessly restart listening
        if (this.isListening && this.sessionToken === sessionToken && !this.isTranscribing) {
          this.startRecordingCycle(sessionToken);
        }
        return;
      }

      // Create a standalone WebM Blob with complete file header
      const completeAudioBlob = new Blob(cycleChunks, { type: actualMime });
      console.log('[VOICE][AUDIO] Complete blob created (' + completeAudioBlob.size + ' bytes)');

      if (completeAudioBlob.size > 1500) {
        this.isTranscribing = true;
        await this.uploadAndTranscribeBlob(completeAudioBlob, sessionToken);
        this.isTranscribing = false;
      }

      // Start next listening cycle ONLY AFTER STT response completes
      if (this.isListening && this.sessionToken === sessionToken) {
        this.startRecordingCycle(sessionToken);
      }
    };

    // Start recorder
    try {
      recorder.start();
      console.log('[VOICE][RECORDER] Recording started');
    } catch (err) {
      console.error('[VOICE][ERROR] Recorder start failed:', err);
      this.stopListening();
      return;
    }

    // Maximum safety duration limit per utterance
    this.maxDurationTimer = setTimeout(() => {
      if (this.isListening && this.sessionToken === sessionToken && recorder.state === 'recording') {
        if (this.hasSpokenInThisCycle) {
          console.log('[VOICE][SILENCE] Maximum recording limit reached, finalizing...');
        }
        try { recorder.stop(); } catch (e) {}
      }
    }, this.MAX_RECORDING_DURATION_MS);
  }

  startVadMonitoring(sessionToken) {
    if (this.vadInterval) clearInterval(this.vadInterval);

    const buffer = new Float32Array(this.analyser ? this.analyser.fftSize : 256);

    this.vadInterval = setInterval(() => {
      if (!this.isListening || this.sessionToken !== sessionToken) {
        clearInterval(this.vadInterval);
        return;
      }

      let rms = 0;
      if (this.analyser) {
        this.analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i] * buffer[i];
        }
        rms = Math.sqrt(sum / buffer.length);
        this.drawVisualizer(rms);
      }

      // During active STT request, VAD is paused
      if (this.isTranscribing) {
        return;
      }

      const now = Date.now();
      const isAudible = rms > this.SPEECH_THRESHOLD;

      if (isAudible) {
        this.silenceStartTime = 0;
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.speechStartTime = now;
          this.hasSpokenInThisCycle = true;
          console.log('[VOICE][SPEECH] Speech detected');
          this.updateStatus('🎙️ جاري التحدث... استمر بنطق اللوحة');
        }
      } else {
        // In silence
        if (this.isSpeaking) {
          if (!this.silenceStartTime) {
            this.silenceStartTime = now;
          } else if (now - this.silenceStartTime >= this.SILENCE_TIMEOUT_MS) {
            const speechDuration = now - this.speechStartTime;
            if (speechDuration >= this.MIN_SPEECH_DURATION_MS) {
              console.log('[VOICE][SILENCE] Silence detected');
              this.isSpeaking = false;
              if (this.activeRecorder && this.activeRecorder.state === 'recording') {
                try { this.activeRecorder.stop(); } catch (e) {}
              }
            }
          }
        }
      }
    }, 60);
  }

  async uploadAndTranscribeBlob(audioBlob, sessionToken) {
    if (!this.isListening || this.sessionToken !== sessionToken || this.isProcessingSTT) return;
    this.isProcessingSTT = true;

    console.log('[VOICE][STT] Uploading complete recording (' + audioBlob.size + ' bytes)');
    this.updateStatus('⬆️ جاري معالجة الصوت وتحويله إلى نص...');

    const formData = new FormData();
    formData.append('audio', audioBlob, 'speech_utterance.webm');

    try {
      const res = await fetch('/api/v1/speech/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!this.isListening || this.sessionToken !== sessionToken) return;

      const data = await res.json();

      if (data.success && typeof data.text === 'string' && data.text.trim().length > 0) {
        const recognizedTranscript = data.text.trim();
        console.log('[VOICE][STT] Transcript received: "' + recognizedTranscript + '"');
        console.log('[VOICE][PIPELINE] processSpokenText()');
        this.updateStatus('🔎 تم التعرف: "' + recognizedTranscript + '"');

        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(recognizedTranscript);
        }
        if (this.onSpokenText) {
          this.onSpokenText(recognizedTranscript);
        }
      } else {
        if (this.isListening && this.sessionToken === sessionToken) {
          this.updateStatus('🎙️ يستمع الآن... تفضل بنطق لوحة السيارة بشكل طبيعي');
        }
      }
    } catch (err) {
      console.error('[VOICE][STT] Upload error:', err.message);
      if (this.isListening && this.sessionToken === sessionToken) {
        this.updateStatus('⚠️ تعذر الاتصال، يستمر الاستماع...');
      }
    } finally {
      this.isProcessingSTT = false;
    }
  }

  stopListening() {
    this.isListening = false;
    this.sessionToken++;
    this.isProcessingSTT = false;

    this.cleanup();

    this.clearVisualizer();
    if (this.audioBadge) this.audioBadge.textContent = 'صامت';
    this.updateStatus('تم إيقاف الجلسة الصوتية مؤقتًا');
  }

  cleanup() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }

    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    if (this.activeRecorder) {
      if (this.activeRecorder.state !== 'inactive') {
        try { this.activeRecorder.stop(); } catch (e) {}
      }
      this.activeRecorder.ondataavailable = null;
      this.activeRecorder.onstop = null;
      this.activeRecorder = null;
    }

    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) {}
      this.audioCtx = null;
      this.analyser = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    console.log('[VOICE][RECORDER] Cleanup complete');
  }

  drawVisualizer(rms) {
    if (!this.canvasCtx || !this.canvas) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.canvasCtx.clearRect(0, 0, width, height);

    const barCount = 18;
    const barWidth = (width / barCount) - 2;
    const level = Math.min(1.0, rms * 15);

    for (let i = 0; i < barCount; i++) {
      const randomWave = Math.sin(Date.now() / 120 + i) * 0.3 + 0.7;
      const barHeight = Math.max(3, level * randomWave * height);
      const x = i * (barWidth + 2);
      const y = height - barHeight;

      this.canvasCtx.fillStyle = this.isSpeaking ? '#00F5D4' : '#26E6C8';
      this.canvasCtx.fillRect(x, y, barWidth, barHeight);
    }

    if (this.audioBadge) {
      this.audioBadge.textContent = this.isSpeaking ? 'نشط 🎙️' : (level > 0.05 ? 'متوسط' : 'هادئ');
    }
  }

  clearVisualizer() {
    if (!this.canvasCtx || !this.canvas) return;
    this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

window.AudioEngine = AudioEngine;
