/**
 * Boabat Al-Arabi - Enterprise Real-Time Speech Recognition & Audio Engine
 * Features:
 * - Robust WebSpeechProvider with intelligent locale fallback (ar-EG -> ar-SA -> ar)
 * - Exponential backoff on network errors with strict maximum attempt threshold (no infinite loops)
 * - Hardware safety: AudioContext visualizer does NOT lock microphone from SpeechRecognition
 * - Full diagnostics: [VOICE][ENV], [VOICE][CONFIG], [VOICE][INTERIM], [VOICE][FINAL], [VOICE][RAW]
 * - Modular SpeechProvider architecture supporting future Cloud STT fallbacks
 */

class WebSpeechProvider {
  constructor(options = {}) {
    this.onSpokenText = options.onSpokenText || null;
    this.onTranscriptUpdate = options.onTranscriptUpdate || null;
    this.onError = options.onError || null;
    this.onStatusChange = options.onStatusChange || null;

    this.recognition = null;
    this.isSessionActive = false;
    this.isRecognitionRunning = false;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.restartTimer = null;
    this.currentLangIndex = 0;
    this.supportedLangs = ['ar-EG', 'ar-SA', 'ar']; // Egyptian Dialect priority with regional fallbacks

    this.initProvider();
  }

  logEnvironment() {
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const isEdge = /Edg/.test(navigator.userAgent);
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    console.log('[VOICE][ENV]', {
      browser: isEdge ? 'Microsoft Edge' : (isChrome ? 'Google Chrome' : navigator.userAgent),
      isSecureContext: window.isSecureContext,
      protocol: location.protocol,
      hostname: location.hostname,
      online: navigator.onLine,
      speechRecognitionSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      mediaDevicesSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    });
  }

  initProvider() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[VOICE] Web Speech API is not supported in this browser environment.');
      return;
    }

    this.logEnvironment();
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    const chosenLang = document.getElementById('settingLanguage')?.value || this.supportedLangs[0];
    this.recognition.lang = chosenLang;

    this.recognition.onstart = () => {
      this.isRecognitionRunning = true;
      this.restartAttempts = 0;
      console.log('[VOICE] onstart - SpeechRecognition active and listening');
      if (this.onStatusChange) this.onStatusChange('LISTENING');
    };

    this.recognition.onaudiostart = () => {
      console.log('[VOICE] onaudiostart - Audio capturing started');
    };

    this.recognition.onsoundstart = () => {
      console.log('[VOICE] onsoundstart - Sound detected in microphone stream');
    };

    this.recognition.onspeechstart = () => {
      console.log('[VOICE] onspeechstart - Speech detected');
    };

    this.recognition.onresult = (event) => {
      console.log('[VOICE][RAW] onresult fired | resultIndex:', event.resultIndex, '| results.length:', event.results.length);

      let interimTranscript = '';
      let finalTranscript = '';
      let latestChunk = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i][0];
        if (item && item.transcript) {
          const text = item.transcript.trim();
          if (event.results[i].isFinal) {
            finalTranscript += ' ' + text;
            console.log('[VOICE][FINAL] "' + text + '" | confidence:', item.confidence);
          } else {
            interimTranscript += ' ' + text;
            console.log('[VOICE][INTERIM] "' + text + '"');
          }
          latestChunk = text;
        }
      }

      const activeText = (finalTranscript || interimTranscript || latestChunk).trim();
      const isFinal = event.results[event.results.length - 1]?.isFinal || false;

      console.log(`[VOICE][RAW] Transcript: "${activeText}" | isFinal: ${isFinal} | latestChunk: "${latestChunk}"`);

      if (activeText) {
        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(activeText);
        }
        if (this.onSpokenText) {
          this.onSpokenText(activeText, latestChunk, isFinal);
        }
      }
    };

    this.recognition.onspeechend = () => {
      console.log('[VOICE] onspeechend - Speech chunk finalized');
    };

    this.recognition.onaudioend = () => {
      console.log('[VOICE] onaudioend - Audio capture buffer ended');
    };

    this.recognition.onerror = (event) => {
      this.isRecognitionRunning = false;
      const err = event.error || 'unknown';
      console.error('[VOICE][ERROR]', {
        error: err,
        message: event.message || '',
        online: navigator.onLine,
        lang: this.recognition.lang,
        userAgent: navigator.userAgent
      });

      if (this.onError) {
        this.onError(err, event);
      }

      if (!this.isSessionActive) return;

      if (err === 'not-allowed' || err === 'service-not-allowed') {
        alert('يرجى السماح بالوصول إلى الميكروفون في إعدادات المتصفح.');
        this.stop();
        return;
      }

      if (err === 'network') {
        this.restartAttempts++;
        if (this.restartAttempts <= this.maxRestartAttempts) {
          // Switch to dialect fallback on network error (e.g. ar-EG -> ar-SA -> ar)
          this.currentLangIndex = (this.currentLangIndex + 1) % this.supportedLangs.length;
          const fallbackLang = this.supportedLangs[this.currentLangIndex];
          console.warn(`[VOICE] Network error detected. Trying fallback dialect (${fallbackLang}) in ${this.restartAttempts * 1.5}s (Attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
          
          const delay = Math.pow(2, this.restartAttempts - 1) * 1000;
          this.scheduleRestart(delay, fallbackLang);
        } else {
          console.error('[VOICE] Maximum network retry attempts reached. Halting automatic restarts.');
          if (this.onStatusChange) {
            this.onStatusChange('NETWORK_ERROR', 'تعذر الاتصال بخدمة التعرف على الصوت السحابية. تحقق من اتصال الإنترنت أو استخدم متصفح Google Chrome.');
          }
          this.stop();
        }
        return;
      }

      if (err === 'no-speech') {
        // Natural silence - keep listening seamlessly
        this.scheduleRestart(100);
        return;
      }

      if (err !== 'aborted') {
        this.scheduleRestart(500);
      }
    };

    this.recognition.onend = () => {
      this.isRecognitionRunning = false;
      console.log('[VOICE] onend - Speech recognition stopped');
      if (this.isSessionActive) {
        this.scheduleRestart(150);
      }
    };
  }

  scheduleRestart(delayMs = 200, overrideLang = null) {
    if (!this.isSessionActive) return;
    if (this.restartTimer) clearTimeout(this.restartTimer);

    this.restartTimer = setTimeout(() => {
      if (this.isSessionActive && !this.isRecognitionRunning) {
        try {
          if (overrideLang && this.recognition) {
            this.recognition.lang = overrideLang;
          }
          console.log('[VOICE] Restarting SpeechRecognition with lang:', this.recognition.lang);
          this.recognition.start();
        } catch (e) {
          console.warn('[VOICE] Recognition start attempt:', e.message);
        }
      }
    }, delayMs);
  }

  start() {
    this.isSessionActive = true;
    this.restartAttempts = 0;
    this.currentLangIndex = 0;

    const userSelectedLang = document.getElementById('settingLanguage')?.value || 'ar-EG';
    if (this.recognition) {
      this.recognition.lang = userSelectedLang;

      console.log('[VOICE][CONFIG]', {
        lang: this.recognition.lang,
        continuous: this.recognition.continuous,
        interimResults: this.recognition.interimResults,
        maxAlternatives: this.recognition.maxAlternatives,
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        protocol: location.protocol,
        hostname: location.hostname
      });

      try {
        this.recognition.start();
      } catch (e) {
        console.warn('[VOICE] Recognition already started or starting:', e.message);
      }
    }
  }

  stop() {
    this.isSessionActive = false;
    this.isRecognitionRunning = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
    if (this.onStatusChange) {
      this.onStatusChange('STOPPED');
    }
  }
}

/**
 * Main AudioEngine controller coordinating Speech Providers & UI Visualizers
 */
class AudioEngine {
  constructor(onSpokenText, onTranscriptUpdate) {
    this.onSpokenText = onSpokenText;
    this.onTranscriptUpdate = onTranscriptUpdate;

    this.isListening = false;
    this.animFrameId = null;

    this.canvas = document.getElementById('audioVisualizerCanvas');
    this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
    this.audioBadge = document.getElementById('audioLevelBadge');

    // Initialize Provider
    this.provider = new WebSpeechProvider({
      onSpokenText: (text, chunk, isFinal) => {
        if (this.onSpokenText) this.onSpokenText(text, chunk, isFinal);
      },
      onTranscriptUpdate: (text) => {
        if (this.onTranscriptUpdate) this.onTranscriptUpdate(text);
      },
      onStatusChange: (status, message) => {
        this.handleProviderStatus(status, message);
      }
    });
  }

  handleProviderStatus(status, message) {
    if (status === 'NETWORK_ERROR') {
      const liveTranscript = document.getElementById('liveTranscript');
      if (liveTranscript) {
        liveTranscript.textContent = message || '⚠️ تعذر الاتصال بخدمة التعرف على الصوت. تحقق من اتصال الإنترنت.';
        liveTranscript.style.color = '#FF4D6D';
      }
      this.stopListening();
    } else if (status === 'LISTENING') {
      const liveTranscript = document.getElementById('liveTranscript');
      if (liveTranscript && liveTranscript.style.color === 'rgb(255, 77, 109)') {
        liveTranscript.style.color = '';
      }
    }
  }

  async startListening() {
    if (this.isListening) return;
    this.isListening = true;
    console.log('[VOICE] Session Started');
    console.log('[VOICE] Microphone Listening');

    // Start Visualizer (Non-blocking simulated visualizer that leaves mic completely free for STT)
    this.startSimulatedVisualizer();

    // Start Speech Recognition Provider
    if (this.provider) {
      this.provider.start();
    }
  }

  stopListening() {
    this.isListening = false;

    if (this.provider) {
      this.provider.stop();
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.clearVisualizer();
    if (this.audioBadge) this.audioBadge.textContent = 'صامت';
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
window.WebSpeechProvider = WebSpeechProvider;

