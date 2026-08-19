const fs = require('fs');

function logSttConfiguration() {
  const hasGroq = !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
  const hasOpenAI = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());

  console.log('[STT][CONFIG] GROQ_API_KEY configured: ' + hasGroq);
  console.log('[STT][CONFIG] OPENAI_API_KEY configured: ' + hasOpenAI);

  if (hasGroq) {
    console.log('[STT][CONFIG] Active Primary Provider: GROQ (whisper-large-v3)');
  } else if (hasOpenAI) {
    console.log('[STT][CONFIG] Active Primary Provider: OPENAI (whisper-1)');
  } else {
    console.log('[STT][CONFIG] No STT API keys configured in environment.');
  }
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

  // 1. Primary Provider: Groq Whisper API (whisper-large-v3)
  const groqKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;
  if (groqKey) {
    try {
      console.log('[VOICE][STT] Provider configured: GROQ');
      console.log('[VOICE][STT] Uploading audio');

      const formData = new FormData();
      formData.append('file', audioBlob, filename);
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'ar');
      formData.append('prompt', 'لوحة سيارة عربية: دال ألف دال اثنين خمسة اثنين أربعة، ألف سين باء ٢١٧٥');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + groqKey
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.text && data.text.trim()) {
          console.log('[VOICE][STT] Response received');
          console.log('[VOICE][STT] Transcript: "' + data.text.trim() + '"');
          return { success: true, text: data.text.trim(), provider: 'GROQ' };
        }
      } else {
        const errText = await response.text();
        console.warn('[STT][BACKEND] Groq API returned status:', response.status, errText);
      }
    } catch (e) {
      console.warn('[STT][BACKEND] Groq API call failed:', e.message);
    }
  }

  // 2. Fallback Provider: OpenAI Whisper API (whisper-1)
  const openaiKey = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : null;
  if (openaiKey) {
    try {
      console.log('[VOICE][STT] Provider configured: OPENAI (Fallback)');
      console.log('[VOICE][STT] Uploading audio');

      const formData = new FormData();
      formData.append('file', audioBlob, filename);
      formData.append('model', 'whisper-1');
      formData.append('language', 'ar');
      formData.append('prompt', 'لوحة سيارة عربية: دال ألف دال اثنين خمسة اثنين أربعة، ألف سين باء ٢١٧٥');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + openaiKey
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.text && data.text.trim()) {
          console.log('[VOICE][STT] Response received');
          console.log('[VOICE][STT] Transcript: "' + data.text.trim() + '"');
          return { success: true, text: data.text.trim(), provider: 'OPENAI' };
        }
      } else {
        const errText = await response.text();
        console.warn('[STT][BACKEND] OpenAI API returned status:', response.status, errText);
      }
    } catch (e) {
      console.warn('[STT][BACKEND] OpenAI API call failed:', e.message);
    }
  }

  // 3. If no STT keys configured
  return {
    success: false,
    error: 'Speech-to-Text service is not configured',
    code: 'STT_CONFIG_REQUIRED',
    statusCode: 503
  };
}

module.exports = {
  transcribeAudioFile,
  logSttConfiguration
};
