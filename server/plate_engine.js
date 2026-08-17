/**
 * Boabat Al-Arabi - Plate Engine & Arabic Normalization Pipeline
 * High-precision State Machine & Tokenizer for Arabic Vehicle Plates
 */

// Spoken Arabic Letter Names and Egyptian variants
const LETTER_NAMES = {
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

// Spoken single digits (0-9)
const SINGLE_DIGIT_WORDS = {
  'صفر': 0, 'زيرو': 0,
  'واحد': 1, 'واحده': 1,
  'اثنين': 2, 'إثنين': 2, 'اتنين': 2, 'تنين': 2,
  'ثلاثة': 3, 'ثلاثه': 3, 'تلاتة': 3, 'تلاته': 3, 'تلات': 3, 'ثلاث': 3,
  'أربعة': 4, 'اربعه': 4, 'أربعه': 4, 'اربعة': 4, 'اربع': 4, 'أربع': 4,
  'خمسة': 5, 'خمسه': 5, 'خمس': 5,
  'ستة': 6, 'سته': 6, 'ست': 6,
  'سبعة': 7, 'سبعه': 7, 'سبع': 7,
  'ثمانية': 8, 'ثمانيه': 8, 'تمانية': 8, 'تمانيه': 8, 'تمن': 8, 'ثمان': 8,
  'تسعة': 9, 'تسعه': 9, 'تسع': 9
};

// Spoken compound numbers
const COMPOUND_NUMBER_VALUES = {
  'عشرة': 10, 'عشره': 10,
  'حداشر': 11, 'أحد عشر': 11, 'احد عشر': 11,
  'اثنا عشر': 12, 'اتناشر': 12,
  'تلتاشر': 13, 'ثلاثة عشر': 13,
  'اربعتاشر': 14, 'أربعة عشر': 14,
  'خمستاشر': 15, 'خمسة عشر': 15,
  'ستاشر': 16, 'ستة عشر': 16,
  'سبعتاشر': 17, 'سبعة عشر': 17,
  'تمنتاشر': 18, 'ثمانية عشر': 18,
  'تسعتاشر': 19, 'تسعة عشر': 19,
  'عشرين': 20, 'عشرون': 20,
  'تلاتين': 30, 'ثلاثين': 30,
  'اربعين': 40, 'أربعين': 40,
  'خمسين': 50,
  'ستين': 60,
  'سبعين': 70,
  'تمانين': 80, 'ثمانين': 80,
  'تسعين': 90,
  'مية': 100, 'مئة': 100, 'مائة': 100,
  'ميتين': 200, 'مئتان': 200,
  'تلتماية': 300, 'تلاتمية': 300, 'ثلاثمائة': 300,
  'ربعمية': 400, 'اربعمية': 400, 'أربعمائة': 400,
  'خمسمية': 500, 'خمسمائة': 500,
  'ستمية': 600, 'ستمائة': 600,
  'سبعمية': 700, 'سبعمائة': 700,
  'تمنمية': 800, 'ثمانمائة': 800,
  'تسعمية': 900, 'تسعمائة': 900,
  'ألفين': 2000, 'الفين': 2000,
  'تلات آلاف': 3000, 'تلات الاف': 3000, 'ثلاثة آلاف': 3000,
  'أربعة آلاف': 4000, 'اربع الاف': 4000,
  'خمسة آلاف': 5000, 'خمس الاف': 5000,
  'ستة آلاف': 6000, 'ست الاف': 6000,
  'سبعة آلاف': 7000, 'سبع الاف': 7000,
  'ثمانية آلاف': 8000, 'تمان الاف': 8000,
  'تسعة آلاف': 9000, 'تسع الاف': 9000
};

const NOISE_WORDS = new Set([
  'السيارة', 'سيارة', 'السياره', 'سياره', 'لوحة', 'لوحه', 'اللوحة', 'اللوحه',
  'هناك', 'هنا', 'شوف', 'شايف', 'هذه', 'دي', 'ده', 'دا', 'روح', 'يا',
  'ايوه', 'ايوة', 'تمام', 'سجل', 'اكتب', 'رقم', 'الرقم', 'حرف', 'الحرف',
  'عربية', 'العربية', 'عربيه', 'العربيه'
]);

function normalizeArabicLetters(str) {
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

function normalizeDigits(str) {
  if (!str) return '';
  const arabicToWestern = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  return str.replace(/[٠-٩]/g, d => arabicToWestern[d] || d);
}

function tokenizeArabicSpeech(rawText) {
  const clean = normalizeDigits(rawText || '');
  const rawWords = clean.split(/\s+/).filter(w => w.length > 0);
  const tokens = [];

  for (let i = 0; i < rawWords.length; i++) {
    const raw = rawWords[i];
    const norm = normalizeArabicLetters(raw);

    // Skip noise
    if (NOISE_WORDS.has(raw) || NOISE_WORDS.has(norm)) {
      continue;
    }

    // Check if word contains literal digits and letters together (e.g. "اسب2175" or "د2121")
    if (/\d+/.test(raw) && /[\u0621-\u064A]/.test(raw)) {
      const match = raw.match(/^([\u0621-\u064A]+)(\d+)$/);
      if (match) {
        const letStr = normalizeArabicLetters(match[1]);
        for (const ch of letStr) {
          tokens.push({ type: 'LETTER', value: ch, raw: ch });
        }
        tokens.push({ type: 'DIGIT_STRING', value: match[2], raw: match[2] });
        continue;
      }
    }

    // Check if pure digit string (e.g. "2753", "2", "27")
    if (/^\d+$/.test(raw)) {
      if (raw.length >= 3 && raw.length <= 4) {
        tokens.push({ type: 'DIGIT_STRING', value: raw, raw });
      } else {
        for (const d of raw) {
          tokens.push({ type: 'DIGIT', value: d, raw: d, numVal: parseInt(d, 10) });
        }
      }
      continue;
    }

    // Check for compound numbers (e.g. "ألفين", "سبعمية", "عشرين")
    const withoutWa = raw.replace(/^و/, '');
    const normWithoutWa = norm.replace(/^و/, '');
    if (raw in COMPOUND_NUMBER_VALUES || withoutWa in COMPOUND_NUMBER_VALUES || norm in COMPOUND_NUMBER_VALUES || normWithoutWa in COMPOUND_NUMBER_VALUES) {
      const val = COMPOUND_NUMBER_VALUES[raw] || COMPOUND_NUMBER_VALUES[withoutWa] || COMPOUND_NUMBER_VALUES[norm] || COMPOUND_NUMBER_VALUES[normWithoutWa];
      tokens.push({ type: 'COMPOUND_NUMBER', value: val, raw });
      continue;
    }

    // Check single digit words ("واحد", "اتنين", "تلاتة")
    if (raw in SINGLE_DIGIT_WORDS || norm in SINGLE_DIGIT_WORDS || withoutWa in SINGLE_DIGIT_WORDS || normWithoutWa in SINGLE_DIGIT_WORDS) {
      const d = SINGLE_DIGIT_WORDS[raw] !== undefined ? SINGLE_DIGIT_WORDS[raw] :
                SINGLE_DIGIT_WORDS[norm] !== undefined ? SINGLE_DIGIT_WORDS[norm] :
                SINGLE_DIGIT_WORDS[withoutWa] !== undefined ? SINGLE_DIGIT_WORDS[withoutWa] :
                SINGLE_DIGIT_WORDS[normWithoutWa];
      tokens.push({ type: 'DIGIT', value: d.toString(), raw, numVal: d });
      continue;
    }

    // Check Letter names ("ألف", "باء", "ديل", "دال", "سين")
    if (raw in LETTER_NAMES || norm in LETTER_NAMES) {
      const letVal = LETTER_NAMES[raw] || LETTER_NAMES[norm];
      tokens.push({ type: 'LETTER', value: letVal, raw });
      continue;
    }

    // Check connected 2-4 arabic letters word (e.g. "دبك", "اسب", "اهر")
    if (/^[\u0621-\u064A]{2,4}$/.test(norm)) {
      for (const ch of norm) {
        tokens.push({ type: 'LETTER', value: ch, raw: ch });
      }
      continue;
    }
  }

  return tokens;
}

function parsePlateTranscript(rawText, options = {}) {
  const tokens = tokenizeArabicSpeech(rawText);
  const candidates = [];

  let letters = [];
  let digits = '';
  let compoundSum = 0;
  let hasCompound = false;

  function flushPlate() {
    let finalNumber = digits;
    if (hasCompound && compoundSum > 0 && compoundSum <= 9999) {
      finalNumber = compoundSum.toString();
    }

    if (letters.length >= 2 && letters.length <= 4 && finalNumber.length >= 1 && finalNumber.length <= 4) {
      const finalLetters = letters.slice(0, 3);
      const lettersDisplay = finalLetters.join(' ');
      const lettersCanonical = finalLetters.join('');
      const canonical = `${lettersCanonical}${finalNumber}`;

      candidates.push({
        letters: lettersDisplay,
        lettersCanonical,
        numbers: finalNumber,
        canonicalPlate: canonical,
        plateDisplay: `${lettersDisplay} ${finalNumber}`,
        confidence: 0.98
      });
    }

    letters = [];
    digits = '';
    compoundSum = 0;
    hasCompound = false;
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === 'LETTER') {
      if (digits.length >= 1 || hasCompound) {
        flushPlate();
      }
      if (letters.length < 4) {
        letters.push(tok.value);
      }
    } else if (tok.type === 'DIGIT') {
      if (letters.length >= 2) {
        if (hasCompound) {
          compoundSum += tok.numVal;
        } else {
          digits += tok.value;
          if (digits.length === 4) {
            flushPlate();
          }
        }
      }
    } else if (tok.type === 'DIGIT_STRING') {
      if (letters.length >= 2) {
        digits += tok.value;
        flushPlate();
      }
    } else if (tok.type === 'COMPOUND_NUMBER') {
      if (letters.length >= 2) {
        hasCompound = true;
        compoundSum += tok.value;
      }
    }
  }

  flushPlate();
  return candidates;
}

function canonicalizePlate(plateStr) {
  if (!plateStr) return '';
  const digits = normalizeDigits(plateStr.toString());
  const clean = normalizeArabicLetters(digits).replace(/\s+/g, '');
  return clean;
}

module.exports = {
  LETTER_NAMES,
  SINGLE_DIGIT_WORDS,
  COMPOUND_NUMBER_VALUES,
  NOISE_WORDS,
  normalizeArabicLetters,
  normalizeDigits,
  tokenizeArabicSpeech,
  parsePlateTranscript,
  canonicalizePlate
};
