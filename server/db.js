/**
 * Boabat Al-Arabi - High-Performance Database & Dataset Manager
 * Stores Datasets, Wanted Vehicles, Scan Sessions, Scan Records & Audit Logs
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { canonicalizePlate, normalizeArabicLetters } = require('./plate_engine');

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'app_db.json');
const DEFAULT_EXCEL = path.join(__dirname, '../file.xlsx');

class DatabaseManager {
  constructor() {
    this.datasets = [];
    this.activeDatasetId = null;
    this.wantedPlatesIndex = new Map(); // canonicalPlate -> VehicleRecord
    this.sessions = [];
    this.scans = [];
    this.auditLogs = [];
    this.settings = {
      language: 'ar-EG',
      soundAlert: true,
      hapticAlert: true,
      fastMode: true,
      minConfidence: 0.75,
      alertThreshold: 'EXACT_MATCH', // 'EXACT_MATCH' or 'HIGH_CONFIDENCE'
      autoSync: true
    };

    this.ensureDirectory();
    this.loadDatabase();
  }

  ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        this.datasets = data.datasets || [];
        this.activeDatasetId = data.activeDatasetId || null;
        this.sessions = data.sessions || [];
        this.scans = data.scans || [];
        this.auditLogs = data.auditLogs || [];
        this.settings = { ...this.settings, ...(data.settings || {}) };

        // Rebuild wanted index from active dataset file or memory
        this.rebuildWantedIndex();
        console.log(`[DB] Loaded ${this.datasets.length} datasets, ${this.sessions.length} sessions, ${this.wantedPlatesIndex.size} indexed wanted vehicles.`);
        return;
      } catch (err) {
        console.error('[DB] Failed to load db file, initializing fresh:', err);
      }
    }

    // First time setup - Load default file.xlsx if available
    this.initializeDefaultDataset();
  }

  saveDatabase() {
    try {
      const data = {
        datasets: this.datasets,
        activeDatasetId: this.activeDatasetId,
        sessions: this.sessions,
        scans: this.scans,
        auditLogs: this.auditLogs,
        settings: this.settings
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Error saving db:', err);
    }
  }

  initializeDefaultDataset() {
    if (fs.existsSync(DEFAULT_EXCEL)) {
      console.log('[DB] Initializing default dataset from file.xlsx...');
      try {
        const datasetId = 'dataset-initial-' + Date.now();
        const imported = this.importExcelFile(DEFAULT_EXCEL, {
          datasetId,
          name: 'قاعدة المطلوبين الرئيسية (ملف العميل)',
          filename: 'file.xlsx',
          uploadedBy: 'النظام'
        });

        this.activateDataset(datasetId);
        console.log(`[DB] Successfully loaded default dataset: ${imported.totalRecords} records from ${imported.sheets.length} sheets.`);
      } catch (err) {
        console.error('[DB] Error importing default excel file:', err);
      }
    }
  }

  importExcelFile(filePath, meta = {}) {
    const datasetId = meta.datasetId || 'dataset-' + Date.now();
    const workbook = xlsx.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    const sheetsMeta = [];
    const vehicles = [];
    let totalRows = 0;
    let duplicateCount = 0;
    const seenPlatesInFile = new Set();

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rows || rows.length === 0) continue;

      const headerRow = rows[0].map(h => (h || '').toString().trim());
      
      // Auto-detect columns
      let plateColIdx = -1;
      let typeColIdx = -1;
      let bankColIdx = -1;
      let vinColIdx = -1;

      headerRow.forEach((col, idx) => {
        const normCol = normalizeArabicLetters(col).toLowerCase();
        if (normCol.includes('لوح') || normCol.includes('رقم') || normCol === 'plate') {
          plateColIdx = idx;
        } else if (normCol.includes('نوع') || normCol.includes('طراز') || normCol === 'type' || normCol === 'model') {
          typeColIdx = idx;
        } else if (normCol.includes('بنك') || normCol.includes('شرك') || normCol.includes('جهه') || normCol.includes('جهة') || normCol === 'bank') {
          bankColIdx = idx;
        } else if (normCol.includes('هيكل') || normCol.includes('شاص') || normCol.includes('فين') || normCol === 'vin') {
          vinColIdx = idx;
        }
      });

      // Default fallback indices if not matched
      if (plateColIdx === -1) plateColIdx = 0;
      if (typeColIdx === -1 && headerRow.length > 1) typeColIdx = 1;
      if (bankColIdx === -1 && headerRow.length > 2) bankColIdx = 2;
      if (vinColIdx === -1 && headerRow.length > 3) vinColIdx = 3;

      let sheetValidRecords = 0;

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const rawPlate = (row[plateColIdx] || '').toString().trim();
        if (!rawPlate || rawPlate === 'اللوحة' || rawPlate === 'الصقر') continue;

        const canonical = canonicalizePlate(rawPlate);
        if (!canonical || canonical.length < 2) continue;

        if (seenPlatesInFile.has(canonical)) {
          duplicateCount++;
        }
        seenPlatesInFile.add(canonical);

        const vehicleRecord = {
          id: `veh-${datasetId}-${sheetName}-${r}`,
          datasetId,
          sheetName,
          rowNumber: r + 1,
          plateOriginal: rawPlate,
          plateNormalized: canonical,
          vehicleType: (row[typeColIdx] || '').toString().trim(),
          bank: (row[bankColIdx] || '').toString().trim(),
          vin: (row[vinColIdx] || '').toString().trim(),
          metadata: {
            fullRow: row
          }
        };

        vehicles.push(vehicleRecord);
        sheetValidRecords++;
      }

      sheetsMeta.push({
        sheetName,
        totalRows: rows.length,
        validRecords: sheetValidRecords,
        headers: headerRow,
        detectedMapping: {
          plateColumn: headerRow[plateColIdx] || `Column ${plateColIdx}`,
          typeColumn: headerRow[typeColIdx] || `Column ${typeColIdx}`,
          bankColumn: headerRow[bankColIdx] || `Column ${bankColIdx}`,
          vinColumn: headerRow[vinColIdx] || `Column ${vinColIdx}`
        }
      });

      totalRows += rows.length;
    }

    // Save vehicle records to dataset JSON store
    const datasetDataFile = path.join(DATA_DIR, `${datasetId}.json`);
    fs.writeFileSync(datasetDataFile, JSON.stringify(vehicles), 'utf-8');

    const newDataset = {
      id: datasetId,
      name: meta.name || meta.filename || 'ملف مطلوبين جديد',
      filename: meta.filename || path.basename(filePath),
      version: this.datasets.length + 1,
      status: 'INACTIVE',
      totalSheets: sheetsMeta.length,
      totalRows,
      totalRecords: vehicles.length,
      duplicateCount,
      sheets: sheetsMeta,
      dataFile: `${datasetId}.json`,
      uploadedBy: meta.uploadedBy || 'المشغل',
      uploadedAt: new Date().toISOString(),
      activatedAt: null
    };

    this.datasets.unshift(newDataset);
    this.saveDatabase();
    this.addAuditLog('IMPORT_DATASET', `استيراد قائمة جديدة (${newDataset.name}) بإجمالي ${vehicles.length} سيارة مطلوبة.`);

    return newDataset;
  }

  activateDataset(datasetId) {
    const ds = this.datasets.find(d => d.id === datasetId);
    if (!ds) throw new Error('Dataset not found');

    this.datasets.forEach(d => {
      d.status = (d.id === datasetId) ? 'ACTIVE' : 'ARCHIVED';
      if (d.id === datasetId) d.activatedAt = new Date().toISOString();
    });

    this.activeDatasetId = datasetId;
    this.rebuildWantedIndex();
    this.saveDatabase();
    this.addAuditLog('ACTIVATE_DATASET', `تفعيل قائمة المطلوبين: ${ds.name}`);
    return ds;
  }

  rebuildWantedIndex() {
    this.wantedPlatesIndex.clear();
    if (!this.activeDatasetId) return;

    const ds = this.datasets.find(d => d.id === this.activeDatasetId);
    if (!ds || !ds.dataFile) return;

    const datasetFile = path.join(DATA_DIR, ds.dataFile);
    if (!fs.existsSync(datasetFile)) return;

    try {
      const raw = fs.readFileSync(datasetFile, 'utf-8');
      const vehicles = JSON.parse(raw);
      for (const v of vehicles) {
        if (v.plateNormalized) {
          this.wantedPlatesIndex.set(v.plateNormalized, v);
        }
      }
    } catch (err) {
      console.error('[DB] Error loading active dataset file:', err);
    }
  }

  checkWantedPlate(plateStr) {
    const canonical = canonicalizePlate(plateStr);
    if (!canonical) return { isWanted: false, canonical: '' };

    const match = this.wantedPlatesIndex.get(canonical);
    if (match) {
      return {
        isWanted: true,
        canonical,
        vehicle: {
          id: match.id,
          plateOriginal: match.plateOriginal,
          vehicleType: match.vehicleType || 'غير محدد',
          bank: match.bank || 'غير محدد',
          vin: match.vin || '',
          sheetName: match.sheetName,
          rowNumber: match.rowNumber
        }
      };
    }

    return {
      isWanted: false,
      canonical
    };
  }

  // Session & Scan methods
  createSession(meta = {}) {
    const sessionId = 'SES-' + Date.now();
    const session = {
      id: sessionId,
      name: `جلسة ${new Date().toLocaleDateString('ar-EG')} - ${new Date().toLocaleTimeString('ar-EG')}`,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'ACTIVE',
      totalScans: 0,
      wantedCount: 0,
      clearedCount: 0,
      operator: meta.operator || 'المشغل الميداني',
      notes: meta.notes || ''
    };

    this.sessions.unshift(session);
    this.saveDatabase();
    this.addAuditLog('START_SESSION', `بدء جلسة مسح صوتي جديدة: ${sessionId}`);
    return session;
  }

  endSession(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      session.status = 'COMPLETED';
      session.endedAt = new Date().toISOString();
      this.saveDatabase();
      this.addAuditLog('END_SESSION', `إنهاء الجلسة ${sessionId}. الإجمالي: ${session.totalScans}، المطلوب: ${session.wantedCount}`);
    }
    return session;
  }

  recordScan(scanData) {
    const scanId = scanData.id || 'scan-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const check = this.checkWantedPlate(scanData.canonicalPlate || scanData.plateDisplay);

    const record = {
      id: scanId,
      sessionId: scanData.sessionId || (this.sessions[0] ? this.sessions[0].id : 'SES-DEFAULT'),
      rawTranscript: scanData.rawTranscript || '',
      letters: scanData.letters || '',
      numbers: scanData.numbers || '',
      plateDisplay: scanData.plateDisplay || `${scanData.letters} ${scanData.numbers}`,
      canonicalPlate: check.canonical || scanData.canonicalPlate,
      confidence: scanData.confidence !== undefined ? scanData.confidence : 0.98,
      status: check.isWanted ? 'WANTED' : (scanData.confidence < 0.8 ? 'LOW_CONFIDENCE' : 'CLEARED'),
      wanted: check.isWanted,
      matchedVehicle: check.isWanted ? check.vehicle : null,
      latitude: scanData.latitude || null,
      longitude: scanData.longitude || null,
      gpsAccuracy: scanData.gpsAccuracy || null,
      processingTimeMs: scanData.processingTimeMs || 150,
      capturedAt: new Date().toISOString()
    };

    this.scans.unshift(record);

    // Update active session stats
    const session = this.sessions.find(s => s.id === record.sessionId);
    if (session) {
      session.totalScans++;
      if (record.wanted) session.wantedCount++;
      else session.clearedCount++;
    }

    this.saveDatabase();

    if (record.wanted) {
      this.addAuditLog('WANTED_DETECTED', `⚠️ لوحة مطلوبة: ${record.plateDisplay} (${record.matchedVehicle?.vehicleType} - ${record.matchedVehicle?.bank})`);
    }

    return record;
  }

  addAuditLog(action, details) {
    this.auditLogs.unshift({
      id: 'log-' + Date.now(),
      action,
      details,
      timestamp: new Date().toISOString()
    });
    if (this.auditLogs.length > 500) {
      this.auditLogs = this.auditLogs.slice(0, 500);
    }
  }

  getDatasetList() {
    return this.datasets.map(d => ({
      id: d.id,
      name: d.name,
      filename: d.filename,
      version: d.version,
      status: d.status,
      totalSheets: d.totalSheets,
      totalRecords: d.totalRecords,
      duplicateCount: d.duplicateCount,
      uploadedAt: d.uploadedAt,
      activatedAt: d.activatedAt,
      sheets: d.sheets
    }));
  }

  generateSessionExcel(sessionId) {
    const sessionScans = this.scans.filter(s => s.sessionId === sessionId || !sessionId);
    const session = this.sessions.find(s => s.id === sessionId);

    const rows = sessionScans.map((s, idx) => ({
      '#': idx + 1,
      'اللوحة': s.plateDisplay,
      'الحروف': s.letters,
      'الأرقام': s.numbers,
      'الحالة': s.wanted ? 'مطلوبة ⚠️' : 'سليمة ✔',
      'نوع السيارة': s.matchedVehicle ? s.matchedVehicle.vehicleType : '-',
      'الجهة / البنك': s.matchedVehicle ? s.matchedVehicle.bank : '-',
      'رقم الهيكل': s.matchedVehicle ? s.matchedVehicle.vin : '-',
      'خط العرض (Latitude)': s.latitude || '-',
      'خط الطول (Longitude)': s.longitude || '-',
      'دقة GPS (متر)': s.gpsAccuracy ? `${s.gpsAccuracy}m` : '-',
      'التاريخ والوقت': new Date(s.capturedAt).toLocaleString('ar-EG'),
      'نسبة الثقة': `${Math.round(s.confidence * 100)}%`,
      'زمن المعالجة': `${s.processingTimeMs}ms`,
      'النص الصوتي الخام': s.rawTranscript || '-'
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'سجل الفحص');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}

const db = new DatabaseManager();
module.exports = db;
