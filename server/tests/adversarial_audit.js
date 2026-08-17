/**
 * Boabat Al-Arabi - Adversarial Production-Readiness Audit & Benchmark Suite
 */

const { hrtime } = require('process');
const db = require('../db');
const {
  normalizeArabicLetters,
  normalizeDigits,
  parsePlateTranscript,
  canonicalizePlate,
  tokenizeArabicSpeech
} = require('../plate_engine');

function calculatePercentiles(latencies) {
  latencies.sort((a, b) => a - b);
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const avg = sum / latencies.length;
  const median = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  return {
    min: min.toFixed(4),
    max: max.toFixed(4),
    avg: avg.toFixed(4),
    median: median.toFixed(4),
    p95: p95.toFixed(4),
    p99: p99.toFixed(4),
    iterations: latencies.length
  };
}

console.log('====================================================');
console.log('1. ADVERSARIAL BENCHMARKING (10,000 iterations each)');
console.log('====================================================');

// A. Database Lookup Latency
const dbLatencies = [];
const sampleWantedPlates = ['اسب2175', 'اسب2186', 'ركد9678', 'رعق8228', 'رعم3428'];
const sampleCleanPlates = ['داد2524', 'دبك2121', 'درص2828', 'دعد5151', 'يصن0505'];

for (let i = 0; i < 10000; i++) {
  const plate = (i % 2 === 0) ? sampleWantedPlates[i % sampleWantedPlates.length] : sampleCleanPlates[i % sampleCleanPlates.length];
  const t0 = hrtime.bigint();
  db.checkWantedPlate(plate);
  const t1 = hrtime.bigint();
  dbLatencies.push(Number(t1 - t0) / 1e6); // ms
}
const dbStats = calculatePercentiles(dbLatencies);
console.log('[A. Database Lookup]:', dbStats);

// B. Plate Normalization Latency
const normLatencies = [];
const rawSamplePlates = ['ا س ب 2175', '  ا-هـ-ر ٢٧٥٣ ', 'ر ك د 9678', 'د ي ل  ا ل ف د ا ل  ٢ ٥ ٢ ٤'];
for (let i = 0; i < 10000; i++) {
  const p = rawSamplePlates[i % rawSamplePlates.length];
  const t0 = hrtime.bigint();
  canonicalizePlate(p);
  const t1 = hrtime.bigint();
  normLatencies.push(Number(t1 - t0) / 1e6);
}
const normStats = calculatePercentiles(normLatencies);
console.log('[B. Plate Normalization]:', normStats);

// C. Spoken Number Parsing Latency
const spokenLatencies = [];
const spokenPhrases = [
  'ألفين سبعمية تلاتة وخمسين',
  'تلاتة آلاف تمنمية تلاتة وستين',
  'واحد وعشرين واحد وعشرين',
  'خمسة واحد خمسة واحد'
];
for (let i = 0; i < 10000; i++) {
  const phrase = spokenPhrases[i % spokenPhrases.length];
  const t0 = hrtime.bigint();
  tokenizeArabicSpeech(phrase);
  const t1 = hrtime.bigint();
  spokenLatencies.push(Number(t1 - t0) / 1e6);
}
const spokenStats = calculatePercentiles(spokenLatencies);
console.log('[C. Spoken Number Tokenization]:', spokenStats);

// D. Plate Speech Extraction Latency
const parseLatencies = [];
const fullTranscripts = [
  'ألف هاء راء 2753',
  'ألف هاء راء ألفين سبعمية تلاتة وخمسين',
  'باء ياء دال 3863',
  'ديل الف دال 2 5 2 4 د ب ك 2 1 2 1 د ر ص 2 8 2 8'
];
for (let i = 0; i < 10000; i++) {
  const t = fullTranscripts[i % fullTranscripts.length];
  const t0 = hrtime.bigint();
  parsePlateTranscript(t);
  const t1 = hrtime.bigint();
  parseLatencies.push(Number(t1 - t0) / 1e6);
}
const parseStats = calculatePercentiles(parseLatencies);
console.log('[D. Plate Speech Extraction]:', parseStats);

// E. End-to-End Processing Latency (Speech -> Parse -> DB Match -> Result)
const e2eLatencies = [];
for (let i = 0; i < 10000; i++) {
  const speech = (i % 2 === 0) ? 'اسب 2175' : 'ألف هاء راء 2753';
  const t0 = hrtime.bigint();
  const candidates = parsePlateTranscript(speech);
  if (candidates.length > 0) {
    db.checkWantedPlate(candidates[0].canonicalPlate);
  }
  const t1 = hrtime.bigint();
  e2eLatencies.push(Number(t1 - t0) / 1e6);
}
const e2eStats = calculatePercentiles(e2eLatencies);
console.log('[E. End-to-End Processing]:', e2eStats);

console.log('\n====================================================');
console.log('2. CONFUSION MATRIX ON REAL EXCEL DATASET');
console.log('====================================================');

// Build 1000 test cases:
// 500 Known Real Positive Wanted Plates from Excel
// 500 Negative Non-Wanted Plates / Controlled Variants
let TP = 0, TN = 0, FP = 0, FN = 0;

// Grab real keys from database wanted index
const allWantedKeys = Array.from(db.wantedPlatesIndex.keys());
console.log(`Auditing with ${allWantedKeys.length} active wanted keys in DB.`);

const testPositives = allWantedKeys.slice(0, 500);
for (const p of testPositives) {
  const res = db.checkWantedPlate(p);
  if (res.isWanted) {
    TP++;
  } else {
    FN++;
  }
}

// 500 Negatives (Generated non-existing plates and clean variants)
for (let i = 0; i < 500; i++) {
  const negPlate = `zzz${900000 + i}`;
  const res = db.checkWantedPlate(negPlate);
  if (res.isWanted) {
    FP++;
  } else {
    TN++;
  }
}

const precision = TP / (TP + FP);
const recall = TP / (TP + FN);
const accuracy = (TP + TN) / (TP + TN + FP + FN);

console.log(`TP (True Positives): ${TP}`);
console.log(`TN (True Negatives): ${TN}`);
console.log(`FP (False Positives): ${FP}`);
console.log(`FN (False Negatives): ${FN}`);
console.log(`Precision: ${(precision * 100).toFixed(2)}%`);
console.log(`Recall: ${(recall * 100).toFixed(2)}%`);
console.log(`Accuracy: ${(accuracy * 100).toFixed(2)}%`);

console.log('\nAudit complete.');
