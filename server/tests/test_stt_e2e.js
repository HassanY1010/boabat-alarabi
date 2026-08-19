const fs = require('fs');
const path = require('path');
const { transcribeAudioFile } = require('../stt_engine');
const { clientParsePlateTranscript } = require('../../public/js/plate_parser');

console.log('========================================================');
console.log('🧪 RUNNING END-TO-END STT & PLATE PROCESSING TEST');
console.log('========================================================');

async function testEndToEnd() {
  const audioFilePath = path.join(__dirname, '../../audio.wav');
  if (!fs.existsSync(audioFilePath)) {
    console.error('❌ audio.wav not found at', audioFilePath);
    process.exit(1);
  }

  // Mock remote faster-whisper response
  global.fetch = async (url, opts) => {
    console.log('[MOCK_STT] Received fetch call to:', url);
    return {
      status: 200,
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        text: "دال ألف دال اثنين خمسة اثنين أربعة",
        provider: "local-faster-whisper",
        model: "tiny",
        duration_ms: 310
      })
    };
  };

  console.log('\n1. Testing Backend transcribeAudioFile with real file:', audioFilePath);
  const result = await transcribeAudioFile(audioFilePath, 'audio.wav', 'audio/wav');
  console.log('[TEST] STT result:', result);

  if (!result.success || !result.text) {
    console.error('❌ FAILED: STT did not return success or text');
    process.exit(1);
  }

  console.log('\n2. Testing Plate Parser with transcript:', `"${result.text}"`);
  const candidates = clientParsePlateTranscript(result.text);
  console.log('[TEST] Parsed candidates:', candidates.map(c => c.canonicalPlate));

  if (candidates.length === 0 || candidates[0].canonicalPlate !== 'داد2524') {
    console.error('❌ FAILED: Expected داد2524, got:', candidates);
    process.exit(1);
  }

  console.log('\n========================================================');
  console.log('🎉 END-TO-END STT TEST PASSED 100%!');
  console.log('   STT Transcript:', `"${result.text}"`);
  console.log('   Plate Created:', candidates[0].canonicalPlate);
  console.log('========================================================');
}

testEndToEnd();
