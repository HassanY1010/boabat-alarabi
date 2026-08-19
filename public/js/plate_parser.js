/**
 * Boabat Al-Arabi - Client-Side Arabic Normalizer & Plate Parser
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

const CLIENT_COMPOUND_NUMBERS = {
  'عشرة': 10, 'عشره': 10, 'حداشر': 11, 'اتناشر': 12, 'تلتاشر': 13, 'اربعتاشر': 14,
  'خمستاشر': 15, 'ستاشر': 16, 'سبعتاشر': 17, 'تمنتاشر': 18, 'تسعتاشر': 19,
  'عشرين': 20, 'عشرون': 20, 'تلاتين': 30, 'ثلاثين': 30, 'اربعين': 40, 'خمسين': 50,
  'ستين': 60, 'سبعين': 70, 'تمانين': 80, 'تسعين': 90,
  'مية': 100, 'مئة': 100, 'مائة': 100, 'ميتين': 200,
  'تلتماية': 300, 'تلاتمية': 300, 'ربعمية': 400, 'خمسمية': 500,
  'ستمية': 600, 'سبعمية': 700, 'تمنمية': 800, 'تسعمية': 900,
  'ألفين': 2000, 'الفين': 2000, 'تلات آلاف': 3000, 'اربع الاف': 4000
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

function clientParsePlateTranscript(rawText) {
  const clean = clientNormalizeDigits(rawText || '');
  const rawWords = clean.split(/\s+/).filter(w => w.length > 0);
  const tokens = [];

  for (const raw of rawWords) {
    const norm = clientNormalizeArabic(raw);
    if (CLIENT_NOISE.has(raw) || CLIENT_NOISE.has(norm)) continue;

    if (/\d+/.test(raw) && /[\u0621-\u064A]/.test(raw)) {
      const match = raw.match(/^([\u0621-\u064A]+)(\d+)$/);
      if (match) {
        const letStr = clientNormalizeArabic(match[1]);
        for (const ch of letStr) {
          tokens.push({ type: 'LETTER', value: ch });
        }
        tokens.push({ type: 'DIGIT_STRING', value: match[2] });
        continue;
      }
    }

    if (/^\d+$/.test(raw)) {
      for (const d of raw) {
        tokens.push({ type: 'DIGIT', value: d, numVal: parseInt(d, 10) });
      }
      continue;
    }

    const withoutWa = raw.replace(/^و/, '');
    const normWithoutWa = norm.replace(/^و/, '');

    if (raw in CLIENT_SINGLE_DIGITS || norm in CLIENT_SINGLE_DIGITS || withoutWa in CLIENT_SINGLE_DIGITS || normWithoutWa in CLIENT_SINGLE_DIGITS) {
      const d = CLIENT_SINGLE_DIGITS[raw] !== undefined ? CLIENT_SINGLE_DIGITS[raw] :
                CLIENT_SINGLE_DIGITS[norm] !== undefined ? CLIENT_SINGLE_DIGITS[norm] :
                CLIENT_SINGLE_DIGITS[withoutWa] !== undefined ? CLIENT_SINGLE_DIGITS[withoutWa] :
                CLIENT_SINGLE_DIGITS[normWithoutWa];
      tokens.push({ type: 'DIGIT', value: d.toString(), numVal: d });
      continue;
    }

    if (raw in CLIENT_LETTER_NAMES || norm in CLIENT_LETTER_NAMES) {
      const letVal = CLIENT_LETTER_NAMES[raw] || CLIENT_LETTER_NAMES[norm];
      tokens.push({ type: 'LETTER', value: letVal });
      continue;
    }

    if (/^[\u0621-\u064A]{2,4}$/.test(norm)) {
      for (const ch of norm) {
        tokens.push({ type: 'LETTER', value: ch });
      }
      continue;
    }
  }

  const candidates = [];
  let letters = [];
  let digits = [];

  function flush() {
    if (letters.length >= 2 && letters.length <= 4 && digits.length >= 1 && digits.length <= 4) {
      const finalLetters = letters.slice(0, 3);
      const lettersDisplay = finalLetters.join(' ');
      const lettersCanonical = finalLetters.join('');
      const digitsDisplay = digits.join(' ');
      const digitsCanonical = digits.join('');
      const canonical = `${lettersCanonical}${digitsCanonical}`;

      candidates.push({
        letters: lettersDisplay,
        lettersCanonical,
        numbers: digitsDisplay,
        digitsList: [...digits],
        numbersCanonical: digitsCanonical,
        canonicalPlate: canonical,
        plateDisplay: `${lettersDisplay} ${digitsDisplay}`,
        confidence: 0.98
      });
    }

    letters = [];
    digits = [];
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'LETTER') {
      if (digits.length >= 1) flush();
      if (letters.length < 4) letters.push(tok.value);
    } else if (tok.type === 'DIGIT') {
      if (letters.length >= 2) {
        digits.push(tok.value);
        if (digits.length === 4 || (digits.length >= 3 && (i === tokens.length - 1 || tokens[i+1]?.type === 'LETTER'))) {
          flush();
        }
      }
    }
  }

  flush();
  return candidates;
}

window.clientPlateParser = {
  parsePlateTranscript: clientParsePlateTranscript,
  normalizeArabic: clientNormalizeArabic,
  normalizeDigits: clientNormalizeDigits
};
