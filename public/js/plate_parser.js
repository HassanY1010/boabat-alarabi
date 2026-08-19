/**
 * Boabat Al-Arabi - Enterprise Deterministic Arabic Plate Parser
 */

const CLIENT_LETTER_NAMES = {
  'ألف': 'ا', 'الف': 'ا', 'إلف': 'ا', 'إليف': 'ا', 'آلف': 'ا', 'ا': 'ا', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا',
  'باء': 'ب', 'با': 'ب', 'به': 'ب', 'ب': 'ب',
  'تاء': 'ت', 'تا': 'ت', 'ته': 'ت', 'ت': 'ت',
  'ثاء': 'ث', 'ثا': 'ث', 'ثه': 'ث', 'ث': 'ث',
  'جيم': 'ج', 'جم': 'ج', 'ج': 'ج',
  'حاء': 'ح', 'حا': 'ح', 'حه': 'ح', 'ح': 'ح',
  'خاء': 'خ', 'خا': 'خ', 'خه': 'خ', 'خ': 'خ',
  'دال': 'د', 'ديل': 'د', 'دا': 'د', 'ده': 'د', 'د': 'د',
  'ذال': 'ذ', 'ذيل': 'ذ', 'ذا': 'ذ', 'ذه': 'ذ', 'ذ': 'ذ',
  'راء': 'ر', 'را': 'ر', 'ره': 'ر', 'ر': 'ر',
  'زاي': 'ز', 'زين': 'ز', 'زا': 'ز', 'زه': 'ز', 'ز': 'ز',
  'سين': 'س', 'سا': 'س', 'سه': 'س', 'س': 'س',
  'شين': 'ش', 'شا': 'ش', 'شه': 'ش', 'ش': 'ش',
  'صاد': 'ص', 'صا': 'ص', 'صه': 'ص', 'ص': 'ص',
  'ضاد': 'ض', 'ضا': 'ض', 'ضه': 'ض', 'ض': 'ض',
  'طاء': 'ط', 'طا': 'ط', 'طه': 'ط', 'ط': 'ط',
  'ظاء': 'ظ', 'ظا': 'ظ', 'ظه': 'ظ', 'ظ': 'ظ',
  'عين': 'ع', 'عا': 'ع', 'عه': 'ع', 'ع': 'ع',
  'غين': 'غ', 'غا': 'غ', 'غه': 'غ', 'غ': 'غ',
  'فاء': 'ف', 'فا': 'ف', 'فه': 'ف', 'ف': 'ف',
  'قاف': 'ق', 'أاف': 'ق', 'اف': 'ق', 'قا': 'ق', 'قه': 'ق', 'ق': 'ق',
  'كاف': 'ك', 'كا': 'ك', 'كه': 'ك', 'ك': 'ك',
  'لام': 'ل', 'لا': 'ل', 'له': 'ل', 'ل': 'ل',
  'ميم': 'م', 'ما': 'م', 'مه': 'م', 'م': 'م',
  'نون': 'ن', 'نا': 'ن', 'نه': 'ن', 'ن': 'ن',
  'هاء': 'ه', 'ها': 'ه', 'هه': 'ه', 'هـ': 'ه', 'ه': 'ه',
  'واو': 'و', 'وا': 'و', 'و': 'و',
  'ياء': 'ي', 'يا': 'ي', 'يه': 'ي', 'ى': 'ي', 'ي': 'ي'
};

const CLIENT_SINGLE_DIGITS = {
  'صفر': '0', 'زيرو': '0',
  'واحد': '1', 'واحده': '1', 'حادي': '1',
  'اثنين': '2', 'اثنان': '2', 'إثنين': '2', 'إثنان': '2', 'أثنين': '2', 'أثنان': '2', 'اتنين': '2', 'تنين': '2', 'تنان': '2',
  'ثلاثة': '3', 'ثلاثه': '3', 'ثلاث': '3', 'تلاتة': '3', 'تلاته': '3', 'تلات': '3',
  'أربعة': '4', 'اربعه': '4', 'أربعه': '4', 'اربعة': '4', 'أربع': '4', 'اربع': '4',
  'خمسة': '5', 'خمسه': '5', 'خمس': '5',
  'ستة': '6', 'سته': '6', 'ست': '6',
  'سبعة': '7', 'سبعه': '7', 'سبع': '7',
  'ثمانية': '8', 'ثمانيه': '8', 'ثمان': '8', 'تمانية': '8', 'تمانيه': '8', 'تمن': '8',
  'تسعة': '9', 'تسعه': '9', 'تسع': '9'
};

const CLIENT_NOISE = new Set([
  'السيارة', 'سيارة', 'السياره', 'سياره', 'لوحة', 'لوحه', 'اللوحة', 'اللوحه',
  'هناك', 'هنا', 'شوف', 'شايف', 'هذه', 'دي', 'ده', 'دا', 'روح', 'يا',
  'ايوه', 'ايوة', 'تمام', 'سجل', 'اكتب', 'رقم', 'الرقم', 'حرف', 'الحرف'
]);

function clientNormalizeArabic(str) {
  if (!str) return '';
  return str
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/هـ/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[ـ\-_]/g, '')
    .trim();
}

function clientNormalizeDigits(str) {
  if (!str) return '';
  const map = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
  return str.replace(/[٠-٩]/g, d => map[d] || d);
}

function clientTokenize(rawText) {
  if (!rawText) return [];
  // 1. Convert Eastern digits to ASCII digits
  let text = clientNormalizeDigits(rawText);

  // 2. Normalize punctuation into whitespace
  text = text.replace(/[،,.:;!؟\?\[\]\(\)\{\}\-_/\\|]/g, ' ');

  const rawWords = text.split(/\s+/).filter(w => w.length > 0);
  const tokens = [];

  for (const raw of rawWords) {
    const norm = clientNormalizeArabic(raw);
    if (CLIENT_NOISE.has(raw) || CLIENT_NOISE.has(norm)) continue;

    // A. Check for raw ASCII digit strings e.g. "2524" or "2"
    if (/^\d+$/.test(raw)) {
      for (const d of raw) {
        tokens.push({ type: 'DIGIT', value: d, raw: d });
      }
      continue;
    }

    // B. Check for concatenated word + digits e.g. "داد2524"
    if (/\d+/.test(raw) && /[\u0621-\u064A]/.test(raw)) {
      const match = raw.match(/^([\u0621-\u064A]+)(\d+)$/);
      if (match) {
        const letStr = clientNormalizeArabic(match[1]);
        for (const ch of letStr) {
          tokens.push({ type: 'LETTER', value: ch, raw: ch });
        }
        for (const d of match[2]) {
          tokens.push({ type: 'DIGIT', value: d, raw: d });
        }
        continue;
      }
    }

    // C. Check word with leading conjunction 'و' stripped
    const withoutWa = raw.startsWith('و') && raw.length > 2 ? raw.slice(1) : raw;
    const normWithoutWa = norm.startsWith('و') && norm.length > 2 ? norm.slice(1) : norm;

    // D. Spoken single digits
    if (raw in CLIENT_SINGLE_DIGITS || norm in CLIENT_SINGLE_DIGITS || withoutWa in CLIENT_SINGLE_DIGITS || normWithoutWa in CLIENT_SINGLE_DIGITS) {
      const d = CLIENT_SINGLE_DIGITS[raw] ||
                CLIENT_SINGLE_DIGITS[norm] ||
                CLIENT_SINGLE_DIGITS[withoutWa] ||
                CLIENT_SINGLE_DIGITS[normWithoutWa];
      tokens.push({ type: 'DIGIT', value: d, raw });
      continue;
    }

    // E. Spoken Letter Names
    if (raw in CLIENT_LETTER_NAMES || norm in CLIENT_LETTER_NAMES || withoutWa in CLIENT_LETTER_NAMES || normWithoutWa in CLIENT_LETTER_NAMES) {
      const letVal = CLIENT_LETTER_NAMES[raw] ||
                     CLIENT_LETTER_NAMES[norm] ||
                     CLIENT_LETTER_NAMES[withoutWa] ||
                     CLIENT_LETTER_NAMES[normWithoutWa];
      tokens.push({ type: 'LETTER', value: letVal, raw });
      continue;
    }

    // F. Raw Arabic letters cluster e.g. "داد"
    if (/^[\u0621-\u064A]{2,4}$/.test(norm)) {
      for (const ch of norm) {
        tokens.push({ type: 'LETTER', value: ch, raw: ch });
      }
      continue;
    }
  }

  return tokens;
}

function clientParsePlateTranscript(rawText) {
  if (!rawText) return [];

  const normText = clientNormalizeArabic(clientNormalizeDigits(rawText));
  const tokens = clientTokenize(rawText);

  const letterTokens = tokens.filter(t => t.type === 'LETTER').map(t => t.value);
  const digitTokens = tokens.filter(t => t.type === 'DIGIT').map(t => t.value);

  console.log('[VOICE][PLATE] Raw transcript: "' + rawText + '"');
  console.log('[VOICE][PLATE] Normalized transcript: "' + normText + '"');
  console.log('[VOICE][PLATE] Letter tokens:', letterTokens);
  console.log('[VOICE][PLATE] Digit tokens:', digitTokens);

  const candidates = [];
  let curLetters = [];
  let curDigits = [];

  function flushCandidate() {
    if (curLetters.length >= 2 && curLetters.length <= 4 && curDigits.length >= 1 && curDigits.length <= 4) {
      const finalLetters = curLetters.slice(0, 3);
      const lettersDisplay = finalLetters.join(' ');
      const lettersCanonical = finalLetters.join('');
      const digitsDisplay = curDigits.join(' ');
      const digitsCanonical = curDigits.join('');
      const canonical = lettersCanonical + digitsCanonical;

      candidates.push({
        letters: lettersDisplay,
        lettersCanonical: lettersCanonical,
        numbers: digitsDisplay,
        digitsList: [...curDigits],
        numbersCanonical: digitsCanonical,
        canonicalPlate: canonical,
        plateDisplay: lettersDisplay + ' ' + digitsDisplay,
        confidence: 0.98
      });
    }
    curLetters = [];
    curDigits = [];
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'LETTER') {
      // If we already collected digits and encounter letters again, flush current completed plate
      if (curDigits.length >= 1) {
        flushCandidate();
      }
      if (curLetters.length < 3) {
        curLetters.push(tok.value);
      }
    } else if (tok.type === 'DIGIT') {
      if (curLetters.length >= 2) {
        if (curDigits.length < 4) {
          curDigits.push(tok.value);
        }
        // If 4 digits reached, flush completed candidate
        if (curDigits.length === 4) {
          flushCandidate();
        }
      }
    }
  }

  flushCandidate();

  // Fallback: If no candidate was formed via streaming scan but tokens exist
  if (candidates.length === 0 && letterTokens.length >= 2 && digitTokens.length >= 1) {
    const fallbackLetters = letterTokens.slice(0, 3);
    const fallbackDigits = digitTokens.slice(0, 4);
    const lettersDisplay = fallbackLetters.join(' ');
    const lettersCanonical = fallbackLetters.join('');
    const digitsDisplay = fallbackDigits.join(' ');
    const digitsCanonical = fallbackDigits.join('');
    const canonical = lettersCanonical + digitsCanonical;

    candidates.push({
      letters: lettersDisplay,
      lettersCanonical: lettersCanonical,
      numbers: digitsDisplay,
      digitsList: fallbackDigits,
      numbersCanonical: digitsCanonical,
      canonicalPlate: canonical,
      plateDisplay: lettersDisplay + ' ' + digitsDisplay,
      confidence: 0.95
    });
  }

  const candidateNames = candidates.map(c => c.canonicalPlate);
  console.log('[VOICE][PLATE] Candidate plates:', candidateNames);
  if (candidates.length > 0) {
    console.log('[VOICE][PLATE] Selected candidate:', candidates[0].canonicalPlate);
  }

  return candidates;
}

if (typeof window !== 'undefined') {
  window.clientPlateParser = {
    parsePlateTranscript: clientParsePlateTranscript,
    normalizeArabic: clientNormalizeArabic,
    normalizeDigits: clientNormalizeDigits,
    tokenize: clientTokenize
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    clientParsePlateTranscript,
    clientNormalizeArabic,
    clientNormalizeDigits,
    clientTokenize
  };
}
