const { clientParsePlateTranscript, validatePlateCandidate } = require('../../public/js/plate_parser');

console.log('========================================================');
console.log('🧪 RUNNING RIGOROUS PLATE VALIDATION & SAFETY UNIT TESTS');
console.log('========================================================');

let allPassed = true;

const testCases = [
  {
    name: 'Case 1: Standard Arabic digits with mixed colloquial terms',
    input: 'دال ألف دال تنين خمسة اثنين أربعة',
    expectedPlate: 'داد2524',
    shouldBeValid: true
  },
  {
    name: 'Case 2: Standard Arabic digits',
    input: 'دال ألف دال اثنين خمسة اثنين أربعة',
    expectedPlate: 'داد2524',
    shouldBeValid: true
  },
  {
    name: 'Case 3: Whisper Hallucination repetition of the same plate',
    input: 'دال ألف دال تنين خمسة اثنين أربعة، دال ألف دال تنين خمسة اثنين أربعة',
    expectedPlate: 'داد2524',
    expectedCandidateCount: 1,
    shouldBeValid: true
  },
  {
    name: 'Case 4: Runaway Eastern Arabic repeated digits hallucination',
    input: 'سين باء ٢٢٢٢٢٢٢٢٢٢٢٢٢٢٢٢',
    expectedPlate: null,
    shouldBeValid: false
  },
  {
    name: 'Case 5: Runaway ASCII repeated digits hallucination',
    input: 'سين باء 222222222222',
    expectedPlate: null,
    shouldBeValid: false
  },
  {
    name: 'Case 6: Incomplete plate (letters only)',
    input: 'دال ألف دال',
    expectedPlate: null,
    shouldBeValid: false
  },
  {
    name: 'Case 7: Incomplete plate (letters + 2 digits only)',
    input: 'دال ألف دال اثنين خمسة',
    expectedPlate: null,
    shouldBeValid: false
  },
  {
    name: 'Case 8: Direct digits in transcript',
    input: 'دال ألف دال 2524',
    expectedPlate: 'داد2524',
    shouldBeValid: true
  },
  {
    name: 'Case 9: Valid plate with trailing ambient noise',
    input: 'دال ألف دال اثنين خمسة اثنين أربعة سيارة عربية',
    expectedPlate: 'داد2524',
    shouldBeValid: true
  }
];

for (const [idx, tc] of testCases.entries()) {
  console.log('\n[TEST #' + (idx + 1) + '] ' + tc.name);
  console.log('  Input: "' + tc.input + '"');
  const candidates = clientParsePlateTranscript(tc.input);

  if (tc.shouldBeValid) {
    if (candidates.length === 0) {
      console.error('❌ FAILED: Expected valid plate ' + tc.expectedPlate + ' but got 0 candidates');
      allPassed = false;
    } else {
      const selected = candidates[0].canonicalPlate;
      if (selected === tc.expectedPlate) {
        if (tc.expectedCandidateCount && candidates.length !== tc.expectedCandidateCount) {
          console.error('❌ FAILED: Expected candidate count ' + tc.expectedCandidateCount + ', got ' + candidates.length);
          allPassed = false;
        } else {
          console.log('✅ PASSED: Successfully extracted unique valid plate: ' + selected);
        }
      } else {
        console.error('❌ FAILED: Got ' + selected + ', expected ' + tc.expectedPlate);
        allPassed = false;
      }
    }
  } else {
    if (candidates.length === 0) {
      console.log('✅ PASSED: Correctly REJECTED invalid / incomplete input (0 candidates)');
    } else {
      console.error('❌ FAILED: Should have rejected, but produced: ' + candidates.map(c => c.canonicalPlate).join(', '));
      allPassed = false;
    }
  }
}

// Test 10: Deduplication verification
console.log('\n[TEST #10] Exact candidate deduplication');
{
  const transcriptWithReps = "دال ألف دال اثنين خمسة اثنين أربعة، دال ألف دال اثنين خمسة اثنين أربعة";
  const candidates = clientParsePlateTranscript(transcriptWithReps);
  if (candidates.length === 1 && candidates[0].canonicalPlate === 'داد2524') {
    console.log('✅ PASSED: Deduplicated identical candidate into exactly 1 item');
  } else {
    console.error('❌ FAILED: Deduplication failed, candidates count: ' + candidates.length);
    allPassed = false;
  }
}

console.log('\n========================================================');
if (allPassed) {
  console.log('🎉 ALL 10 VALIDATION & SAFETY UNIT TESTS PASSED (100% ACCURACY)!');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
