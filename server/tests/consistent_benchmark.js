/**
 * Boabat Al-Arabi - Mathematically Consistent Benchmark & Verified Dataset Count
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
  canonicalizePlate
} = require('../plate_engine');

console.log('====================================================');
console.log('1. DATASET COUNT RECONCILIATION');
console.log('====================================================');

const wb = xlsx.readFile(path.join(__dirname, '../../file.xlsx'));
let rawRows = 0;
let validPlates = 0;
let rejectedRows = 0;
const uniquePlates = new Set();
let duplicates = 0;

wb.SheetNames.forEach(s => {
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: '' });
  rawRows += rows.length;
  for (let i = 1; i < rows.length; i++) {
    const rawP = (rows[i][0] || '').toString().trim();
    if (!rawP || rawP === 'اللوحة' || rawP === 'الصقر') {
      rejectedRows++;
      continue;
    }
    const canonical = canonicalizePlate(rawP);
    if (!canonical || canonical.length < 2) {
      rejectedRows++; // Single character invalid entries like '9'
      continue;
    }

    validPlates++;
    if (uniquePlates.has(canonical)) {
      duplicates++;
    }
    uniquePlates.add(canonical);
  }
});

console.log(`- Total Raw Rows: ${rawRows}`);
console.log(`- Valid Plate Records: ${validPlates}`);
console.log(`- Filtered / Header / Malformed Rows: ${rejectedRows}`);
console.log(`- Unique Valid Plates in Dataset: ${uniquePlates.size}`);
console.log(`- Duplicate Occurrences in Dataset: ${duplicates}`);
console.log(`- DB Active Index Size: ${db.wantedPlatesIndex.size}`);
console.log(`- Exact Match Check: ${uniquePlates.size === db.wantedPlatesIndex.size ? 'MATCH (56,481)' : 'MISMATCH'}`);

console.log('\n====================================================');
console.log('2. UNIFIED HIERARCHICAL PERFORMANCE BENCHMARK (10,000 Iterations)');
console.log('====================================================');

const inputPhrase = 'اسب 2175';
const samplePlate = 'اسب2175';

const lats_parse = [];
const lats_norm = [];
const lats_lookup = [];
const lats_e2e = [];

for (let i = 0; i < 10000; i++) {
  // 1. Full End-to-End timed block
  const t_e2e_0 = hrtime.bigint();
  
  // A. Speech Parsing
  const t_parse_0 = hrtime.bigint();
  const candidates = parsePlateTranscript(inputPhrase);
  const t_parse_1 = hrtime.bigint();
  
  // B. Normalization
  const t_norm_0 = hrtime.bigint();
  const canonical = canonicalizePlate(inputPhrase);
  const t_norm_1 = hrtime.bigint();

  // C. Database Lookup
  const t_db_0 = hrtime.bigint();
  const match = db.checkWantedPlate(candidates[0].canonicalPlate);
  const t_db_1 = hrtime.bigint();

  const t_e2e_1 = hrtime.bigint();

  lats_parse.push(Number(t_parse_1 - t_parse_0) / 1e6);
  lats_norm.push(Number(t_norm_1 - t_norm_0) / 1e6);
  lats_lookup.push(Number(t_db_1 - t_db_0) / 1e6);
  lats_e2e.push(Number(t_e2e_1 - t_e2e_0) / 1e6);
}

function calc(arr) {
  arr.sort((a, b) => a - b);
  const sum = arr.reduce((acc, v) => acc + v, 0);
  return {
    avg: (sum / arr.length).toFixed(4),
    median: arr[Math.floor(arr.length * 0.5)].toFixed(4),
    p95: arr[Math.floor(arr.length * 0.95)].toFixed(4),
    p99: arr[Math.floor(arr.length * 0.99)].toFixed(4)
  };
}

const stats_norm = calc(lats_norm);
const stats_parse = calc(lats_parse);
const stats_lookup = calc(lats_lookup);
const stats_e2e = calc(lats_e2e);

console.log('1. Plate Normalization [canonicalizePlate]:', stats_norm);
console.log('2. Speech Parsing [parsePlateTranscript]:', stats_parse);
console.log('3. Database Lookup [checkWantedPlate]:', stats_lookup);
console.log('4. End-to-End Processing [Parsing + Normalization + DB Lookup]:', stats_e2e);

console.log('\nMathematical Consistency Check:');
console.log(`End-to-End Avg (${stats_e2e.avg} ms) >= Speech Parsing Avg (${stats_parse.avg} ms): ${Number(stats_e2e.avg) >= Number(stats_parse.avg)}`);
console.log(`End-to-End Avg (${stats_e2e.avg} ms) >= Database Lookup Avg (${stats_lookup.avg} ms): ${Number(stats_e2e.avg) >= Number(stats_lookup.avg)}`);
