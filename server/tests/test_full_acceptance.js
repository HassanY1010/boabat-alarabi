const { parsePlateTranscript } = require('../plate_engine');
const db = require('../db');

console.log('================================================================');
console.log('🔴 FINAL ACCEPTANCE TEST — الاختبار الحقيقي لمسار الصوت الكامل');
console.log('================================================================\n');

async function runAcceptancePipeline(testName, spokenSpeech) {
  console.log('----------------------------------------------------------------');
  console.log('[TEST] ' + testName);
  console.log('[VOICE] Session Started');
  console.log('[VOICE] Microphone Listening');
  console.log('[VOICE] Speech Received: ' + spokenSpeech);
  console.log('[VOICE] Final Speech: ' + spokenSpeech);

  const candidates = parsePlateTranscript(spokenSpeech);
  if (!candidates || candidates.length === 0) {
    console.error('[FAIL] No plate detected from speech ' + spokenSpeech);
    return null;
  }

  const candidate = candidates[0];
  const lettersArray = candidate.letters.split(/\s+/).filter(Boolean);
  const digitsArray = candidate.digitsList || candidate.numbers.split(/\s+/).filter(Boolean);

  console.log('[VOICE] Parsed Letters:', JSON.stringify(lettersArray));
  console.log('[VOICE] Parsed Digits:', JSON.stringify(digitsArray));
  console.log('[VOICE] Plate Created: ' + candidate.canonicalPlate);

  const tableRecord = {
    id: 'scan-' + Date.now(),
    letters: candidate.letters,
    numbers: candidate.numbers,
    canonicalPlate: candidate.canonicalPlate,
    plateDisplay: candidate.plateDisplay,
    rawTranscript: spokenSpeech,
    status: 'VERIFYING',
    wanted: false
  };
  console.log('[VOICE] Table Record Created');

  console.log('[VOICE] Wanted Check Started: ' + candidate.canonicalPlate);
  const lookupResult = db.checkWantedPlate(candidate.canonicalPlate);
  const isWanted = lookupResult.isWanted;

  console.log('[VOICE] Wanted Check Result: ' + (isWanted ? 'FOUND' : 'NOT_FOUND'));

  tableRecord.status = isWanted ? 'WANTED' : 'CLEARED';
  tableRecord.wanted = isWanted;
  if (isWanted) {
    tableRecord.matchedVehicle = lookupResult.vehicle;
  }

  console.log('[VOICE] Table Row Updated');
  console.log('[VOICE] Final Status: ' + (isWanted ? 'WANTED' : 'SAFE'));

  const lettersFormatted = lettersArray.join(' | ');
  const digitsFormatted = digitsArray.join(' | ');
  const statusDisplay = isWanted ? '🚨 مطلوبة' : '✅ سليمة';

  console.log('\n📊 النتيجة الفعلية في جدول الجلسة:');
  console.log('┌───────────────┬─────────────────┬──────────────┬───────────────┐');
  console.log('│ الحروف        │ الأرقام         │ اللوحة       │ الحالة        │');
  console.log('├───────────────┼─────────────────┼──────────────┼───────────────┤');
  console.log('│ ' + lettersFormatted.padEnd(13) + ' │ ' + digitsFormatted.padEnd(15) + ' │ ' + candidate.canonicalPlate.padEnd(12) + ' │ ' + statusDisplay.padEnd(13) + ' │');
  console.log('└───────────────┴─────────────────┴──────────────┴───────────────┘\n');

  return { candidate, isWanted, lettersFormatted, digitsFormatted };
}

async function main() {
  const count = db.wantedPlatesIndex.size;
  console.log('[DB] Database Ready. Total Loaded Wanted Vehicles: ' + count + '\n');

  const res1 = await runAcceptancePipeline(
    'اختبار 1: لوحة غير مطلوبة (سليمة)',
    'دال ألف دال اثنين خمسة اثنين أربعة'
  );

  const res2 = await runAcceptancePipeline(
    'اختبار 2: لوحة مطلوبة في قاعدة البيانات (اسب2175)',
    'ألف سين باء اثنين واحد سبعة خمسة'
  );

  const res3 = await runAcceptancePipeline(
    'اختبار 3: اللهجة المصرية (اتنين / اربعة)',
    'دال ألف دال اتنين خمسة اتنين أربعة'
  );

  const res4 = await runAcceptancePipeline(
    'اختبار 4: النطق المتواصل السريع',
    'دال الف دال اتنين خمسة اتنين اربعة'
  );

  const pass1 = res1 && res1.candidate.canonicalPlate === 'داد2524' && !res1.isWanted;
  const pass2 = res2 && res2.candidate.canonicalPlate === 'اسب2175' && res2.isWanted;
  const pass3 = res3 && res3.candidate.canonicalPlate === 'داد2524' && !res3.isWanted;
  const pass4 = res4 && res4.candidate.canonicalPlate === 'داد2524' && !res4.isWanted;

  if (pass1 && pass2 && pass3 && pass4) {
    console.log('================================================================');
    console.log('🎉 جميع الاختبارات الإلزامية لمسار الصوت والجدول نجحت 100%!');
    console.log('================================================================');
  } else {
    console.error('❌ Some tests failed.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error during test execution:', err);
  process.exit(1);
});
