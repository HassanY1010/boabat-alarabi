const { clientParsePlateTranscript } = require('../../public/js/plate_parser');

const testCases = [
  {
    input: "دال ألف دال اثنين خمسة اثنين أربعة",
    expected: "داد2524"
  },
  {
    input: "ألف سين باء اثنين واحد سبعة خمسة",
    expected: "اسب2175"
  },
  {
    input: "دال ألف دال اثنين خمسة اثنين أربعة، دال ألف دال",
    expected: "داد2524"
  },
  {
    input: "دال ألف دال 2 5 2 4",
    expected: "داد2524"
  },
  {
    input: "دال ألف دال اثنان خمسة اثنان أربعة",
    expected: "داد2524"
  },
  {
    input: "دال الف دال اتنين خمسة اتنين اربعة",
    expected: "داد2524"
  },
  {
    input: "دال ألف دال ٢٥٢٤",
    expected: "داد2524"
  }
];

console.log('========================================================');
console.log('🧪 RUNNING DETERMINISTIC PLATE PARSER UNIT TESTS');
console.log('========================================================');

let allPassed = true;

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  console.log('\n[CASE #' + (i + 1) + '] Input: "' + tc.input + '"');
  const candidates = clientParsePlateTranscript(tc.input);
  if (candidates.length === 0) {
    console.error('❌ FAILED: No candidate extracted! Expected: ' + tc.expected);
    allPassed = false;
    continue;
  }

  const selected = candidates[0];
  const passed = selected.canonicalPlate === tc.expected;

  if (passed) {
    console.log('✅ PASSED: Generated ' + selected.canonicalPlate + ' (Letters: ' + selected.lettersCanonical + ', Numbers: ' + selected.numbersCanonical + ')');
  } else {
    console.error('❌ FAILED: Got ' + selected.canonicalPlate + ', Expected: ' + tc.expected);
    allPassed = false;
  }
}

console.log('\n========================================================');
if (allPassed) {
  console.log('🎉 ALL UNIT TESTS PASSED (100% ACCURACY)!');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
