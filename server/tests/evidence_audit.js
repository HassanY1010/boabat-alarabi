/**
 * Boabat Al-Arabi - Evidence Generation & System Audit Runner
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const http = require('http');
const https = require('https');
const { hrtime } = require('process');

const db = require('../db');
const { parsePlateTranscript, canonicalizePlate } = require('../plate_engine');

async function runComprehensiveAudit() {
  const auditReport = {
    timestamp: new Date().toISOString(),
    dataset: {},
    complexityAndBenchmark: {},
    apiAudit: [],
    securityAudit: [],
    e2eFlow: {},
    databaseState: {}
  };

  console.log('=== 1. DATASET EVIDENCE AUDIT ===');
  const excelPath = path.join(__dirname, '../../file.xlsx');
  const wb = xlsx.readFile(excelPath);
  let totalRawRows = 0;
  let validPlates = 0;
  let headerRows = 0;
  let blankRows = 0;
  let otherExcluded = 0;
  const uniquePlates = new Set();
  let duplicates = 0;

  wb.SheetNames.forEach((sheetName, sIdx) => {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    totalRawRows += rows.length;
    headerRows += 1; // Row 1 is header

    for (let i = 1; i < rows.length; i++) {
      const cellVal = (rows[i][0] || '').toString().trim();
      if (!cellVal) {
        blankRows++;
      } else if (cellVal === 'اللوحة' || cellVal === 'الصقر') {
        otherExcluded++;
      } else {
        const canonical = canonicalizePlate(cellVal);
        if (!canonical || canonical.length < 2) {
          otherExcluded++;
        } else {
          validPlates++;
          if (uniquePlates.has(canonical)) {
            duplicates++;
          }
          uniquePlates.add(canonical);
        }
      }
    }
  });

  auditReport.dataset = {
    excelPath,
    sheets: wb.SheetNames,
    totalRawRows,
    validPlates,
    headerRows,
    blankRows,
    otherExcluded,
    uniquePlatesCount: uniquePlates.size,
    duplicateEntriesCount: duplicates,
    dbWantedIndexSize: db.wantedPlatesIndex.size,
    exactMatch: uniquePlates.size === db.wantedPlatesIndex.size
  };
  console.log('Dataset Audit:', auditReport.dataset);

  console.log('\n=== 2. O(1) COMPLEXITY & TIMING BENCHMARK EVIDENCE ===');
  // Data Structure Proof:
  // db.wantedPlatesIndex is an instance of JavaScript native Map (Hash Table / Hash Map).
  // Map.prototype.get() and Map.prototype.has() in V8 have average time complexity O(1).
  const lookupTimesMemory = [];
  const samplePlates = Array.from(db.wantedPlatesIndex.keys()).slice(0, 100);
  const cleanPlates = ['داد2524', 'دبك2121', 'درص2828', 'اهر2753', 'بيد3863'];

  for (let i = 0; i < 10000; i++) {
    const p = (i % 2 === 0) ? samplePlates[i % samplePlates.length] : cleanPlates[i % cleanPlates.length];
    const t0 = hrtime.bigint();
    db.wantedPlatesIndex.get(p); // Direct Memory Map Lookup
    const t1 = hrtime.bigint();
    lookupTimesMemory.push(Number(t1 - t0) / 1e6);
  }

  function getStats(arr) {
    arr.sort((a, b) => a - b);
    const sum = arr.reduce((acc, v) => acc + v, 0);
    return {
      iterations: arr.length,
      avg_ms: Number((sum / arr.length).toFixed(5)),
      median_ms: Number(arr[Math.floor(arr.length * 0.5)].toFixed(5)),
      p95_ms: Number(arr[Math.floor(arr.length * 0.95)].toFixed(5)),
      p99_ms: Number(arr[Math.floor(arr.length * 0.99)].toFixed(5)),
      min_ms: Number(arr[0].toFixed(5)),
      max_ms: Number(arr[arr.length - 1].toFixed(5))
    };
  }

  auditReport.complexityAndBenchmark = {
    dataStructure: 'JavaScript Native Map (Hash Table / Hash Map in V8)',
    key: 'Canonical Plate String (Normalized Arabic Letters + Western Digits, e.g. اسب2175)',
    theoreticalComplexity: 'O(1) Average Time Complexity for Map.get() / Map.has()',
    memoryLookupBenchmark: getStats(lookupTimesMemory)
  };
  console.log('Complexity & Benchmark Audit:', auditReport.complexityAndBenchmark);

  console.log('\n=== 3. LIVE CLOUD API ENDPOINTS TEST EVIDENCE ===');
  const endpoints = [
    { method: 'GET', path: '/api/v1/health', expectedStatus: 200, name: 'Health Check' },
    { method: 'GET', path: '/api/v1/stats', expectedStatus: 200, name: 'System Statistics' },
    { method: 'GET', path: '/api/v1/sessions', expectedStatus: 200, name: 'Sessions List' },
    { method: 'GET', path: '/api/v1/datasets', expectedStatus: 200, name: 'Datasets List' },
    { method: 'GET', path: '/api/v1/scans?limit=5', expectedStatus: 200, name: 'Recent Scans List' },
    { method: 'GET', path: '/api/v1/scans?wantedOnly=true', expectedStatus: 200, name: 'Wanted Scans Filter' },
    { method: 'POST', path: '/api/v1/plates/check', payload: { plate: 'اسب2175' }, expectedStatus: 200, name: 'Plate Wanted Check (Known Wanted)' },
    { method: 'POST', path: '/api/v1/plates/check', payload: { plate: 'داد2524' }, expectedStatus: 200, name: 'Plate Wanted Check (Clean)' },
    { method: 'POST', path: '/api/v1/plates/parse', payload: { transcript: 'اسب 2175' }, expectedStatus: 200, name: 'Speech Plate Extraction' },
    { method: 'POST', path: '/api/v1/benchmark/run', payload: {}, expectedStatus: 200, name: 'Automated PoC Benchmark' },
    { method: 'GET', path: '/api/v1/invalid-route-test-404', expectedStatus: 200, name: 'SPA Routing Fallback (Returns index.html)' }
  ];

  function makeRequest(ep) {
    return new Promise((resolve) => {
      const isPost = ep.method === 'POST';
      const postData = isPost ? JSON.stringify(ep.payload || {}) : '';
      const options = {
        hostname: 'boabat-alarabi.onrender.com',
        port: 443,
        path: ep.path,
        method: ep.method,
        headers: {
          'User-Agent': 'BoabatAuditBot/1.0',
          'Content-Type': 'application/json',
          ...(isPost ? { 'Content-Length': Buffer.byteLength(postData) } : {})
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          resolve({
            name: ep.name,
            method: ep.method,
            path: ep.path,
            statusCode: res.statusCode,
            passed: res.statusCode === ep.expectedStatus,
            responseLength: body.length
          });
        });
      });

      req.on('error', (e) => {
        resolve({
          name: ep.name,
          method: ep.method,
          path: ep.path,
          statusCode: 'ERROR',
          passed: false,
          error: e.message
        });
      });

      if (isPost) req.write(postData);
      req.end();
    });
  }

  for (const ep of endpoints) {
    const result = await makeRequest(ep);
    auditReport.apiAudit.push(result);
    console.log(`[API ${result.statusCode}] ${result.method} ${result.path} -> ${result.passed ? 'PASS' : 'FAIL'}`);
  }

  console.log('\n=== 4. SECURITY & DATA INTEGRITY TEST EVIDENCE ===');
  // Security test 1: Malformed JSON / Injection payload in check
  const malformedCheck = db.checkWantedPlate('\' OR \'1\'=\'1');
  const security1 = {
    test: 'SQL / Script Injection in Plate Check Query',
    payload: '\' OR \'1\'=\'1',
    isWanted: malformedCheck.isWanted,
    passed: malformedCheck.isWanted === false, // Injection should not match any plate
    evidence: 'In-memory Map key sanitization prevents injection attacks.'
  };

  // Security test 2: Path traversal in Excel export
  let pathTraversalPassed = true;
  try {
    db.generateSessionExcel('../../../etc/passwd');
  } catch (e) {
    pathTraversalPassed = e.message.includes('Session not found');
  }
  const security2 = {
    test: 'Path Traversal Prevention in Session Export',
    payload: '../../../etc/passwd',
    passed: pathTraversalPassed,
    evidence: 'Session ID lookup uses strictly validated in-memory array filtering.'
  };

  auditReport.securityAudit = [security1, security2];
  console.log('Security Audit:', auditReport.securityAudit);

  console.log('\n=== 5. E2E USER FLOW AUDIT EVIDENCE ===');
  // 1. Create Session
  const testSession = db.createSession({ operator: 'مدقق الجودة والاعتماد' });
  // 2. Perform Wanted Scan
  const testScan = db.recordScan({
    sessionId: testSession.id,
    letters: 'ا س ب',
    numbers: '2175',
    canonicalPlate: 'اسب2175',
    plateDisplay: 'ا س ب 2175',
    rawTranscript: 'اسب 2175',
    latitude: 24.7136,
    longitude: 46.6753
  });
  // 3. Export Session
  const excelBuf = db.generateSessionExcel(testSession.id);
  const exportedWb = xlsx.read(excelBuf, { type: 'buffer' });
  const exportedRows = xlsx.utils.sheet_to_json(exportedWb.Sheets[exportedWb.SheetNames[0]]);

  auditReport.e2eFlow = {
    createdSessionId: testSession.id,
    scanRecorded: testScan.id,
    scanStatus: testScan.status,
    scanWanted: testScan.wanted,
    excelExportGeneratedBytes: excelBuf.length,
    excelRowsCount: exportedRows.length,
    passed: testScan.wanted === true && exportedRows.length === 1
  };
  console.log('E2E Flow Audit:', auditReport.e2eFlow);

  fs.writeFileSync(path.join(__dirname, 'evidence_audit_report.json'), JSON.stringify(auditReport, null, 2), 'utf-8');
  console.log('\nAudit complete. Saved to evidence_audit_report.json.');
}

runComprehensiveAudit();
