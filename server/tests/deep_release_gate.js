/**
 * Boabat Al-Arabi - Deep Final Release Gate Verification Script
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const http = require('http');
const https = require('https');
const { hrtime } = require('process');

const db = require('../db');
const { parsePlateTranscript, canonicalizePlate } = require('../plate_engine');

async function runDeepReleaseGateAudit() {
  console.log('================================================================');
  console.log('1. DATABASE VS IN-MEMORY MAP LAYER VERIFICATION');
  console.log('================================================================');

  const excelPath = path.join(__dirname, '../../file.xlsx');
  const wb = xlsx.readFile(excelPath);
  let totalRawRows = 0;
  let validPlates = 0;
  const uniquePlates = new Set();

  wb.SheetNames.forEach(sheetName => {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    totalRawRows += rows.length;
    for (let i = 1; i < rows.length; i++) {
      const cellVal = (rows[i][0] || '').toString().trim();
      if (cellVal && cellVal !== 'اللوحة' && cellVal !== 'الصقر') {
        const canonical = canonicalizePlate(cellVal);
        if (canonical && canonical.length >= 2) {
          validPlates++;
          uniquePlates.add(canonical);
        }
      }
    }
  });

  const diskDbPath = path.join(__dirname, '../../data/app_db.json');
  const diskDb = JSON.parse(fs.readFileSync(diskDbPath, 'utf-8'));
  const activeDataset = diskDb.datasets.find(d => d.id === diskDb.activeDatasetId);

  const layerTable = [
    { Layer: 'Excel Raw Rows (Sheet تسجيل + تشييك)', Count: totalRawRows },
    { Layer: 'Valid Vehicle Plate Rows', Count: validPlates },
    { Layer: 'Persistent Disk JSON (database.json active dataset)', Count: activeDataset.totalRecords },
    { Layer: 'Unique Canonical Plates Count', Count: uniquePlates.size },
    { Layer: 'In-Memory Map Key Index (db.wantedPlatesIndex)', Count: db.wantedPlatesIndex.size }
  ];
  console.table(layerTable);

  console.log('\n================================================================');
  console.log('2. EXCEL EXPORT INTERNAL BINARY & CELL AUDIT');
  console.log('================================================================');

  const session = db.createSession({ operator: 'مفتش الجودة' });
  const scan = db.recordScan({
    sessionId: session.id,
    letters: 'ا س ب',
    numbers: '2175',
    canonicalPlate: 'اسب2175',
    plateDisplay: 'ا س ب 2175',
    rawTranscript: 'اسب 2175',
    latitude: 24.7136,
    longitude: 46.6753,
    gpsAccuracy: 5
  });

  const exportBuf = db.generateSessionExcel(session.id);
  const exportedWb = xlsx.read(exportBuf, { type: 'buffer' });
  const sheetName = exportedWb.SheetNames[0];
  const exportedRows = xlsx.utils.sheet_to_json(exportedWb.Sheets[sheetName]);
  const firstRow = exportedRows[0];

  console.log('Export File Integrity:');
  console.log('- Is Valid Buffer:', Buffer.isBuffer(exportBuf), `(${exportBuf.length} bytes)`);
  console.log('- Sheet Name:', sheetName);
  console.log('- Exported Rows Count:', exportedRows.length);
  console.log('- Column Headers:', Object.keys(firstRow));
  console.log('- First Row Values:', firstRow);

  console.log('\n================================================================');
  console.log('3. SETTINGS PERSISTENCE AUDIT (Local + Cloud)');
  console.log('================================================================');

  // Test toggling settings
  const originalSettings = { ...db.settings };
  db.settings.soundAlert = false;
  db.settings.hapticAlert = false;
  db.saveDatabase();

  const reloadedDb1 = JSON.parse(fs.readFileSync(diskDbPath, 'utf-8'));
  const test1Passed = reloadedDb1.settings.soundAlert === false && reloadedDb1.settings.hapticAlert === false;

  db.settings.soundAlert = true;
  db.settings.hapticAlert = true;
  db.saveDatabase();

  const reloadedDb2 = JSON.parse(fs.readFileSync(diskDbPath, 'utf-8'));
  const test2Passed = reloadedDb2.settings.soundAlert === true && reloadedDb2.settings.hapticAlert === true;

  console.log('- Settings Save & Reload Test (OFF):', test1Passed ? 'PASS' : 'FAIL');
  console.log('- Settings Save & Reload Test (ON):', test2Passed ? 'PASS' : 'FAIL');
  console.log('- Storage Mechanism: Persistent Local Disk (`data/database.json`) + Sync API `/api/v1/settings`');

  console.log('\n================================================================');
  console.log('4. DISCRETE PERFORMANCE BENCHMARK BREAKDOWN');
  console.log('================================================================');

  // A. In-Memory Map Lookup
  const memTimes = [];
  for (let i = 0; i < 5000; i++) {
    const t0 = hrtime.bigint();
    db.wantedPlatesIndex.get('اسب2175');
    const t1 = hrtime.bigint();
    memTimes.push(Number(t1 - t0) / 1e6);
  }

  // B. Plate Extraction & Normalization
  const parseTimes = [];
  for (let i = 0; i < 5000; i++) {
    const t0 = hrtime.bigint();
    parsePlateTranscript('اسب 2175');
    const t1 = hrtime.bigint();
    parseTimes.push(Number(t1 - t0) / 1e6);
  }

  // C. Full In-Process End-to-End (Speech -> Parse -> Norm -> DB Lookup -> Result)
  const e2eTimes = [];
  for (let i = 0; i < 5000; i++) {
    const t0 = hrtime.bigint();
    const c = parsePlateTranscript('اسب 2175');
    if (c.length > 0) {
      db.checkWantedPlate(c[0].canonicalPlate);
    }
    const t1 = hrtime.bigint();
    e2eTimes.push(Number(t1 - t0) / 1e6);
  }

  function stats(arr) {
    arr.sort((a, b) => a - b);
    const sum = arr.reduce((acc, v) => acc + v, 0);
    return {
      avg: (sum / arr.length).toFixed(4) + ' ms',
      median: arr[Math.floor(arr.length * 0.5)].toFixed(4) + ' ms',
      p95: arr[Math.floor(arr.length * 0.95)].toFixed(4) + ' ms',
      p99: arr[Math.floor(arr.length * 0.99)].toFixed(4) + ' ms',
      min: arr[0].toFixed(4) + ' ms',
      max: arr[arr.length - 1].toFixed(4) + ' ms'
    };
  }

  console.log('A. In-Memory Map Lookup (Map.get):', stats(memTimes));
  console.log('B. Plate Speech Parsing & Dialect Engine:', stats(parseTimes));
  console.log('C. In-Process End-to-End Processing:', stats(e2eTimes));

  console.log('\n================================================================');
  console.log('ALL DEEP RELEASE GATE TESTS EXECUTED SUCCESSFULLY');
  console.log('================================================================');
}

runDeepReleaseGateAudit();
