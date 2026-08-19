const fs = require('fs');

async function transcribeAudioFile(filePath, originalFilename = 'audio.webm', mimeType = 'audio/webm') {
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

  // 1. Try Groq Whisper API (Ultra-Fast <200ms)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      console.log('[STT][BACKEND] Transcribing via Groq Whisper API...');
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
        if (data && data.text) {
          console.log('[STT][BACKEND] Groq transcript received:', data.text);
          return { success: true, text: data.text.trim(), provider: 'groq' };
        }
      } else {
        const errText = await response.text();
        console.warn('[STT][BACKEND] Groq API returned error:', response.status, errText);
      }
    } catch (e) {
      console.warn('[STT][BACKEND] Groq API call failed:', e.message);
    }
  }

  // 2. Try OpenAI Whisper API
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      console.log('[STT][BACKEND] Transcribing via OpenAI Whisper API...');
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
        if (data && data.text) {
          console.log('[STT][BACKEND] OpenAI transcript received:', data.text);
          return { success: true, text: data.text.trim(), provider: 'openai' };
        }
      } else {
        const errText = await response.text();
        console.warn('[STT][BACKEND] OpenAI API returned error:', response.status, errText);
      }
    } catch (e) {
      console.warn('[STT][BACKEND] OpenAI API call failed:', e.message);
    }
  }

  // If no external keys configured
  return {
    success: false,
    error: 'لم يتم العثور على مفتاح STT (GROQ_API_KEY أو OPENAI_API_KEY) في متغيرات البيئة. يرجى إضافة المفتاح لتفعيل تحويل الصوت السحابي بدقة فائقة.',
    code: 'STT_CONFIG_REQUIRED'
  };
}

module.exports = {
  transcribeAudioFile
};
