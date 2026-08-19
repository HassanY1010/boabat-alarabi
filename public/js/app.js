/**
 * Boabat Al-Arabi - Main Application Controller
 */

class AppController {
  constructor() {
    this.audioEngine = null;
    this.currentSession = null;
    this.sessionScans = [];
    this.wantedScans = [];
    this.lastProcessedPlates = new Map(); // canonical -> timestamp
    this.currentGps = null;
    this.ws = null;

    this.initElements();
    this.initEvents();
    this.initGps();
    this.initWebSocket();
    this.loadInitialData();
  }

  initElements() {
    // Buttons & Views
    this.voiceToggleBtn = document.getElementById('voiceToggleBtn');
    this.voiceBtnLabel = document.getElementById('voiceBtnLabel');
    this.listeningIndicator = document.getElementById('listeningIndicator');
    this.liveTranscript = document.getElementById('liveTranscript');
    this.scanResultsList = document.getElementById('scanResultsList');
    this.emptyScanState = document.getElementById('emptyScanState');

    // Stats
    this.statTotalScans = document.getElementById('statTotalScans');
    this.statWantedScans = document.getElementById('statWantedScans');
    this.statClearedScans = document.getElementById('statClearedScans');
    this.activeDatasetLabel = document.getElementById('activeDatasetLabel');
    this.wantedCountBadge = document.getElementById('wantedCountBadge');
    this.navWantedBadge = document.getElementById('navWantedBadge');

    // Tabs & Navigation
    this.navItems = document.querySelectorAll('.bottom-nav .nav-item');
    this.screens = document.querySelectorAll('.screen-view');
    this.subtabBtns = document.querySelectorAll('.subtab-btn');
    this.subtabContents = document.querySelectorAll('.subtab-content');

    // Lists & Containers
    this.wantedCardsList = document.getElementById('wantedCardsList');
    this.wantedSearchInput = document.getElementById('wantedSearchInput');
    this.sessionsList = document.getElementById('sessionsList');
    this.activeDatasetCard = document.getElementById('activeDatasetCard');
    this.datasetsHistoryList = document.getElementById('datasetsHistoryList');

    // Detail Drawer
    this.scanDetailModal = document.getElementById('scanDetailModal');
    this.drawerTitle = document.getElementById('drawerTitle');
    this.drawerBody = document.getElementById('drawerBody');
    this.closeDrawerBtn = document.getElementById('closeDrawerBtn');

    // Excel & Actions
    this.excelFileInput = document.getElementById('excelFileInput');
    this.exportAllExcelBtn = document.getElementById('exportAllExcelBtn');
    this.newSessionBtn = document.getElementById('newSessionBtn');
    this.runBenchmarkBtn = document.getElementById('runBenchmarkBtn');
  }

  initEvents() {
    // Navigation Tabs
    this.navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        this.switchScreen(targetId);
        this.navItems.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Subtabs
    this.subtabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.subtab;
        this.subtabBtns.forEach(b => b.classList.remove('active'));
        this.subtabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetTab)?.classList.add('active');
      });
    });

    // Main Voice Toggle Button
    this.voiceToggleBtn.addEventListener('click', () => this.toggleVoiceSession());

    // Preset Speech Chips
    document.querySelectorAll('.preset-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        const phrase = chip.dataset.phrase;
        this.processSpokenText(phrase);
      });
    });

    // Wanted Search Input
    if (this.wantedSearchInput) {
      this.wantedSearchInput.addEventListener('input', (e) => {
        this.filterWantedCards(e.target.value);
      });
    }

    // Detail Drawer Close
    if (this.closeDrawerBtn) {
      this.closeDrawerBtn.addEventListener('click', () => {
        this.scanDetailModal.style.display = 'none';
      });
    }
    if (this.scanDetailModal) {
      this.scanDetailModal.addEventListener('click', (e) => {
        if (e.target === this.scanDetailModal) this.scanDetailModal.style.display = 'none';
      });
    }

    // Excel File Upload
    if (this.excelFileInput) {
      this.excelFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.uploadExcelDataset(file);
      });
    }

    // Export All Scans to Excel
    if (this.exportAllExcelBtn) {
      this.exportAllExcelBtn.addEventListener('click', () => {
        window.location.href = '/api/v1/export/all';
      });
    }

    // Start New Session
    if (this.newSessionBtn) {
      this.newSessionBtn.addEventListener('click', () => this.startNewSession());
    }

    // Export Current Session Scans Directly to Excel
    const saveCurrentBtn = document.getElementById('saveCurrentSessionBtn');
    if (saveCurrentBtn) {
      saveCurrentBtn.addEventListener('click', () => {
        if (this.sessionScans.length === 0) {
          alert('لا توجد بيانات فحوصات حالية لحفظها وتصديرها!');
          return;
        }
        const sessionId = this.currentSession ? this.currentSession.id : '';
        if (sessionId) {
          window.location.href = `/api/v1/export/session/${sessionId}`;
        } else {
          window.location.href = '/api/v1/export/all';
        }
      });
    }

    // Clear Scan Table for New Run
    const clearTableBtn = document.getElementById('clearScanTableBtn');
    if (clearTableBtn) {
      clearTableBtn.addEventListener('click', () => {
        if (this.sessionScans.length === 0) return;
        if (confirm('هل تريد تفريغ الجدول لبدء جولة فحص جديدة؟ (ستبقى البيانات محفوظة في قاعدة البيانات والجلسات)')) {
          this.sessionScans = [];
          this.wantedScans = [];
          this.updateStatsUI();
          this.renderScanTable();
        }
      });
    }

    // Run Benchmark Tester
    if (this.runBenchmarkBtn) {
      this.runBenchmarkBtn.addEventListener('click', () => this.runBenchmark());
    }

    // Initialize Audio Engine with unified processSpokenText pipeline
    this.audioEngine = new window.AudioEngine(
      (activeText, latestChunk, isFinal) => this.processSpokenText(activeText, latestChunk),
      (transcript) => this.updateLiveTranscript(transcript)
    );
  }

  switchScreen(screenId) {
    this.screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');

    if (screenId === 'wantedScreen') {
      this.renderWantedCards();
    } else if (screenId === 'allScreen') {
      this.loadSessions();
      this.loadDatasets();
    }
  }

  initGps() {
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => {
          this.currentGps = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy)
          };
          const gpsText = document.getElementById('gpsStatusText');
          if (gpsText) gpsText.textContent = `GPS (±${this.currentGps.accuracy}m)`;
        },
        (err) => {
          console.warn('GPS error / unavailable:', err.message);
          // Fallback default coordinates (Riyadh, Saudi Arabia)
          this.currentGps = { latitude: 24.7136, longitude: 46.6753, accuracy: 10 };
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    } else {
      this.currentGps = { latitude: 24.7136, longitude: 46.6753, accuracy: 10 };
    }
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        document.getElementById('connectionBadge')?.classList.remove('offline');
        document.getElementById('connectionBadge')?.classList.add('online');
      };
      this.ws.onclose = () => {
        document.getElementById('connectionBadge')?.classList.remove('online');
        document.getElementById('connectionBadge')?.classList.add('offline');
        setTimeout(() => this.initWebSocket(), 3000);
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleWebSocketMessage(msg);
        } catch (e) {}
      };
    } catch (e) {
      console.warn('WebSocket init exception:', e);
    }
  }

  handleWebSocketMessage(msg) {
    if (msg.type === 'CONNECTED') {
      if (msg.payload.activeDataset) {
        this.updateActiveDatasetDisplay(msg.payload.activeDataset);
      }
    } else if (msg.type === 'NEW_SCAN') {
      // If scan came from another operator or background sync (do not duplicate if already present)
      const scan = msg.payload;
      const alreadyExists = this.sessionScans.some(s => s.id === scan.id || s.canonicalPlate === scan.canonicalPlate && Math.abs(new Date(s.capturedAt) - new Date(scan.capturedAt)) < 3000);
      if (!alreadyExists) {
        this.addScanToUI(scan);
      }
    } else if (msg.type === 'DATASET_ACTIVATED') {
      this.updateActiveDatasetDisplay(msg.payload);
      this.loadDatasets();
    }
  }

  async loadInitialData() {
    try {
      const statsRes = await fetch('/api/v1/stats');
      const stats = await statsRes.json();
      if (stats.activeDataset) {
        this.updateActiveDatasetDisplay(stats.activeDataset);
      }
      if (stats.activeSession) {
        this.currentSession = stats.activeSession;
      } else {
        await this.startNewSession();
      }
      this.loadScans();
    } catch (e) {
      console.warn('Error loading initial stats:', e);
    }
  }

  updateActiveDatasetDisplay(dataset) {
    if (this.activeDatasetLabel) {
      this.activeDatasetLabel.textContent = `قاعدة المطلوبين: ${dataset.name} (${dataset.totalRecords.toLocaleString()} سيارة)`;
    }
  }

  async startNewSession() {
    try {
      const res = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'المشغل الميداني' })
      });
      this.currentSession = await res.json();
      this.sessionScans = [];
      this.wantedScans = [];
      this.updateStatsUI();
      this.renderScanTable();
    } catch (e) {
      console.error('Error starting session:', e);
    }
  }

  toggleVoiceSession() {
    if (!this.audioEngine.isListening) {
      // Start
      this.audioEngine.startListening();
      this.voiceToggleBtn.classList.remove('idle');
      this.voiceToggleBtn.classList.add('listening');
      this.voiceBtnLabel.textContent = 'إيقاف الجلسة الصوتية';
      this.listeningIndicator.style.display = 'flex';
      this.liveTranscript.textContent = 'يستمع الآن... تفضل بنطق لوحات السيارات بشكل طبيعي';
    } else {
      // Stop
      this.audioEngine.stopListening();
      this.voiceToggleBtn.classList.remove('listening');
      this.voiceToggleBtn.classList.add('idle');
      this.voiceBtnLabel.textContent = 'بدء الجلسة الصوتية';
      this.listeningIndicator.style.display = 'none';
      this.liveTranscript.textContent = 'تم إيقاف الجلسة الصوتية مؤقتًا';
    }
  }

  updateLiveTranscript(text) {
    if (this.liveTranscript) {
      this.liveTranscript.textContent = text;
    }
  }

  async handlePlateCandidateDetected(candidate, rawTranscript) {
    const now = Date.now();
    const lastSeen = this.lastProcessedPlates.get(candidate.canonicalPlate);

    // Debounce exact same candidate within 2.5 seconds to avoid duplicated stream bursts
    if (lastSeen && (now - lastSeen) < 2500) {
      return;
    }
    this.lastProcessedPlates.set(candidate.canonicalPlate, now);

    const lettersArray = (candidate.letters || '').split(/\s+/).filter(Boolean);
    const digitsArray = (candidate.digitsList && candidate.digitsList.length) ? candidate.digitsList : (candidate.numbers || '').toString().split('').filter(ch => /\d/.test(ch));

    console.log('[VOICE] Parsed Letters:', lettersArray);
    console.log('[VOICE] Parsed Digits:', digitsArray);
    console.log('[VOICE] Plate Created:', candidate.canonicalPlate);

    const tempScanId = 'scan-temp-' + now;
    // 1. Optimistic Instant UI Insert (Zero Latency)
    const instantScan = {
      id: tempScanId,
      sessionId: this.currentSession ? this.currentSession.id : null,
      letters: candidate.letters,
      numbers: candidate.numbers,
      canonicalPlate: candidate.canonicalPlate,
      plateDisplay: candidate.plateDisplay,
      rawTranscript: rawTranscript || candidate.rawTranscript,
      confidence: candidate.confidence || 0.98,
      status: 'VERIFYING',
      wanted: false,
      latitude: this.currentGps ? this.currentGps.latitude : null,
      longitude: this.currentGps ? this.currentGps.longitude : null,
      gpsAccuracy: this.currentGps ? this.currentGps.accuracy : null,
      processingTimeMs: 15,
      capturedAt: new Date().toISOString()
    };
    this.addScanToUI(instantScan);
    console.log('[VOICE] Table Record Created');
    console.log('[VOICE] Wanted Check Started:', candidate.canonicalPlate);

    // 2. Perform Verification with Backend in Background
    const scanPayload = {
      sessionId: this.currentSession ? this.currentSession.id : null,
      letters: candidate.letters,
      numbers: candidate.numbers,
      canonicalPlate: candidate.canonicalPlate,
      plateDisplay: candidate.plateDisplay,
      rawTranscript: rawTranscript || candidate.rawTranscript,
      confidence: candidate.confidence || 0.98,
      latitude: this.currentGps ? this.currentGps.latitude : null,
      longitude: this.currentGps ? this.currentGps.longitude : null,
      gpsAccuracy: this.currentGps ? this.currentGps.accuracy : null,
      processingTimeMs: 40
    };

    try {
      const res = await fetch('/api/v1/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanPayload)
      });
      const recorded = await res.json();
      
      console.log('[VOICE] Wanted Check Result:', recorded.wanted ? 'FOUND' : 'NOT_FOUND');

      // Update the optimistic item in place
      const idx = this.sessionScans.findIndex(s => s.id === tempScanId);
      if (idx !== -1) {
        this.sessionScans[idx] = recorded;
        if (recorded.wanted) {
          this.wantedScans.unshift(recorded);
          window.alertSystem.triggerWantedAlert(recorded);
        }
        this.updateStatsUI();
        this.renderScanTable();
        console.log('[VOICE] Table Row Updated');
        console.log('[VOICE] Final Status:', recorded.wanted ? 'WANTED' : 'SAFE');
      }
    } catch (err) {
      console.warn('Network error saving scan, confirmed offline:', err);
    }
  }

  processSpokenText(phrase, chunk = null) {
    if (!phrase) return;
    this.updateLiveTranscript(phrase);

    // 1. Parse active accumulated phrase
    let candidates = window.clientPlateParser.parsePlateTranscript(phrase);

    // 2. Fallback: Parse latest chunk if phrase had prior noise
    if (candidates.length === 0 && chunk && chunk !== phrase) {
      candidates = window.clientPlateParser.parsePlateTranscript(chunk);
    }

    if (candidates.length > 0) {
      candidates.forEach(c => this.handlePlateCandidateDetected(c, phrase));
    }
  }

  addScanToUI(scan) {
    // Avoid UI duplicates
    if (this.sessionScans.find(s => s.id === scan.id)) return;

    this.sessionScans.unshift(scan);
    if (scan.wanted) {
      this.wantedScans.unshift(scan);
      window.alertSystem.triggerWantedAlert(scan);
    }

    this.updateStatsUI();
    this.renderScanTable();
  }

  updateStatsUI() {
    const total = this.sessionScans.length;
    const wanted = this.sessionScans.filter(s => s.wanted).length;
    const cleared = total - wanted;

    if (this.statTotalScans) this.statTotalScans.textContent = total;
    if (this.statWantedScans) this.statWantedScans.textContent = wanted;
    if (this.statClearedScans) this.statClearedScans.textContent = cleared;

    if (this.wantedCountBadge) this.wantedCountBadge.textContent = `${wanted} سيارة`;
    if (this.navWantedBadge) {
      if (wanted > 0) {
        this.navWantedBadge.style.display = 'inline-block';
        this.navWantedBadge.textContent = wanted;
      } else {
        this.navWantedBadge.style.display = 'none';
      }
    }
  }

  renderScanTable() {
    if (!this.scanResultsList) return;

    if (this.sessionScans.length === 0) {
      this.scanResultsList.innerHTML = `
        <div class="empty-state" id="emptyScanState">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
          </svg>
          <p>اضغط على زر الميكروفون لبدء تسجيل لوحات السيارات صوتيًا</p>
          <span class="hint">يتم التعرف والبحث في قاعدة المطلوبين لحظيًا وبشكل مستمر</span>
        </div>
      `;
      return;
    }

    let html = '';
    this.sessionScans.forEach((scan, index) => {
      const rowNum = this.sessionScans.length - index;
      const isWanted = scan.wanted;
      const rowClass = isWanted ? 'table-row wanted-row' : 'table-row';
      let statusIcon = '';
      if (scan.status === 'VERIFYING') {
        statusIcon = `<div class="status-badge-icon verifying" title="جاري التحقق ⏳" style="color:var(--accent-cyan); font-size:0.8rem; display:flex; align-items:center; gap:4px;">⏳ <span style="font-size:0.75rem;">يتم التحقق...</span></div>`;
      } else if (isWanted) {
        statusIcon = `<div class="status-badge-icon wanted" title="مطلوبة ⚠️" style="display:flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg> <span>مطلوبة</span></div>`;
      } else {
        statusIcon = `<div class="status-badge-icon cleared" title="سليمة ✔" style="display:flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg> <span>سليمة</span></div>`;
      }

      // Format separate discrete slots (e.g. د | ا | د and 2 | 5 | 2 | 4)
      const lettersFormatted = (scan.letters || '').split(/\s+/).filter(Boolean).join(' | ') || '-';
      const digitsFormatted = (scan.numbers || '').toString().split('').filter(ch => /\d/.test(ch)).join(' | ') || '-';

      html += `
        <div class="${rowClass}" onclick="app.showScanDetails('${scan.id}')">
          <span class="row-num">${rowNum}</span>
          <span class="row-letters">${lettersFormatted}</span>
          <span class="row-digits">${digitsFormatted}</span>
          <div class="status-icon-cell">${statusIcon}</div>
        </div>
      `;
    });

    this.scanResultsList.innerHTML = html;
  }

  showScanDetails(scanId) {
    const scan = this.sessionScans.find(s => s.id === scanId) || this.wantedScans.find(s => s.id === scanId);
    if (!scan) return;

    this.drawerTitle.textContent = `تفاصيل اللوحة: ${scan.plateDisplay}`;
    const v = scan.matchedVehicle || {};
    const gpsLink = scan.latitude ? `<a href="https://maps.google.com/?q=${scan.latitude},${scan.longitude}" target="_blank" style="color:var(--accent-cyan);">${scan.latitude.toFixed(4)}, ${scan.longitude.toFixed(4)} (فتح الخريطة)</a>` : 'غير متوفر';

    this.drawerBody.innerHTML = `
      <div class="wanted-details-grid" style="background:none;">
        <div class="detail-row">
          <span class="detail-label">رقم اللوحة:</span>
          <span class="detail-value" style="font-size:1.1rem; color:var(--accent-cyan);">${scan.plateDisplay}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">حالة السيارة:</span>
          <span class="detail-value" style="color:${scan.wanted ? 'var(--accent-wanted)' : 'var(--accent-cleared)'}">${scan.wanted ? 'مطلوبة ⚠️' : 'سليمة ✔'}</span>
        </div>
        ${scan.wanted ? `
        <div class="detail-row">
          <span class="detail-label">نوع السيارة:</span>
          <span class="detail-value">${v.vehicleType || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">الجهة / البنك:</span>
          <span class="detail-value">${v.bank || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">رقم الهيكل:</span>
          <span class="detail-value">${v.vin || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">المصدر في Excel:</span>
          <span class="detail-value">${v.sheetName || 'تشييك'} (الصف ${v.rowNumber || '-'})</span>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">موقع GPS:</span>
          <span class="detail-value">${gpsLink}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">وقت الرصد:</span>
          <span class="detail-value">${new Date(scan.capturedAt).toLocaleTimeString('ar-EG')}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">النص الصوتي الخام:</span>
          <span class="detail-value" style="font-size:0.8rem; color:var(--text-secondary);">${scan.rawTranscript || '-'}</span>
        </div>
      </div>
    `;

    this.scanDetailModal.style.display = 'flex';
  }

  renderWantedCards() {
    if (!this.wantedCardsList) return;
    const wantedList = this.wantedScans;

    if (wantedList.length === 0) {
      this.wantedCardsList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <p>لا توجد تنبيهات لسيارات مطلوبة في هذه الجلسة حتى الآن</p>
        </div>
      `;
      return;
    }

    let html = '';
    wantedList.forEach(w => {
      const v = w.matchedVehicle || {};
      html += `
        <div class="wanted-card" onclick="app.showScanDetails('${w.id}')">
          <div class="wanted-card-header">
            <span class="wanted-plate-tag">${w.plateDisplay}</span>
            <span class="wanted-time-tag">${new Date(w.capturedAt).toLocaleTimeString('ar-EG')}</span>
          </div>
          <div class="wanted-card-body">
            <div class="wanted-info-item">
              <span class="info-label">النوع</span>
              <span class="info-val">${v.vehicleType || 'غير محدد'}</span>
            </div>
            <div class="wanted-info-item">
              <span class="info-label">الجهة / البنك</span>
              <span class="info-val">${v.bank || 'غير محدد'}</span>
            </div>
            <div class="wanted-info-item">
              <span class="info-label">الهيكل (VIN)</span>
              <span class="info-val">${v.vin || '-'}</span>
            </div>
            <div class="wanted-info-item">
              <span class="info-label">المصدر</span>
              <span class="info-val">${v.sheetName || 'Excel'}</span>
            </div>
          </div>
        </div>
      `;
    });

    this.wantedCardsList.innerHTML = html;
  }

  filterWantedCards(query) {
    if (!query) {
      this.renderWantedCards();
      return;
    }
    const cleanQ = query.trim().toLowerCase();
    const filtered = this.wantedScans.filter(w => {
      const v = w.matchedVehicle || {};
      return (
        w.plateDisplay.includes(cleanQ) ||
        w.canonicalPlate.includes(cleanQ) ||
        (v.vehicleType && v.vehicleType.toLowerCase().includes(cleanQ)) ||
        (v.bank && v.bank.toLowerCase().includes(cleanQ)) ||
        (v.vin && v.vin.toLowerCase().includes(cleanQ))
      );
    });

    if (filtered.length === 0) {
      this.wantedCardsList.innerHTML = `<div class="empty-state"><p>لا توجد نتائج مطابقة لبحثك</p></div>`;
      return;
    }

    let html = '';
    filtered.forEach(w => {
      const v = w.matchedVehicle || {};
      html += `
        <div class="wanted-card" onclick="app.showScanDetails('${w.id}')">
          <div class="wanted-card-header">
            <span class="wanted-plate-tag">${w.plateDisplay}</span>
            <span class="wanted-time-tag">${new Date(w.capturedAt).toLocaleTimeString('ar-EG')}</span>
          </div>
          <div class="wanted-card-body">
            <div class="wanted-info-item">
              <span class="info-label">النوع</span>
              <span class="info-val">${v.vehicleType || 'غير محدد'}</span>
            </div>
            <div class="wanted-info-item">
              <span class="info-label">الجهة / البنك</span>
              <span class="info-val">${v.bank || 'غير محدد'}</span>
            </div>
          </div>
        </div>
      `;
    });
    this.wantedCardsList.innerHTML = html;
  }

  async loadSessions() {
    try {
      const res = await fetch('/api/v1/sessions');
      const data = await res.json();
      const list = data.sessions || [];

      if (this.sessionsList) {
        if (list.length === 0) {
          this.sessionsList.innerHTML = `<div class="empty-state"><p>لا توجد جلسات مسجلة</p></div>`;
          return;
        }
        let html = '';
        list.forEach(ses => {
          html += `
            <div class="stat-pill" style="align-items:stretch; text-align:right; gap:8px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:var(--text-primary);">${ses.name}</span>
                <span class="bench-badge ${ses.status === 'ACTIVE' ? 'pass' : ''}">${ses.status === 'ACTIVE' ? 'نشطة الآن' : 'مكتملة'}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-secondary);">
                <span>الفحوصات: ${ses.totalScans}</span>
                <span style="color:var(--accent-wanted)">مطلوبة: ${ses.wantedCount}</span>
                <span style="color:var(--accent-cleared)">سليمة: ${ses.clearedCount}</span>
              </div>
              <div style="display:flex; gap:8px; margin-top:4px;">
                <a href="/api/v1/export/session/${ses.id}" class="action-btn secondary" style="padding:6px; font-size:0.75rem; text-decoration:none;">تصدير Excel (.xlsx)</a>
              </div>
            </div>
          `;
        });
        this.sessionsList.innerHTML = html;
      }
    } catch (e) {
      console.warn('Error loading sessions:', e);
    }
  }

  async loadDatasets() {
    try {
      const res = await fetch('/api/v1/datasets');
      const data = await res.json();
      const activeId = data.activeDatasetId;
      const list = data.datasets || [];

      const activeDs = list.find(d => d.id === activeId) || list[0];
      if (activeDs && this.activeDatasetCard) {
        this.activeDatasetCard.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-weight:800; font-size:1.05rem; color:var(--accent-cyan);">⭐ القائمة المفعلة حاليًا</span>
            <span class="bench-badge pass">نشطة ACTIVE</span>
          </div>
          <h4 style="font-size:1.1rem; margin-bottom:4px;">${activeDs.name}</h4>
          <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">الملف: ${activeDs.filename} | تم التفعيل: ${new Date(activeDs.uploadedAt).toLocaleString('ar-EG')}</p>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; text-align:center;">
            <div class="stat-pill">
              <span class="stat-num">${activeDs.totalRecords.toLocaleString()}</span>
              <span class="stat-title">إجمالي المطلوبين</span>
            </div>
            <div class="stat-pill">
              <span class="stat-num">${activeDs.totalSheets}</span>
              <span class="stat-title">عدد الـ Sheets</span>
            </div>
            <div class="stat-pill">
              <span class="stat-num">${activeDs.duplicateCount || 0}</span>
              <span class="stat-title">المكررات</span>
            </div>
          </div>
        `;
      }

      if (this.datasetsHistoryList) {
        let historyHtml = '';
        list.forEach(ds => {
          const isActive = ds.id === activeId;
          historyHtml += `
            <div class="stat-pill" style="align-items:stretch; text-align:right; gap:8px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700;">${ds.name} (V${ds.version})</span>
                ${isActive ? '<span class="bench-badge pass">نشطة</span>' : `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.74rem;" onclick="app.activateDataset('${ds.id}')">تفعيل</button>`}
              </div>
              <span style="font-size:0.75rem; color:var(--text-secondary);">${ds.totalRecords.toLocaleString()} سيارة | ${new Date(ds.uploadedAt).toLocaleDateString('ar-EG')}</span>
            </div>
          `;
        });
        this.datasetsHistoryList.innerHTML = historyHtml;
      }
    } catch (e) {
      console.warn('Error loading datasets:', e);
    }
  }

  async activateDataset(datasetId) {
    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/activate`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.loadDatasets();
        alert('تم تفعيل قائمة المطلوبين بنجاح!');
      }
    } catch (e) {
      alert('خطأ في تفعيل القائمة');
    }
  }

  async uploadExcelDataset(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name);
    formData.append('activateImmediately', 'true');

    try {
      this.activeDatasetCard.innerHTML = `<p style="text-align:center; padding:20px;">جاري تحليل ملف Excel واستخراج اللوحات وتفعيل القائمة...</p>`;
      const res = await fetch('/api/v1/datasets/import', {
        method: 'POST',
        body: formData
      });
      const dataset = await res.json();
      if (res.ok) {
        alert(`تم استيراد ${dataset.totalRecords} سيارة بنجاح وتفعيل القائمة!`);
        this.loadDatasets();
      } else {
        alert('فشل استيراد الملف: ' + (dataset.error || ''));
      }
    } catch (e) {
      alert('خطأ في رفع الملف: ' + e.message);
    }
  }

  async runBenchmark() {
    const resultsArea = document.getElementById('benchmarkResultsArea');
    const btn = this.runBenchmarkBtn;
    btn.disabled = true;
    btn.innerHTML = `<span>جاري تشغيل الاختبار...</span>`;

    try {
      const res = await fetch('/api/v1/benchmark/run', { method: 'POST' });
      const data = await res.json();

      document.getElementById('benchAccuracy').textContent = data.accuracy;
      document.getElementById('benchLatency').textContent = data.avgLatencyMs;
      document.getElementById('benchPassed').textContent = `${data.passed}/${data.totalTests}`;

      const tbody = document.getElementById('benchTableBody');
      let rowsHtml = '';
      data.results.forEach(r => {
        rowsHtml += `
          <tr>
            <td>${r.index}</td>
            <td>${r.input}</td>
            <td style="font-weight:700; color:var(--text-primary);">${r.expected}</td>
            <td style="font-weight:700; color:var(--accent-cyan);">${r.actual}</td>
            <td>${r.latencyMs}ms</td>
            <td><span class="bench-badge ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'نجاح ✔' : 'خطأ ✘'}</span></td>
          </tr>
        `;
      });
      tbody.innerHTML = rowsHtml;
      resultsArea.style.display = 'block';
    } catch (e) {
      alert('خطأ في تشغيل الاختبار: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>إعادة تشغيل الاختبار</span>`;
    }
  }

  async loadScans() {
    try {
      const res = await fetch('/api/v1/scans?limit=50');
      const data = await res.json();
      if (data.scans) {
        this.sessionScans = data.scans;
        this.wantedScans = data.scans.filter(s => s.wanted);
        this.updateStatsUI();
        this.renderScanTable();
      }
    } catch (e) {}
  }
}

// Global App instance
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
