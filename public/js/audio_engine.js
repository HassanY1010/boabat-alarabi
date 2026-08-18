/**
 * Boabat Al-Arabi - Real-Time Audio Engine, Visualizer & Speech Recognizer
 */

class AudioEngine {
  constructor(onPlateDetected, onTranscriptUpdate) {
    this.onPlateDetected = onPlateDetected;
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
      console.warn('Web Speech API is not supported in this browser. Fallback mode enabled.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = document.getElementById('settingLanguage')?.value || 'ar-EG';
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event) => {
      let currentPhrase = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i][0];
        if (item && item.transcript) {
          currentPhrase += ' ' + item.transcript.trim();
        }
      }

      currentPhrase = currentPhrase.trim();
      if (currentPhrase) {
        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(currentPhrase);
        }

        // Parse plate candidates directly from the spoken phrase
        const candidates = window.clientPlateParser.parsePlateTranscript(currentPhrase);
        if (candidates.length > 0 && this.onPlateDetected) {
          candidates.forEach(c => this.onPlateDetected(c, currentPhrase));
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (this.isListening && event.error === 'no-speech') {
        // Just keep listening
        return;
      }
      if (this.isListening && event.error !== 'aborted') {
        setTimeout(() => {
          if (this.isListening) {
            try { this.recognition.start(); } catch (e) {}
          }
        }, 400);
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        setTimeout(() => {
          if (this.isListening) {
            try { this.recognition.start(); } catch (err) {}
          }
        }, 200);
      }
    };
  }

  async startListening() {
    if (this.isListening) return;
    this.isListening = true;

    // Start Web Speech API with selected language
    if (this.recognition) {
      this.recognition.lang = document.getElementById('settingLanguage')?.value || 'ar-EG';
      try {
        this.recognition.start();
      } catch (e) {
        console.warn('Recognition start exception:', e);
      }
    }

    // Start Simulated Visualizer without locking mic hardware
    this.startSimulatedVisualizer();
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

    // Update level badge
    if (this.audioBadge) {
      if (avg > 70) this.audioBadge.textContent = 'قوي 99%';
      else if (avg > 30) this.audioBadge.textContent = 'متوسط';
      else if (avg > 5) this.audioBadge.textContent = 'هادئ';
      else this.audioBadge.textContent = 'صامت';
    }

    // Draw bars
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
