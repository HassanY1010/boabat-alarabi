/**
 * Boabat Al-Arabi - Real-Time Audio Engine, Real Mic Visualizer & Speech Recognizer
 */

class AudioEngine {
  constructor(onSpokenText, onTranscriptUpdate) {
    this.onSpokenText = onSpokenText; // Called directly with recognized speech
    this.onTranscriptUpdate = onTranscriptUpdate;

    this.isListening = false;
    this.recognition = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.animFrameId = null;

    this.canvas = document.getElementById('audioVisualizerCanvas');
    this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
    this.audioBadge = document.getElementById('audioLevelBadge');

    this.initSpeechRecognition();
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[VOICE] Web Speech API is not supported in this browser.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = document.getElementById('settingLanguage')?.value || 'ar-EG';
    this.recognition.maxAlternatives = 3;

    this.recognition.onstart = () => {
      console.log('[VOICE] onstart - SpeechRecognition active and listening');
    };

    this.recognition.onaudiostart = () => {
      console.log('[VOICE] onaudiostart - Audio capturing started');
    };

    this.recognition.onsoundstart = () => {
      console.log('[VOICE] onsoundstart - Sound detected by microphone');
    };

    this.recognition.onspeechstart = () => {
      console.log('[VOICE] onspeechstart - Speech detected');
    };

    this.recognition.onresult = (event) => {
      console.log('[VOICE][RAW] onresult fired | resultIndex:', event.resultIndex, '| results.length:', event.results.length);

      let interimTranscript = '';
      let finalTranscript = '';
      let latestChunk = '';

      for (let i = 0; i < event.results.length; ++i) {
        const item = event.results[i][0];
        if (item && item.transcript) {
          const text = item.transcript.trim();
          if (event.results[i].isFinal) {
            finalTranscript += ' ' + text;
          } else {
            interimTranscript += ' ' + text;
          }
          if (i >= event.resultIndex) {
            latestChunk = text;
          }
        }
      }

      const activeText = (finalTranscript + ' ' + interimTranscript).trim();
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
      console.log('[VOICE] onspeechend - Speech chunk finished');
    };

    this.recognition.onaudioend = () => {
      console.log('[VOICE] onaudioend - Audio capture cycle ended');
    };

    this.recognition.onerror = (event) => {
      console.error('[VOICE][ERROR]', event.error, event.message || '');
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        alert('يرجى السماح بالوصول إلى الميكروفون في المتصفح لبدء الاستماع الصوتي.');
      }
      if (this.isListening && event.error !== 'aborted' && event.error !== 'not-allowed') {
        setTimeout(() => {
          if (this.isListening) {
            try { this.recognition.start(); } catch (e) {}
          }
        }, 300);
      }
    };

    this.recognition.onend = () => {
      console.log('[VOICE] onend - Speech recognition stopped');
      if (this.isListening) {
        setTimeout(() => {
          if (this.isListening) {
            try { this.recognition.start(); } catch (err) {}
          }
        }, 150);
      }
    };
  }

  async startListening() {
    if (this.isListening) return;
    this.isListening = true;
    console.log('[VOICE] Session Started');
    console.log('[VOICE] Microphone Listening');

    // 1. Request real microphone hardware stream
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioContext = new AudioContextClass();
          const source = this.audioContext.createMediaStreamSource(this.mediaStream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
          source.connect(this.analyser);
          this.drawVisualizer();
        }
      }
    } catch (err) {
      console.warn('[VOICE] Could not access real microphone stream for visualizer:', err);
      this.startSimulatedVisualizer();
    }

    // 2. Start Web Speech API with selected language
    if (this.recognition) {
      this.recognition.lang = document.getElementById('settingLanguage')?.value || 'ar-EG';
      try {
        this.recognition.start();
      } catch (e) {
        console.warn('[VOICE] Recognition start error (might already be running):', e);
      }
    }
  }

  stopListening() {
    this.isListening = false;

    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.clearVisualizer();
    if (this.audioBadge) this.audioBadge.textContent = 'صامت';
  }

  drawVisualizer() {
    if (!this.isListening || !this.analyser || !this.canvasCtx) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const avg = sum / bufferLength;

    if (this.audioBadge) {
      if (avg > 50) this.audioBadge.textContent = 'قوي 99%';
      else if (avg > 15) this.audioBadge.textContent = 'متوسط';
      else if (avg > 2) this.audioBadge.textContent = 'هادئ';
      else this.audioBadge.textContent = 'صامت';
    }

    const width = this.canvas.width;
    const height = this.canvas.height;
    this.canvasCtx.clearRect(0, 0, width, height);

    const barCount = 18;
    const barWidth = (width / barCount) - 2;

    for (let i = 0; i < barCount; i++) {
      const val = dataArray[i % bufferLength] || 0;
      const barHeight = Math.max(2, (val / 255) * height);
      const x = i * (barWidth + 2);
      const y = height - barHeight;

      const grad = this.canvasCtx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#26E6C8');
      grad.addColorStop(1, '#16B89E');

      this.canvasCtx.fillStyle = grad;
      this.canvasCtx.fillRect(x, y, barWidth, barHeight);
    }

    this.animFrameId = requestAnimationFrame(() => this.drawVisualizer());
  }

  startSimulatedVisualizer() {
    if (!this.isListening || !this.canvasCtx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    this.canvasCtx.clearRect(0, 0, width, height);

    const barCount = 18;
    const barWidth = (width / barCount) - 2;

    for (let i = 0; i < barCount; i++) {
      const randomVal = Math.sin(Date.now() / 200 + i) * 0.5 + 0.5;
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

