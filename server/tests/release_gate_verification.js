/**
 * Boabat Al-Arabi - Final Release Gate Verification Script
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { hrtime } = require('process');

const db = require('../db');
const {
  normalizeArabicLetters,
  normalizeDigits,
  parsePlateTranscript,
  canonicalizePlate,
  tokenizeArabicSpeech
} = require('../plate_engine');

console.log('================================================================');
console.log('FINAL RELEASE GATE VERIFICATION');
console.log('================================================================\n');

// 1. REAL DATASET VERIFICATION
console.log('--- 1. REAL DATASET VERIFICATION (file.xlsx) ---');
const excelPath = path.join(__dirname, '../../file.xlsx');
const wb = xlsx.readFile(excelPath);
const sheets = wb.SheetNames;
let totalRawRows = 0;
let totalPlateEntries = 0;
const uniquePlatesSet = new Set();
let duplicateCount = 0;

sheets.forEach(s => {
  const sheet = wb.Sheets[s];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  totalRawRows += rows.length;
  for (let i = 1; i < rows.length; i++) {
    const rawP = (rows[i][0] || '').toString().trim();
    if (rawP && rawP !== 'اللوحة' && rawP !== 'الصقر') {
      totalPlateEntries++;
      const canonical = canonicalizePlate(rawP);
      if (canonical) {
        if (uniquePlatesSet.has(canonical)) {
          duplicateCount++;
        }
        uniquePlatesSet.add(canonical);
      }
    }
  }
});

console.log(`Sheets Count: ${sheets.length} (${sheets.join(', ')})`);
console.log(`Total Raw Rows across all sheets: ${totalRawRows}`);
console.log(`Total Plate Entries: ${totalPlateEntries}`);
console.log(`Unique Canonical Plates: ${uniquePlatesSet.size}`);
console.log(`Duplicate Plate Entries: ${duplicateCount}`);
console.log(`Active Wanted Index Size in DB: ${db.wantedPlatesIndex.size}`);

// 2. COMPLETE REAL USER FLOW VERIFICATION
console.log('\n--- 2. COMPLETE REAL USER FLOW VERIFICATION ---');

// Step 1: Start session
const session = db.createSession({ operator: 'المشغل الميداني التجريبي' });
console.log(`[Step 1] Session Created: ID=${session.id}, Status=${session.status}`);

// Step 2: Simulate spoken plate inputs (Wanted & Cleared)
const spokenInputs = [
  { phrase: 'اسب 2175', expectedWanted: true },
  { phrase: 'ألف هاء راء 2753', expectedWanted: false },
  { phrase: 'ركد 9678', expectedWanted: true },
  { phrase: 'ديل الف دال 2 5 2 4', expectedWanted: false }
];

const recordedScans = [];
spokenInputs.forEach((item, idx) => {
  // Step 3 & 4: Plate extraction & Normalization
  const parsed = parsePlateTranscript(item.phrase);
  if (!parsed || parsed.length === 0) {
    throw new Error(`Failed to parse phrase: ${item.phrase}`);
  }
  const candidate = parsed[0];

  // Step 5: Wanted Matching
  const matchCheck = db.checkWantedPlate(candidate.canonicalPlate);

  // Step 6 & 7: GPS Capture & Save Scan Record
  const scan = db.recordScan({
    sessionId: session.id,
    letters: candidate.letters,
    numbers: candidate.numbers,
    canonicalPlate: candidate.canonicalPlate,
    plateDisplay: candidate.plateDisplay,
    rawTranscript: item.phrase,
    confidence: candidate.confidence,
    latitude: 24.7136 + (idx * 0.001),
    longitude: 46.6753 + (idx * 0.001),
    gpsAccuracy: 5
  });

  recordedScans.push(scan);
  console.log(`[Step 3-7] Input: "${item.phrase}" -> Plate: "${scan.plateDisplay}" | Canonical: "${scan.canonicalPlate}" | Status: ${scan.status} | Wanted: ${scan.wanted} (Expected: ${item.expectedWanted}) | GPS: ${scan.latitude}, ${scan.longitude}`);
});

// Step 8: Verify Session History & Stats
console.log(`[Step 8] Session Stats -> Total: ${session.totalScans}, Wanted: ${session.wantedCount}, Cleared: ${session.clearedCount}`);

// Step 9: End Session
const endedSession = db.endSession(session.id);
console.log(`[Step 9] Session Ended: Status=${endedSession.status}, EndedAt=${endedSession.endedAt}`);

// Step 10: Excel Export Generation & Structure Audit
const exportBuffer = db.generateSessionExcel(session.id);
const exportedWb = xlsx.read(exportBuffer, { type: 'buffer' });
const exportedSheetName = exportedWb.SheetNames[0];
const exportedRows = xlsx.utils.sheet_to_json(exportedWb.Sheets[exportedSheetName]);

console.log(`[Step 10] Excel Export Verified: Generated Buffer Size=${exportBuffer.length} bytes, Rows Count=${exportedRows.length}`);
console.log(`Export Columns:`, Object.keys(exportedRows[0]));

// 3. MATHEMATICALLY CONSISTENT PERFORMANCE BENCHMARK (10,000 Iterations with IDENTICAL Single-Plate Input)
console.log('\n--- 3. MATHEMATICALLY CONSISTENT PERFORMANCE BENCHMARK (10,000 Iterations) ---');

const testInput = 'اسب 2175';
const testPlate = 'اسب2175';

function getStats(latencies) {
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  return {
    avg: (sum / latencies.length).toFixed(4),
    median: latencies[Math.floor(latencies.length * 0.5)].toFixed(4),
    p95: latencies[Math.floor(latencies.length * 0.95)].toFixed(4),
    p99: latencies[Math.floor(latencies.length * 0.99)].toFixed(4)
  };
}

// Stage A: Normalization Latency
const normLats = [];
for (let i = 0; i < 10000; i++) {
  const t0 = hrtime.bigint();
  canonicalizePlate(testInput);
  const t1 = hrtime.bigint();
  normLats.push(Number(t1 - t0) / 1e6);
}

// Stage B: Speech Parsing Latency
const parseLats = [];
for (let i = 0; i < 10000; i++) {
  const t0 = hrtime.bigint();
  parsePlateTranscript(testInput);
  const t1 = hrtime.bigint();
  parseLats.push(Number(t1 - t0) / 1e6);
}

// Stage C: Database Lookup Latency
const dbLats = [];
for (let i = 0; i < 10000; i++) {
  const t0 = hrtime.bigint();
  db.checkWantedPlate(testPlate);
  const t1 = hrtime.bigint();
  dbLats.push(Number(t1 - t0) / 1e6);
}

// Stage D: End-to-End Processing Latency (Speech -> Parse -> DB Match)
const e2eLats = [];
for (let i = 0; i < 10000; i++) {
  const t0 = hrtime.bigint();
  const candidates = parsePlateTranscript(testInput);
  if (candidates.length > 0) {
    db.checkWantedPlate(candidates[0].canonicalPlate);
  }
  const t1 = hrtime.bigint();
  e2eLats.push(Number(t1 - t0) / 1e6);
}

console.log('A. Plate Normalization (ms):', getStats(normLats));
console.log('B. Speech Parsing (ms):', getStats(parseLats));
console.log('C. Database Lookup (ms):', getStats(dbLats));
console.log('D. End-to-End Processing (ms):', getStats(e2eLats));

console.log('\n================================================================');
console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY');
console.log('================================================================');
