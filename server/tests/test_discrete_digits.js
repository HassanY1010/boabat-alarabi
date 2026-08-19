const { parsePlateTranscript } = require('../plate_engine');

console.log('=== END-TO-END DISCRETE DIGITS & SLOTS TEST ===');

const testCases = [
  {
    name: 'Test 01: دال ألف دال اثنين خمسة اثنين أربعة',
    input: 'دال ألف دال اثنين خمسة اثنين أربعة',
    expectedLetters: 'د ا د',
    expectedDigitsList: ['2', '5', '2', '4'],
    expectedCanonical: 'داد2524'
  },
  {
    name: 'Test 02: ألف سين باء اثنين واحد سبعة خمسة',
    input: 'ألف سين باء اثنين واحد سبعة خمسة',
    expectedLetters: 'ا س ب',
    expectedDigitsList: ['2', '1', '7', '5'],
    expectedCanonical: 'اسب2175'
  },
  {
    name: 'Test 03: دال ألف دال 2 5 2 4 (STT Direct Digits)',
    input: 'دال ألف دال 2 5 2 4',
    expectedLetters: 'د ا د',
    expectedDigitsList: ['2', '5', '2', '4'],
    expectedCanonical: 'داد2524'
  },
  {
    name: 'Test 04: دال الف دال ٢ ٥ ٢ ٤ (Arabic Numerals)',
    input: 'دال الف دال ٢ ٥ ٢ ٤',
    expectedLetters: 'د ا د',
    expectedDigitsList: ['2', '5', '2', '4'],
    expectedCanonical: 'داد2524'
  },
  {
    name: 'Test 05: يه صاد نون صفر خمسة صفر خمسة (Zero Five)',
    input: 'يه صاد نون صفر خمسة صفر خمسة',
    expectedLetters: 'ي ص ن',
    expectedDigitsList: ['0', '5', '0', '5'],
    expectedCanonical: 'يصن0505'
  }
];

let allPassed = true;

testCases.forEach((tc, idx) => {
  const results = parsePlateTranscript(tc.input);
  if (results.length === 0) {
    console.error(`[FAIL] ${tc.name} -> No plate detected.`);
    allPassed = false;
    return;
  }

  const p = results[0];
  const lettersMatch = p.letters === tc.expectedLetters;
  const digitsMatch = JSON.stringify(p.digitsList) === JSON.stringify(tc.expectedDigitsList);
  const canonicalMatch = p.canonicalPlate === tc.expectedCanonical;

  // Verify UI slot formatting:
  const lettersFormatted = p.letters.split(/\s+/).filter(Boolean).join(' | ');
  const digitsFormatted = p.digitsList.join(' | ');

  if (lettersMatch && digitsMatch && canonicalMatch) {
    console.log(`[PASS ${idx+1}] ${tc.name}`);
    console.log(`       - Raw Input: "${tc.input}"`);
    console.log(`       - Discrete Letters: [${p.letters.split(' ').map(l => '"'+l+'"').join(', ')}] -> UI: ${lettersFormatted}`);
    console.log(`       - Discrete Digits:  [${p.digitsList.map(d => '"'+d+'"').join(', ')}] -> UI: ${digitsFormatted}`);
    console.log(`       - Canonical Index:  "${p.canonicalPlate}"`);
  } else {
    console.error(`[FAIL ${idx+1}] ${tc.name}: Letters Match=${lettersMatch}, Digits Match=${digitsMatch}, Canonical Match=${canonicalMatch}`);
    console.error('       Got:', p);
    allPassed = false;
  }
});

if (allPassed) {
  console.log('\n🌟 ALL 5 STRICT DISCRETE DIGIT TESTS PASSED 100%!');
} else {
  process.exit(1);
}
