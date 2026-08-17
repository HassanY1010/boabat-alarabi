/**
 * Boabat Al-Arabi - Audio, Haptic & Visual Alert Subsystem
 */

class AlertSystem {
  constructor() {
    this.audioCtx = null;
    this.modal = document.getElementById('wantedAlertModal');
    this.plateBanner = document.getElementById('modalPlateBanner');
    this.vehicleType = document.getElementById('modalVehicleType');
    this.bank = document.getElementById('modalBank');
    this.vin = document.getElementById('modalVin');
    this.sheet = document.getElementById('modalSheet');
    this.gpsLocation = document.getElementById('modalGpsLocation');
    this.openMapBtn = document.getElementById('openMapBtn');
    this.dismissBtn = document.getElementById('dismissAlertBtn');

    this.currentGps = null;
    this.initEvents();
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  initEvents() {
    if (this.dismissBtn) {
      this.dismissBtn.addEventListener('click', () => this.hideAlert());
    }
    if (this.openMapBtn) {
      this.openMapBtn.addEventListener('click', () => {
        if (this.currentGps) {
          window.open(`https://maps.google.com/?q=${this.currentGps.lat},${this.currentGps.lng}`, '_blank');
        }
      });
    }
  }

  playWantedSiren() {
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      // Dual tone siren
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      // Pitch sweep (800Hz to 1600Hz)
      osc.frequency.setValueAtTime(850, now);
      osc.frequency.linearRampToValueAtTime(1400, now + 0.3);
      osc.frequency.linearRampToValueAtTime(850, now + 0.6);
      osc.frequency.linearRampToValueAtTime(1500, now + 0.9);
      osc.frequency.linearRampToValueAtTime(800, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.2);
    } catch (e) {
      console.warn('Audio alert error:', e);
    }
  }

  triggerHaptic() {
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 600]);
    }
  }

  triggerWantedAlert(scanRecord) {
    // 1. Sound Siren
    const soundEnabled = document.getElementById('settingSoundAlert')?.checked ?? true;
    if (soundEnabled) {
      this.playWantedSiren();
    }

    // 2. Haptic
    const hapticEnabled = document.getElementById('settingHapticAlert')?.checked ?? true;
    if (hapticEnabled) {
      this.triggerHaptic();
    }

    // 3. Visual Modal
    this.plateBanner.textContent = scanRecord.plateDisplay;
    const v = scanRecord.matchedVehicle || {};
    this.vehicleType.textContent = v.vehicleType || 'غير محدد';
    this.bank.textContent = v.bank || 'غير محدد';
    this.vin.textContent = v.vin || '-';
    this.sheet.textContent = v.sheetName ? `${v.sheetName} (الصف ${v.rowNumber || '-'})` : 'قاعدة المطلوبين';

    if (scanRecord.latitude && scanRecord.longitude) {
      this.currentGps = { lat: scanRecord.latitude, lng: scanRecord.longitude };
      this.gpsLocation.textContent = `${scanRecord.latitude.toFixed(4)}, ${scanRecord.longitude.toFixed(4)}`;
      this.openMapBtn.style.display = 'inline-block';
    } else {
      this.currentGps = null;
      this.gpsLocation.textContent = 'غير متوفر';
      this.openMapBtn.style.display = 'none';
    }

    this.modal.style.display = 'flex';
  }

  hideAlert() {
    this.modal.style.display = 'none';
  }
}

window.alertSystem = new AlertSystem();
