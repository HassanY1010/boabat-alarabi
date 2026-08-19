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
    console.error('[STT][ERROR] Audio file does not exist on disk:', filePath);
    throw new Error('Audio file does not exist on disk.');
  }

  const fileStats = fs.statSync(filePath);
  if (fileStats.size === 0) {
    console.error('[STT][ERROR] Uploaded audio file is empty (0 bytes)');
    throw new Error('Uploaded audio file is empty (0 bytes).');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const audioBlob = new Blob([fileBuffer], { type: mimeType || 'audio/webm' });
  const filename = originalFilename || 'speech_chunk.webm';
  const serviceUrl = getPythonSttUrl();

  console.log(`[STT][REQUEST] Audio received size=${fileStats.size} bytes filename="${filename}" mime="${mimeType}"`);
  console.log(`[STT][SERVICE_URL] ${serviceUrl}`);

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[STT][FORWARD] Forwarding audio to faster-whisper (attempt ${attempt}/${maxAttempts})...`);
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

      console.log(`[STT][RESPONSE_STATUS] ${response.status}`);

      if (response.status === 502 || response.status === 503) {
        const rawErr = await response.text();
        console.log(`[STT][RESPONSE_BODY] HTTP ${response.status}: ${rawErr.slice(0, 200)}`);
        console.warn(`[STT][ERROR] faster-whisper returned ${response.status}. Container may be waking up from cold start. Retrying in 2s...`);
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return {
          success: false,
          error: `faster-whisper service returned HTTP ${response.status} (Gateway/Service Unavailable).`,
          code: 'STT_BAD_GATEWAY',
          statusCode: response.status
        };
      }

      const rawText = await response.text();
      console.log(`[STT][RESPONSE_BODY] ${rawText}`);

      if (response.ok) {
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (jsonErr) {
          console.error('[STT][ERROR] Failed to parse JSON from faster-whisper:', jsonErr.message);
          return {
            success: false,
            error: 'Invalid JSON response from STT service',
            code: 'STT_INVALID_JSON',
            statusCode: 500
          };
        }

        if (data && data.success && typeof data.text === 'string') {
          const text = data.text.trim();
          console.log(`[VOICE][STT] Transcript: "${text}"`);
          return {
            success: true,
            text: text,
            provider: 'local-faster-whisper',
            language: 'ar',
            model: data.model || process.env.WHISPER_MODEL || 'tiny',
            duration_ms: data.duration_ms || 0
          };
        } else {
          console.warn('[STT][ERROR] faster-whisper returned non-success:', data);
          return {
            success: false,
            error: (data && data.error) || 'STT transcription failed',
            code: (data && data.code) || 'STT_TRANSCRIPTION_FAILED'
          };
        }
      } else {
        console.warn(`[STT][ERROR] faster-whisper HTTP error ${response.status}: ${rawText}`);
        return {
          success: false,
          error: 'faster-whisper service returned HTTP ' + response.status,
          code: 'STT_HTTP_ERROR',
          statusCode: response.status
        };
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('[STT][ERROR] Request aborted due to 60s timeout');
        return {
          success: false,
          error: 'انتهت مهلة معالجة الصوت (60 ثانية).',
          code: 'STT_TIMEOUT',
          statusCode: 504
        };
      }
      console.error(`[STT][ERROR] Attempt ${attempt} failed:`, err.message);
      lastError = err;
      if (attempt < maxAttempts) {
        console.log(`[STT][RETRY] Waiting 2s before retry ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  console.error('[STT][ERROR] All connection attempts to faster-whisper failed:', lastError ? lastError.message : 'Unknown');
  return {
    success: false,
    error: 'تعذر الاتصال بخدمة faster-whisper على (' + serviceUrl + '). يرجى التأكد من تشغيل الخدمة.',
    code: 'STT_SERVICE_UNAVAILABLE',
    statusCode: 503
  };
}

module.exports = {
  transcribeAudioFile,
  logSttConfiguration,
  getPythonSttUrl
};
