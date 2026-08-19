/**
 * Boabat Al-Arabi - Main Express Server & WebSocket Hub
 * Configured for Render.com Cloud Deployment & Universal Production Hosting
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { WebSocketServer, WebSocket } = require('ws');

const db = require('./db');
const { parsePlateTranscript, canonicalizePlate, normalizeArabicLetters } = require('./plate_engine');
const { transcribeAudioFile, logSttConfiguration } = require('./stt_engine');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Support Render / Cloud environment port or default to 10000 / 3000
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Enable reverse proxy trust (for Render, Cloudflare, etc.)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Upload configuration for temporary Excel imports
const UPLOADS_DIR = path.join(__dirname, '../data/uploads');
if (!require('fs').existsSync(UPLOADS_DIR)) {
  require('fs').mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Broadcast to connected WebSocket clients
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws, req) => {
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    payload: {
      message: 'Connected to Boabat Al-Arabi cloud gateway',
      activeDataset: db.datasets.find(d => d.id === db.activeDatasetId),
      totalPlatesIndexed: db.wantedPlatesIndex.size
    }
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch (e) {}
  });
});

/* =========================================================
   REST API Endpoints
   ========================================================= */

// 1. Health & Status (Render Health Check probe)
app.get(['/api/v1/health', '/healthz', '/health'], (req, res) => {
  res.json({
    status: 'HEALTHY',
    version: '1.0.0',
    app: 'بوابة العربي - Boabat Al-Arabi',
    serverTime: new Date().toISOString(),
    activeDatasetId: db.activeDatasetId,
    wantedPlatesCount: db.wantedPlatesIndex.size,
    totalScans: db.scans.length,
    activeSessions: db.sessions.filter(s => s.status === 'ACTIVE').length
  });
});

// 2. Overview Statistics
app.get('/api/v1/stats', (req, res) => {
  const activeSession = db.sessions.find(s => s.status === 'ACTIVE') || db.sessions[0];
  const today = new Date().toISOString().split('T')[0];
  const todayScans = db.scans.filter(s => s.capturedAt && s.capturedAt.startsWith(today));

  res.json({
    activeSession,
    totalScans: db.scans.length,
    wantedScans: db.scans.filter(s => s.wanted).length,
    clearedScans: db.scans.filter(s => !s.wanted).length,
    todayScansCount: todayScans.length,
    todayWantedCount: todayScans.filter(s => s.wanted).length,
    activeDataset: db.datasets.find(d => d.id === db.activeDatasetId),
    totalDatasets: db.datasets.length
  });
});

// 3. Plate Parsing Endpoint (Speech to structured plate candidates)
app.post('/api/v1/plates/parse', (req, res) => {
  const { transcript, language } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  const startTime = Date.now();
  const candidates = parsePlateTranscript(transcript);
  const processingTimeMs = Date.now() - startTime;

  const evaluated = candidates.map(c => {
    const check = db.checkWantedPlate(c.canonicalPlate);
    return {
      ...c,
      isWanted: check.isWanted,
      matchedVehicle: check.vehicle || null,
      processingTimeMs
    };
  });

  res.json({
    transcript,
    candidates: evaluated,
    processingTimeMs
  });
});

// 3.1. Speech-to-Text Transcription Endpoint (MediaRecorder / Server-Side Whisper STT)
app.post('/api/v1/speech/transcribe', upload.single('audio'), async (req, res) => {
  console.log('[STT][REQUEST] Incoming speech transcription request');
  if (!req.file) {
    console.warn('[STT][ERROR] No audio file uploaded');
    return res.status(400).json({
      success: false,
      error: 'No audio file uploaded',
      code: 'AUDIO_MISSING'
    });
  }

  const uploadedPath = req.file.path;
  const originalName = req.file.originalname || 'speech.webm';
  const mimeType = req.file.mimetype || 'audio/webm';

  try {
    const result = await transcribeAudioFile(uploadedPath, originalName, mimeType);
    
    // Clean up temporary file
    try { require('fs').unlinkSync(uploadedPath); } catch (e) {}

    console.log('[STT][RESPONSE_STATUS]', result.success ? 200 : (result.statusCode || 500));
    console.log('[STT][RESPONSE_BODY]', result);

    if (result.success) {
      return res.json({
        success: true,
        text: result.text,
        provider: result.provider || 'local-faster-whisper',
        language: result.language || 'ar',
        model: result.model || 'tiny'
      });
    } else {
      const statusCode = result.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        code: result.code || 'STT_TRANSCRIPTION_FAILED'
      });
    }
  } catch (err) {
    // Clean up temporary file
    try { require('fs').unlinkSync(uploadedPath); } catch (e) {}
    
    console.error('[STT][ERROR] Error processing audio:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error during speech transcription',
      code: 'STT_EXCEPTION'
    });
  }
});

// 4. Check Plate Directly
app.post('/api/v1/plates/check', (req, res) => {
  const { plate, letters, numbers } = req.body;
  const plateToTest = plate || `${letters || ''}${numbers || ''}`;
  if (!plateToTest) {
    return res.status(400).json({ error: 'plate or letters/numbers required' });
  }

  const check = db.checkWantedPlate(plateToTest);
  res.json({
    query: plateToTest,
    status: check.isWanted ? 'WANTED' : 'CLEARED',
    isWanted: check.isWanted,
    canonicalPlate: check.canonical,
    vehicle: check.vehicle || null
  });
});

// 5. Record a Scan
app.post('/api/v1/scans', (req, res) => {
  const scanData = req.body;
  if (!scanData.letters && !scanData.numbers && !scanData.canonicalPlate && !scanData.rawTranscript) {
    return res.status(400).json({ error: 'Invalid scan payload' });
  }

  const scanRecord = db.recordScan(scanData);
  broadcast('NEW_SCAN', scanRecord);

  if (scanRecord.wanted) {
    broadcast('WANTED_ALERT', scanRecord);
  }

  res.status(201).json(scanRecord);
});

// 6. Get Scan Records
app.get('/api/v1/scans', (req, res) => {
  const { sessionId, wantedOnly, limit = 100, page = 1 } = req.query;
  let results = db.scans;

  if (sessionId) {
    results = results.filter(s => s.sessionId === sessionId);
  }
  if (wantedOnly === 'true') {
    results = results.filter(s => s.wanted);
  }

  const total = results.length;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const paginated = results.slice(offset, offset + parseInt(limit, 10));

  res.json({
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    scans: paginated
  });
});

// 7. Session Endpoints
app.post('/api/v1/sessions', (req, res) => {
  const session = db.createSession(req.body);
  broadcast('SESSION_STARTED', session);
  res.status(201).json(session);
});

app.post('/api/v1/sessions/:id/end', (req, res) => {
  const session = db.endSession(req.params.id);
  broadcast('SESSION_ENDED', session);
  res.json(session);
});

app.get('/api/v1/sessions', (req, res) => {
  res.json({ sessions: db.sessions });
});

app.get('/api/v1/sessions/:id', (req, res) => {
  const session = db.sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const scans = db.scans.filter(s => s.sessionId === session.id);
  res.json({ session, scans });
});

// 8. Dataset Management
app.get('/api/v1/datasets', (req, res) => {
  res.json({
    activeDatasetId: db.activeDatasetId,
    datasets: db.getDatasetList()
  });
});

app.get('/api/v1/datasets/active', (req, res) => {
  const active = db.datasets.find(d => d.id === db.activeDatasetId);
  if (!active) return res.status(404).json({ error: 'No active dataset' });
  res.json({ activeDataset: active });
});

app.post('/api/v1/datasets/import', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Excel file (.xlsx / .xls) required' });
  }

  try {
    const dataset = db.importExcelFile(req.file.path, {
      name: req.body.name || req.file.originalname,
      filename: req.file.originalname,
      uploadedBy: req.body.uploadedBy || 'المشغل'
    });

    if (req.body.activateImmediately === 'true') {
      db.activateDataset(dataset.id);
    }

    broadcast('DATASET_IMPORTED', dataset);
    res.status(201).json(dataset);
  } catch (err) {
    console.error('Error importing dataset:', err);
    res.status(500).json({ error: 'Failed to parse Excel file: ' + err.message });
  }
});

app.post('/api/v1/datasets/:id/activate', (req, res) => {
  try {
    const activated = db.activateDataset(req.params.id);
    broadcast('DATASET_ACTIVATED', activated);
    res.json({ success: true, activeDataset: activated });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// 9. Excel Exporters
app.get('/api/v1/export/session/:id', (req, res) => {
  try {
    const buffer = db.generateSessionExcel(req.params.id);
    const filename = `Boabat_Alarabi_Session_${req.params.id}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export Excel: ' + err.message });
  }
});

app.get('/api/v1/export/all', (req, res) => {
  try {
    const buffer = db.generateSessionExcel(null);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Boabat_Alarabi_All_Scans_${dateStr}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export Excel: ' + err.message });
  }
});

// 10. Audit Logs & Settings
app.get('/api/v1/audit-logs', (req, res) => {
  res.json({ logs: db.auditLogs });
});

app.get('/api/v1/settings', (req, res) => {
  res.json({ settings: db.settings });
});

app.post('/api/v1/settings', (req, res) => {
  db.settings = { ...db.settings, ...(req.body || {}) };
  db.saveDatabase();
  res.json({ settings: db.settings });
});

// 11. Built-in Benchmark & PoC Tester Endpoint
app.post('/api/v1/benchmark/run', (req, res) => {
  const testCases = [
    { input: 'ألف هاء راء 2753', expectedCanonical: 'اهر2753' },
    { input: 'ألف هاء راء ألفين سبعمية تلاتة وخمسين', expectedCanonical: 'اهر2753' },
    { input: 'باء ياء دال 3863', expectedCanonical: 'بيد3863' },
    { input: 'اسب2175', expectedCanonical: 'اسب2175' },
    { input: 'اسب2186', expectedCanonical: 'اسب2186' },
    { input: 'ركد9678', expectedCanonical: 'ركد9678' },
    { input: 'ديل الف دال 2 5 2 4', expectedCanonical: 'داد2524' },
    { input: 'د ب ك 2 1 2 1', expectedCanonical: 'دبك2121' },
    { input: 'د ر ص 2 8 2 8', expectedCanonical: 'درص2828' },
    { input: 'د ع د 5 1 5 1', expectedCanonical: 'دعد5151' },
    { input: 'د ر ب 27 27', expectedCanonical: 'درب2727' },
    { input: 'د ك ن 2 7 2 7', expectedCanonical: 'دكن2727' },
    { input: 'د و ع 5 1 5 1', expectedCanonical: 'دوع5151' },
    { input: 'د ر ب 2 3 2 3', expectedCanonical: 'درب2323' },
    { input: 'ي ص ن 0 5 0 5', expectedCanonical: 'يصن0505' }
  ];

  let passed = 0;
  let totalLatency = 0;
  const results = [];

  testCases.forEach((tc, idx) => {
    const t0 = process.hrtime.bigint();
    const candidates = parsePlateTranscript(tc.input);
    const t1 = process.hrtime.bigint();
    const latencyMs = Number(t1 - t0) / 1e6;
    totalLatency += latencyMs;

    const matched = candidates.find(c => c.canonicalPlate === tc.expectedCanonical);
    const check = matched ? db.checkWantedPlate(matched.canonicalPlate) : null;
    const isSuccess = !!matched;

    if (isSuccess) passed++;

    results.push({
      index: idx + 1,
      input: tc.input,
      expected: tc.expectedCanonical,
      actual: matched ? matched.canonicalPlate : (candidates[0]?.canonicalPlate || 'None'),
      passed: isSuccess,
      isWantedInDb: check?.isWanted || false,
      latencyMs: parseFloat(latencyMs.toFixed(3))
    });
  });

  const accuracy = (passed / testCases.length) * 100;
  const avgLatency = totalLatency / testCases.length;

  res.json({
    totalTests: testCases.length,
    passed,
    failed: testCases.length - passed,
    accuracy: `${accuracy.toFixed(1)}%`,
    avgLatencyMs: `${avgLatency.toFixed(3)}ms`,
    results
  });
});

// Serve frontend for any remaining route (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server
server.listen(PORT, HOST, () => {
  console.log(`[Boabat Al-Arabi] Cloud Server running on http://${HOST}:${PORT}`);
  logSttConfiguration();
});

module.exports = { app, server };
