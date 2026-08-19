const { AudioEngine } = require('../../public/js/audio_engine');
const { clientParsePlateTranscript } = require('../../public/js/plate_parser');

console.log('========================================================');
console.log('🧪 RUNNING CONTINUOUS SESSION AFTER SUCCESSFUL PLATE TEST');
console.log('========================================================');

// Mock Fake MediaRecorder
class FakeMediaRecorder {
  constructor(stream, opts) {
    this.stream = stream;
    this.opts = opts;
    this.state = 'inactive';
    this.mimeType = 'audio/webm';
  }
  start() {
    this.state = 'recording';
    if (this.ondataavailable) {
      this.ondataavailable({ data: { size: 3000 } });
    }
  }
  stop() {
    this.state = 'inactive';
    if (this.onstop) {
      this.onstop();
    }
  }
}
FakeMediaRecorder.isTypeSupported = () => true;
global.MediaRecorder = FakeMediaRecorder;
global.Blob = class { constructor(chunks, opts) { this.size = chunks.reduce((acc, c) => acc + (c.size || 2000), 0); } };
global.FormData = class { constructor() { this.data = {}; } append(k, v) { this.data[k] = v; } };
global.window = { clientPlateParser: { parsePlateTranscript: clientParsePlateTranscript } };
global.document = { getElementById: () => null };

async function runContinuousSessionTest() {
  let platesCreated = [];
  let idleCount = 0;

  let requestCount = 0;
  global.fetch = async (url, opts) => {
    requestCount++;
    const text = requestCount === 1 ? "دال ألف دال اثنين خمسة اثنين أربعة" : "ألف سين باء اثنين واحد سبعة خمسة";
    return {
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ success: true, text: text })
    };
  };

  const engine = new AudioEngine(
    async (text) => {
      const candidates = clientParsePlateTranscript(text);
      if (candidates.length > 0) {
        platesCreated.push(candidates[0].canonicalPlate);
      }
    },
    () => {},
    () => {}
  );

  // Hook state transition to track any forbidden IDLE transitions
  const origTransition = engine.transitionState.bind(engine);
  engine.transitionState = (newState) => {
    if (newState === 'IDLE') {
      idleCount++;
    }
    origTransition(newState);
  };

  // 1. Start Session
  engine.isListening = true;
  engine.sessionActive = true;
  engine.sessionToken = 1;
  engine.mediaStream = { getTracks: () => [] };
  engine.state = 'LISTENING';
  console.log('[TEST] Session Started -> state:', engine.state);

  // 2. Utterance 1 ("داد2524")
  console.log('\n--- Utterance 1: "داد2524" ---');
  engine.hasSpeech = true;
  engine.speechStartTime = Date.now() - 1000;
  engine.transitionState('RECORDING');
  engine.beginUtteranceRecording(1);

  engine.stopUtteranceRecording(1, 'silence');
  await new Promise(r => setTimeout(r, 60));

  console.log('[TEST] Post Utterance 1 state:', engine.state, '| sessionActive:', engine.sessionActive);

  if (engine.state !== 'LISTENING' || !engine.sessionActive) {
    console.error('❌ FAILED: Engine dropped out of active LISTENING after utterance 1! State:', engine.state);
    process.exit(1);
  }

  // 3. Utterance 2 ("اسب2175") immediately after without re-clicking start
  console.log('\n--- Utterance 2: "اسب2175" ---');
  engine.hasSpeech = true;
  engine.speechStartTime = Date.now() - 1000;
  engine.transitionState('RECORDING');
  engine.beginUtteranceRecording(1);

  engine.stopUtteranceRecording(1, 'silence');
  await new Promise(r => setTimeout(r, 60));

  console.log('[TEST] Post Utterance 2 state:', engine.state, '| sessionActive:', engine.sessionActive);

  if (engine.state !== 'LISTENING' || !engine.sessionActive) {
    console.error('❌ FAILED: Engine dropped out of active LISTENING after utterance 2! State:', engine.state);
    process.exit(1);
  }

  console.log('\n========================================================');
  if (platesCreated.length === 2 && platesCreated[0] === 'داد2524' && platesCreated[1] === 'اسب2175' && idleCount === 0) {
    console.log('🎉 CONTINUOUS SESSION TEST PASSED 100%!');
    console.log('   Plates processed in single uninterrupted session:', platesCreated);
    console.log('   Forbidden IDLE transitions during session: 0');
    process.exit(0);
  } else {
    console.error('❌ CONTINUOUS SESSION TEST FAILED: platesCreated=', platesCreated, 'idleCount=', idleCount);
    process.exit(1);
  }
}

runContinuousSessionTest();
