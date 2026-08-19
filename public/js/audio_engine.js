/**
 * Boabat Al-Arabi - High-Speed Enterprise Voice State Machine (Sub-Second Voice-to-Table Pipeline)
 * 
 * Optimized Flow:
 * Speech End -> Fast VAD (~320ms) -> Recorder Stop -> Standalone Blob -> STT Fetch -> Fast Tokenizer -> Instant Optimistic Table Insert -> Background DB Verification
 */

class AudioEngine {
  constructor(onSpokenText, onTranscriptUpdate, onStatusChange) {
    this.onSpokenText = onSpokenText; // Central pipeline callback: app.processSpokenText
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.onStatusChange = onStatusChange;

    // FSM State: IDLE | LISTENING | RECORDING | STOPPING | TRANSCRIBING | PROCESSING
    this.state = 'IDLE';
    this.isListening = false;
    this.sessionActive = false;
    this.mediaStream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.activeRecorder = null;
    this.sessionToken = 0;

    // State Guards
    this.hasSpeech = false;
    this.isRecording = false;
    this.isStopping = false;
    this.isTranscribing = false;
    this.cycleChunks = [];
    this.actualMime = 'audio/webm';

    // High-Performance VAD Tuning (Sub-second response)
    this.SILENCE_TIMEOUT_MS = 320; // 320ms fast silence cutoff
    this.MIN_SPEECH_DURATION_MS = 350; // 350ms minimum speech
    this.MAX_RECORDING_DURATION_MS = 5500; // Safety maximum duration per utterance
    this.SPEECH_THRESHOLD = 0.016; // Audio energy RMS threshold

    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.vadInterval = null;
    this.maxDurationTimer = null;

    // Performance Metrics Timing Object
    this.perfMetrics = {
      tSpeechEnd: 0,
      tRecorderStop: 0,
      tBlobReady: 0,
      tFetchStart: 0,
      tFetchResponse: 0,
      tTranscriptReady: 0
    };

    // UI Elements
    this.canvas = document.getElementById('audioVisualizerCanvas');
    this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
    this.audioBadge = document.getElementById('audioLevelBadge');
    this.liveTranscript = document.getElementById('liveTranscript');
  }

  transitionState(newState) {
    if (this.state === newState) return;

    if (this.sessionActive && newState === 'IDLE') {
      console.warn('[VOICE][FSM] BLOCKED LISTENING -> IDLE while session is active');
      return;
    }

    console.log('[VOICE][STATE] ' + this.state + ' -> ' + newState);
    this.state = newState;
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
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return 'audio/webm';
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
    return 'audio/webm';
  }

  async startListening() {
    if (this.isListening) return;

    this.cleanup();
    this.isListening = true;
    this.sessionActive = true;
    const currentSession = ++this.sessionToken;

    console.log('[VOICE][SESSION] Started');
    this.transitionState('LISTENING');
    this.updateStatus('🎙️ يستمع الآن... تفضل بنطق لوحة السيارة');

    // 1. Acquire microphone stream
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err) {
      console.error('[VOICE][ERROR] Microphone access error:', err);
      this.updateStatus('❌ تعذر الوصول إلى الميكروفون. يرجى منح الإذن في المتصفح.', true);
      this.stopListening('mic_permission_failed');
      return;
    }

    if (!this.isListening || this.sessionToken !== currentSession) {
      this.cleanup();
      return;
    }

    // 2. Setup Web Audio API Analyser for VAD & UI visualizer
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;
      source.connect(this.analyser);
    } catch (e) {
      console.warn('[VOICE][WARN] AudioContext initialization failed:', e);
    }

    // 3. Start VAD monitoring loop (tight 40ms interval for immediate speech/silence detection)
    this.startVadMonitoring(currentSession);
  }

  startVadMonitoring(sessionToken) {
    if (this.vadInterval) clearInterval(this.vadInterval);

    const buffer = new Float32Array(this.analyser ? this.analyser.fftSize : 256);

    this.vadInterval = setInterval(() => {
      if (!this.isListening || !this.sessionActive || this.sessionToken !== sessionToken) {
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

      // If active STT or Processing is in progress, ignore speech triggers
      if (this.state === 'TRANSCRIBING' || this.state === 'PROCESSING' || this.state === 'STOPPING') {
        return;
      }

      const now = Date.now();
      const isAudible = rms > this.SPEECH_THRESHOLD;

      if (isAudible) {
        this.silenceStartTime = 0;

        if (this.state === 'LISTENING') {
          // Speech detected! Transition from LISTENING to RECORDING
          this.hasSpeech = true;
          this.speechStartTime = now;
          console.log('[VOICE][SPEECH] Speech detected');
          this.transitionState('RECORDING');
          this.beginUtteranceRecording(sessionToken);
        }
      } else {
        // In silence
        if (this.state === 'RECORDING') {
          if (!this.silenceStartTime) {
            this.silenceStartTime = now;
          } else if (now - this.silenceStartTime >= this.SILENCE_TIMEOUT_MS) {
            const speechDuration = now - this.speechStartTime;
            if (speechDuration >= this.MIN_SPEECH_DURATION_MS) {
              console.log('[VOICE][SILENCE] Silence detected');
              this.perfMetrics.tSpeechEnd = performance.now();
              console.log('[PERF] speech_end');
              this.stopUtteranceRecording(sessionToken, 'silence');
            }
          }
        }
      }
    }, 40);
  }

  beginUtteranceRecording(sessionToken) {
    if (this.state !== 'RECORDING' || !this.mediaStream) return;

    this.cycleChunks = [];
    const mimeType = this.getOptimalMimeType();
    let recorder;

    try {
      recorder = new MediaRecorder(this.mediaStream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      recorder = new MediaRecorder(this.mediaStream);
    }

    this.activeRecorder = recorder;
    this.actualMime = recorder.mimeType || mimeType || 'audio/webm';
    this.isRecording = true;
    this.isStopping = false;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.cycleChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      this.perfMetrics.tRecorderStop = performance.now();
      console.log('[PERF] recorder_stop');
      console.log('[VOICE][RECORDER] Recording stopped');
      this.isRecording = false;

      if (this.maxDurationTimer) {
        clearTimeout(this.maxDurationTimer);
        this.maxDurationTimer = null;
      }

      if (!this.isListening || !this.sessionActive || this.sessionToken !== sessionToken) {
        return;
      }

      // Check if valid speech was captured
      if (!this.hasSpeech || this.cycleChunks.length === 0) {
        console.log('[VOICE][SILENCE] No speech detected');
        console.log('[VOICE][RECORDER] Discarding silent recording');
        this.resetToListeningState(sessionToken);
        return;
      }

      const completeAudioBlob = new Blob(this.cycleChunks, { type: this.actualMime });
      this.perfMetrics.tBlobReady = performance.now();
      console.log('[PERF] blob_ready');
      console.log('[VOICE][AUDIO] Complete blob created (' + completeAudioBlob.size + ' bytes)');

      if (completeAudioBlob.size < 1200) {
        console.log('[VOICE][RECORDER] Discarding silent recording');
        this.resetToListeningState(sessionToken);
        return;
      }

      // Transition to TRANSCRIBING
      this.transitionState('TRANSCRIBING');
      await this.uploadAndTranscribeBlob(completeAudioBlob, sessionToken);

      // Return to LISTENING only after complete STT + Pipeline finishes
      if (this.isListening && this.sessionActive && this.sessionToken === sessionToken) {
        this.resetToListeningState(sessionToken);
      }
    };

    try {
      recorder.start();
      console.log('[VOICE][RECORDER] Recording started');
      this.updateStatus('🎙️ جاري التحدث... استمر بنطق اللوحة');
    } catch (err) {
      console.error('[VOICE][ERROR] Failed to start MediaRecorder:', err);
      this.resetToListeningState(sessionToken);
      return;
    }

    // Safety maximum duration timer
    this.maxDurationTimer = setTimeout(() => {
      if (this.state === 'RECORDING' && this.sessionToken === sessionToken) {
        console.log('[VOICE][SILENCE] Maximum recording duration reached');
        if (!this.perfMetrics.tSpeechEnd) {
          this.perfMetrics.tSpeechEnd = performance.now();
          console.log('[PERF] speech_end');
        }
        this.stopUtteranceRecording(sessionToken, 'max_duration');
      }
    }, this.MAX_RECORDING_DURATION_MS);
  }

  stopUtteranceRecording(sessionToken, reason = 'silence') {
    if (this.state !== 'RECORDING' || this.isStopping) return;
    this.isStopping = true;

    this.transitionState('STOPPING');

    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    if (this.activeRecorder && this.activeRecorder.state === 'recording') {
      try {
        this.activeRecorder.stop();
      } catch (err) {
        console.warn('[VOICE][WARN] Error stopping recorder:', err);
      }
    }
  }

  resetToListeningState(sessionToken) {
    this.hasSpeech = false;
    this.isRecording = false;
    this.isStopping = false;
    this.isTranscribing = false;
    this.cycleChunks = [];
    this.silenceStartTime = 0;
    this.speechStartTime = 0;

    if (this.isListening && this.sessionActive && this.sessionToken === sessionToken) {
      this.transitionState('LISTENING');
      console.log('[VOICE][RECORDER] Starting next listening cycle');
      this.updateStatus('🎙️ يستمع الآن... تفضل بنطق لوحة السيارة');
    }
  }

  async uploadAndTranscribeBlob(audioBlob, sessionToken) {
    if (this.isTranscribing) return;
    this.isTranscribing = true;

    console.log('[VOICE][STT] Uploading complete recording (' + audioBlob.size + ' bytes)');
    this.updateStatus('⬆️ جاري معالجة الصوت وتحويله إلى نص...');

    const formData = new FormData();
    formData.append('audio', audioBlob, 'speech_utterance.webm');

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      console.warn('[VOICE][STT][TIMEOUT] Request exceeded 60 seconds');
      if (controller) controller.abort();
    }, 60000);

    try {
      this.perfMetrics.tFetchStart = performance.now();
      console.log('[PERF] fetch_start');
      console.log('[VOICE][STT] Fetch started');
      const res = await fetch('/api/v1/speech/transcribe', {
        method: 'POST',
        body: formData,
        signal: controller ? controller.signal : undefined
      });
      clearTimeout(timeoutId);

      this.perfMetrics.tFetchResponse = performance.now();
      console.log('[PERF] fetch_response');
      console.log('[VOICE][STT] HTTP response received status=' + res.status);
      console.log('[VOICE][STT] response.ok=' + res.ok);

      const rawText = await res.text();
      console.log('[VOICE][STT] Raw response=' + rawText);

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('[VOICE][STT] Failed to parse JSON response:', parseErr);
        data = { success: false, error: 'JSON parse error' };
      }
      console.log('[VOICE][STT] JSON parsed=', data);

      if (data.success && typeof data.text === 'string' && data.text.trim().length > 0) {
        const recognizedTranscript = data.text.trim();
        this.perfMetrics.tTranscriptReady = performance.now();
        console.log('[PERF] transcript_ready');
        console.log('[VOICE][STT] Transcript received: "' + recognizedTranscript + '"');

        const sttDurationMs = Math.round(this.perfMetrics.tTranscriptReady - this.perfMetrics.tFetchStart);
        console.log('[PERF][STT] ' + sttDurationMs + ' ms');

        this.transitionState('PROCESSING');
        console.log('[VOICE][PIPELINE] Calling processSpokenText()');
        this.updateStatus('🔎 تم التعرف: "' + recognizedTranscript + '"');

        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(recognizedTranscript);
        }
        if (this.onSpokenText) {
          await this.onSpokenText(recognizedTranscript, { perfMetrics: this.perfMetrics });
        }
        console.log('[VOICE][PIPELINE] processSpokenText() completed');
      } else {
        console.log('[VOICE][STT] Transcript received: ""');
        console.log('[VOICE][PLATE] No complete plate detected');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.warn('[VOICE][STT][TIMEOUT] Request exceeded 60 seconds');
      } else {
        console.error('[VOICE][STT] Upload error:', err.message);
      }
    } finally {
      clearTimeout(timeoutId);
      this.isTranscribing = false;
    }
  }

  stopListening(reason = 'user_action') {
    const caller = (new Error().stack || '').split('\n')[2] || 'unknown';
    console.log('[VOICE][SESSION] stopListening() called');
    console.log('[VOICE][SESSION] stop reason=' + reason);
    console.log('[VOICE][SESSION] caller=' + caller.trim());

    this.sessionActive = false;
    this.isListening = false;
    this.sessionToken++;
    this.transitionState('IDLE');

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

    this.hasSpeech = false;
    this.isRecording = false;
    this.isStopping = false;
    this.isTranscribing = false;
    this.cycleChunks = [];
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

      this.canvasCtx.fillStyle = this.state === 'RECORDING' ? '#00F5D4' : '#26E6C8';
      this.canvasCtx.fillRect(x, y, barWidth, barHeight);
    }

    if (this.audioBadge) {
      this.audioBadge.textContent = this.state === 'RECORDING' ? 'نشط 🎙️' : (level > 0.05 ? 'متوسط' : 'هادئ');
    }
  }

  clearVisualizer() {
    if (!this.canvasCtx || !this.canvas) return;
    this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

if (typeof window !== 'undefined') {
  window.AudioEngine = AudioEngine;
}

if (typeof module !== 'undefined') {
  module.exports = { AudioEngine };
}
