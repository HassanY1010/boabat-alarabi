const fs = require('fs');

const PYTHON_STT_URL = process.env.PYTHON_STT_URL || 'http://127.0.0.1:5001/transcribe';

function logSttConfiguration() {
  console.log('[STT][CONFIG] Provider: Local faster-whisper (Python microservice)');
  console.log('[STT][CONFIG] Service Endpoint: ' + PYTHON_STT_URL);
  console.log('[STT][CONFIG] Model: ' + (process.env.WHISPER_MODEL || 'base'));
  console.log('[STT][CONFIG] Device: ' + (process.env.WHISPER_DEVICE || 'cpu'));
  console.log('[STT][CONFIG] Compute Type: ' + (process.env.WHISPER_COMPUTE_TYPE || 'int8'));
  console.log('[STT][CONFIG] 100% Free & Local — Zero external API dependencies.');
}

async function transcribeAudioFile(filePath, originalFilename = 'speech.webm', mimeType = 'audio/webm') {
  if (!fs.existsSync(filePath)) {
    throw new Error('Audio file does not exist on disk.');
  }

  const fileStats = fs.statSync(filePath);
  if (fileStats.size === 0) {
    throw new Error('Uploaded audio file is empty (0 bytes).');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const audioBlob = new Blob([fileBuffer], { type: mimeType || 'audio/webm' });
  const filename = originalFilename || 'speech_chunk.webm';

  console.log('[VOICE][STT] Uploading audio to local faster-whisper service (' + PYTHON_STT_URL + ')');

  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, filename);

    const response = await fetch(PYTHON_STT_URL, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.success && data.text) {
        console.log('[VOICE][STT] Response received from faster-whisper');
        console.log('[VOICE][STT] Transcript: "' + data.text.trim() + '"');
        return {
          success: true,
          text: data.text.trim(),
          provider: 'local-faster-whisper',
          language: 'ar',
          model: data.model || process.env.WHISPER_MODEL || 'base'
        };
      } else {
        console.warn('[STT][BACKEND] faster-whisper returned non-success:', data);
        return {
          success: false,
          error: (data && data.error) || 'STT transcription failed',
          code: (data && data.code) || 'STT_TRANSCRIPTION_FAILED'
        };
      }
    } else {
      const errText = await response.text();
      console.warn('[STT][BACKEND] faster-whisper HTTP status:', response.status, errText);
      return {
        success: false,
        error: 'faster-whisper service returned HTTP ' + response.status,
        code: 'STT_HTTP_ERROR',
        statusCode: response.status
      };
    }
  } catch (err) {
    console.error('[STT][BACKEND] Connection to faster-whisper failed:', err.message);
    return {
      success: false,
      error: 'تعذر الاتصال بخدمة faster-whisper المحلية على (' + PYTHON_STT_URL + '). يرجى التأكد من تشغيل stt_service.',
      code: 'STT_SERVICE_UNAVAILABLE',
      statusCode: 503
    };
  }
}

module.exports = {
  transcribeAudioFile,
  logSttConfiguration,
  PYTHON_STT_URL
};
