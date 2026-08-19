const fs = require('fs');

function getPythonSttUrl() {
  let url = (process.env.PYTHON_STT_URL || 'http://127.0.0.1:5001/transcribe').trim();
  url = url.replace(/\/+$/, '');
  if (!url.endsWith('/transcribe')) {
    url += '/transcribe';
  }
  return url;
}

function logSttConfiguration() {
  const serviceUrl = getPythonSttUrl();
  console.log('[STT][CONFIG] Provider: Local faster-whisper (Python microservice)');
  console.log('[STT][CONFIG] Service Endpoint: ' + serviceUrl);
  console.log('[STT][CONFIG] Model: ' + (process.env.WHISPER_MODEL || 'tiny'));
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
  const serviceUrl = getPythonSttUrl();

  console.log('[STT][NODE] Calling Python STT at', serviceUrl);

  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, filename);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('[VOICE][STT][TIMEOUT] faster-whisper request timed out after 60s');
      controller.abort();
    }, 60000);

    const response = await fetch(serviceUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    console.log(`[STT][NODE] Python response status=${response.status}`);

    if (response.ok) {
      const data = await response.json();
      console.log('[STT][NODE] Python response body=', data);

      if (data && data.success && typeof data.text === 'string') {
        const text = data.text.trim();
        console.log('[VOICE][STT] Response received from faster-whisper');
        console.log('[VOICE][STT] Transcript: "' + text + '"');
        return {
          success: true,
          text: text,
          provider: 'local-faster-whisper',
          language: 'ar',
          model: data.model || process.env.WHISPER_MODEL || 'tiny'
        };
      } else {
        console.warn('[STT][NODE] faster-whisper returned non-success:', data);
        return {
          success: false,
          error: (data && data.error) || 'STT transcription failed',
          code: (data && data.code) || 'STT_TRANSCRIPTION_FAILED'
        };
      }
    } else {
      const errText = await response.text();
      console.warn('[STT][NODE] faster-whisper HTTP status error:', response.status, errText);
      return {
        success: false,
        error: 'faster-whisper service returned HTTP ' + response.status,
        code: 'STT_HTTP_ERROR',
        statusCode: response.status
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[VOICE][STT][TIMEOUT] Request aborted due to timeout');
      return {
        success: false,
        error: 'انتهت مهلة معالجة الصوت (60 ثانية).',
        code: 'STT_TIMEOUT',
        statusCode: 504
      };
    }
    console.error('[STT][BACKEND] Connection to faster-whisper failed:', err.message);
    return {
      success: false,
      error: 'تعذر الاتصال بخدمة faster-whisper المحلية على (' + serviceUrl + '). يرجى التأكد من تشغيل stt_service.',
      code: 'STT_SERVICE_UNAVAILABLE',
      statusCode: 503
    };
  }
}

module.exports = {
  transcribeAudioFile,
  logSttConfiguration,
  getPythonSttUrl
};
