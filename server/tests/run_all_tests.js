/**
 * Boabat Al-Arabi - Automated Comprehensive Test Suite
 */

const assert = require('assert');
const path = require('path');
const xlsx = require('xlsx');
const {
  normalizeArabicLetters,
  normalizeDigits,
  parsePlateTranscript,
  canonicalizePlate
} = require('../plate_engine');
const db = require('../db');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${desc}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✘ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
  }
}

function describe(suiteName, fn) {
  console.log(`\n========================================`);
  console.log(`[TEST SUITE] ${suiteName}`);
  console.log(`========================================`);
  fn();
}

// 1. Arabic Normalization & Letter Mapping
describe('1. Arabic Normalization & Letter Mapping', () => {
  it('Should normalize various Alif forms and tatweel', () => {
    assert.strictEqual(normalizeArabicLetters('أحمد'), 'احمد');
    assert.strictEqual(normalizeArabicLetters('إبراهيم'), 'ابراهيم');
    assert.strictEqual(normalizeArabicLetters('آدم'), 'ادم');
    assert.strictEqual(normalizeArabicLetters('اـهـر'), 'اهر');
  });

  it('Should normalize Eastern Arabic numerals to Western digits', () => {
    assert.strictEqual(normalizeDigits('٢٧٥٣'), '2753');
    assert.strictEqual(normalizeDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  });

  it('Should canonicalize plate strings reliably', () => {
    assert.strictEqual(canonicalizePlate('ا س ب 2175'), 'اسب2175');
    assert.strictEqual(canonicalizePlate('ا-هـ-ر ٢٧٥٣'), 'اهر2753');
    assert.strictEqual(canonicalizePlate('  ر ك د 9678  '), 'ركد9678');
  });
});

// 2. Egyptian Dialect & Spoken Arabic Plate Parsing
describe('2. Spoken Arabic & Egyptian Dialect Plate Parsing', () => {
  it('Should parse Standard single letters: "ألف هاء راء 2753"', () => {
    const res = parsePlateTranscript('ألف هاء راء 2753');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].canonicalPlate, 'اهر2753');
    assert.strictEqual(res[0].lettersCanonical, 'اهر');
    assert.strictEqual(res[0].numbers, '2753');
  });

  it('Should parse Spoken Compound Egyptian numbers: "ألف هاء راء ألفين سبعمية تلاتة وخمسين"', () => {
    const res = parsePlateTranscript('ألف هاء راء ألفين سبعمية تلاتة وخمسين');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].canonicalPlate, 'اهر2753');
    assert.strictEqual(res[0].numbers, '2753');
  });

  it('Should parse colloquial letter names: "باء ياء دال 3863"', () => {
    const res = parsePlateTranscript('باء ياء دال 3863');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].canonicalPlate, 'بيد3863');
  });

  it('Should parse connected plate text with noise words: "السيارة هناك شوف ا هـ ر ٢٧٥٣"', () => {
    const res = parsePlateTranscript('السيارة هناك شوف ا هـ ر ٢٧٥٣');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].canonicalPlate, 'اهر2753');
  });

  it('Should parse multiple plates in continuous stream (Video demo reproduction)', () => {
    const videoSpeech = 'ديل الف دال 2 5 2 4 د ب ك 2 1 2 1 د ر ص 2 8 2 8 د ع د 5 1 5 1 د ر ب 27 27 د ك ن 2 7 2 7 د و ع 5 1 5 1 د ر ب 2 3 2 3 ي ص ن 0 5 0 5';
    const res = parsePlateTranscript(videoSpeech);
    assert.strictEqual(res.length, 9);
    assert.strictEqual(res[0].canonicalPlate, 'داد2524');
    assert.strictEqual(res[1].canonicalPlate, 'دبك2121');
    assert.strictEqual(res[2].canonicalPlate, 'درص2828');
    assert.strictEqual(res[3].canonicalPlate, 'دعد5151');
    assert.strictEqual(res[4].canonicalPlate, 'درب2727');
    assert.strictEqual(res[5].canonicalPlate, 'دكن2727');
    assert.strictEqual(res[6].canonicalPlate, 'دوع5151');
    assert.strictEqual(res[7].canonicalPlate, 'درب2323');
    assert.strictEqual(res[8].canonicalPlate, 'يصن0505');
  });
});

// 3. Database & Wanted Matching
describe('3. Database & Wanted Matching against file.xlsx', () => {
  it('Should have loaded active dataset with 67,000+ vehicles', () => {
    const active = db.datasets.find(d => d.id === db.activeDatasetId);
    assert.ok(active, 'Active dataset must exist');
    assert.ok(active.totalRecords > 60000, `Expected >60000 records, got ${active.totalRecords}`);
    assert.strictEqual(active.totalSheets, 2);
  });

  it('Should match known wanted vehicle: اسب2175', () => {
    const check = db.checkWantedPlate('اسب 2175');
    assert.strictEqual(check.isWanted, true);
    assert.strictEqual(check.vehicle.vehicleType, 'شاحنة');
    assert.strictEqual(check.vehicle.bank, 'طلال السديس');
    assert.strictEqual(check.vehicle.vin, 'KLUKH2T41PK000154');
  });

  it('Should match known wanted vehicle: ركد9678', () => {
    const check = db.checkWantedPlate('ركد 9678');
    assert.strictEqual(check.isWanted, true);
    assert.strictEqual(check.vehicle.vehicleType, 'Taurus');
  });

  it('Should return CLEARED for non-wanted plate: داد2524', () => {
    const check = db.checkWantedPlate('داد 2524');
    assert.strictEqual(check.isWanted, false);
  });
});

// 4. Session Tracking & Excel Export
describe('4. Session Tracking & Excel Export', () => {
  let session = null;

  it('Should create a new session', () => {
    session = db.createSession({ operator: 'مختبر الجودة' });
    assert.ok(session.id.startsWith('SES-'));
    assert.strictEqual(session.status, 'ACTIVE');
  });

  it('Should record a scan and update session stats', () => {
    const scan = db.recordScan({
      sessionId: session.id,
      letters: 'ا س ب',
      numbers: '2175',
      canonicalPlate: 'اسب2175',
      latitude: 24.7136,
      longitude: 46.6753,
      gpsAccuracy: 5
    });

    assert.strictEqual(scan.wanted, true);
    assert.strictEqual(scan.status, 'WANTED');
    assert.strictEqual(session.wantedCount, 1);
    assert.strictEqual(session.totalScans, 1);
  });

  it('Should generate valid Excel buffer for session export', () => {
    const buffer = db.generateSessionExcel(session.id);
    assert.ok(buffer && buffer.length > 0);

    const wb = xlsx.read(buffer, { type: 'buffer' });
    assert.strictEqual(wb.SheetNames.length, 1);
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    assert.ok(rows.length >= 1);
    assert.strictEqual(rows[0]['الحالة'], 'مطلوبة ⚠️');
  });

  it('Should end session cleanly', () => {
    const ended = db.endSession(session.id);
    assert.strictEqual(ended.status, 'COMPLETED');
    assert.ok(ended.endedAt !== null);
  });
});

// Summary
console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
console.log(`========================================\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
