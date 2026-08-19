const { AudioEngine } = require('../../public/js/audio_engine');
const { clientParsePlateTranscript } = require('../../public/js/plate_parser');

console.log('========================================================');
console.log('🧪 RUNNING VOICE STATE MACHINE UNIT TESTS');
console.log('========================================================');

let allPassed = true;

// Mock Fake MediaRecorder
class FakeMediaRecorder {
  constructor(stream, opts) {
    this.stream = stream;
    this.opts = opts;
    this.state = 'inactive';
    this.mimeType = 'audio/webm';
    this.stopCallCount = 0;
  }
  start() {
    this.state = 'recording';
    if (this.ondataavailable) {
      this.ondataavailable({ data: { size: 3000 } });
    }
  }
  stop() {
    this.stopCallCount++;
    this.state = 'inactive';
    if (this.onstop) {
      this.onstop();
    }
  }
}
global.MediaRecorder = FakeMediaRecorder;
global.Blob = class { constructor(chunks, opts) { this.size = chunks.reduce((acc, c) => acc + (c.size || 2000), 0); } };
global.FormData = class { constructor() { this.data = {}; } append(k, v) { this.data[k] = v; } };
global.window = { clientPlateParser: { parsePlateTranscript: clientParsePlateTranscript } };
global.document = { getElementById: () => null };

async function runTests() {
  // --- TEST CASE 1: Speech + Silence -> STT -> Valid Plate -> Next Cycle ---
  console.log('\n[CASE #1] Speech + Silence -> Valid Plate -> Processing -> Next Cycle');
  {
    let sttCalled = 0;
    let processCalled = 0;
    global.fetch = async (url, opts) => {
      sttCalled++;
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ success: true, text: "دال ألف دال اثنين خمسة اثنين أربعة" })
      };
    };

    const engine = new AudioEngine(
      async (text) => {
        processCalled++;
        const candidates = clientParsePlateTranscript(text);
        if (candidates.length > 0) {
          console.log('  [APP] Created plate:', candidates[0].canonicalPlate);
        }
      },
      () => {},
      () => {}
    );
    engine.isListening = true;
    engine.sessionActive = true;
    engine.sessionToken = 1;
    engine.mediaStream = { getTracks: () => [] };
    engine.state = 'LISTENING';

    // Simulate Speech
    engine.hasSpeech = true;
    engine.speechStartTime = Date.now() - 1000;
    engine.transitionState('RECORDING');
    engine.beginUtteranceRecording(1);

    // Simulate Silence
    engine.stopUtteranceRecording(1, 'silence');
    await new Promise(r => setTimeout(r, 50));

    if (sttCalled === 1 && processCalled === 1 && engine.state === 'LISTENING') {
      console.log('✅ CASE 1 PASSED: Exactly 1 STT request, 1 processSpokenText call, returned to LISTENING');
    } else {
      console.error('❌ CASE 1 FAILED: sttCalled=' + sttCalled + ', processCalled=' + processCalled + ', state=' + engine.state);
      allPassed = false;
    }
  }

  // --- TEST CASE 2: No Speech -> Discard Silent Recording -> No STT ---
  console.log('\n[CASE #2] No Speech -> Discard Recording -> No STT');
  {
    let sttCalled = 0;
    global.fetch = async () => { sttCalled++; return { status: 200, ok: true, text: async () => '{}' }; };

    const engine = new AudioEngine(() => {}, () => {}, () => {});
    engine.isListening = true;
    engine.sessionActive = true;
    engine.sessionToken = 2;
    engine.mediaStream = { getTracks: () => [] };
    engine.state = 'RECORDING';
    engine.hasSpeech = false; // No speech detected!
    engine.beginUtteranceRecording(2);

    engine.stopUtteranceRecording(2, 'silence');
    await new Promise(r => setTimeout(r, 50));

    if (sttCalled === 0 && engine.state === 'LISTENING') {
      console.log('✅ CASE 2 PASSED: 0 STT calls, discarded silent recording cleanly');
    } else {
      console.error('❌ CASE 2 FAILED: sttCalled=' + sttCalled + ', state=' + engine.state);
      allPassed = false;
    }
  }

  // --- TEST CASE 3: Incomplete Transcript -> No Table Row Created ---
  console.log('\n[CASE #3] Speech + Incomplete Transcript -> No Plate -> Return to LISTENING');
  {
    let sttCalled = 0;
    let plateCreated = 0;
    global.fetch = async () => {
      sttCalled++;
      return { status: 200, ok: true, text: async () => JSON.stringify({ success: true, text: "دال ألف دال" }) };
    };

    const engine = new AudioEngine(
      async (text) => {
        const candidates = clientParsePlateTranscript(text);
        if (candidates.length > 0) {
          plateCreated++;
        }
      },
      () => {},
      () => {}
    );
    engine.isListening = true;
    engine.sessionActive = true;
    engine.sessionToken = 3;
    engine.mediaStream = { getTracks: () => [] };
    engine.hasSpeech = true;
    engine.state = 'RECORDING';
    engine.beginUtteranceRecording(3);

    engine.stopUtteranceRecording(3, 'silence');
    await new Promise(r => setTimeout(r, 50));

    if (sttCalled === 1 && plateCreated === 0 && engine.state === 'LISTENING') {
      console.log('✅ CASE 3 PASSED: Incomplete transcript rejected without table row');
    } else {
      console.error('❌ CASE 3 FAILED: plateCreated=' + plateCreated + ', state=' + engine.state);
      allPassed = false;
    }
  }

  // --- TEST CASE 4: Repeated Silence Callbacks -> Exactly one stop() call ---
  console.log('\n[CASE #4] Repeated Silence Callbacks -> Exactly 1 stop() call');
  {
    const engine = new AudioEngine(() => {}, () => {}, () => {});
    engine.isListening = true;
    engine.sessionToken = 4;
    engine.mediaStream = { getTracks: () => [] };
    engine.hasSpeech = true;
    engine.state = 'RECORDING';
    engine.beginUtteranceRecording(4);

    const recorder = engine.activeRecorder;
    engine.stopUtteranceRecording(4, 'silence');
    engine.stopUtteranceRecording(4, 'silence');
    engine.stopUtteranceRecording(4, 'silence');

    if (recorder.stopCallCount === 1) {
      console.log('✅ CASE 4 PASSED: Exactly 1 recorder.stop() called despite 3 triggers');
    } else {
      console.error('❌ CASE 4 FAILED: recorder.stopCallCount=' + recorder.stopCallCount);
      allPassed = false;
    }
  }

  // --- TEST CASE 5: Guard during TRANSCRIBING ---
  console.log('\n[CASE #5] TRANSCRIBING in progress -> VAD cannot trigger new recording');
  {
    const engine = new AudioEngine(() => {}, () => {}, () => {});
    engine.isListening = true;
    engine.sessionToken = 5;
    engine.state = 'TRANSCRIBING';

    engine.beginUtteranceRecording(5);

    if (engine.state === 'TRANSCRIBING' && !engine.isRecording) {
      console.log('✅ CASE 5 PASSED: Recording blocked during active STT transcription');
    } else {
      console.error('❌ CASE 5 FAILED: State changed inappropriately: ' + engine.state);
      allPassed = false;
    }
  }

  console.log('\n========================================================');
  if (allPassed) {
    console.log('🎉 ALL STATE MACHINE UNIT TESTS PASSED (100% ACCURACY)!');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED');
    process.exit(1);
  }
}

runTests();
