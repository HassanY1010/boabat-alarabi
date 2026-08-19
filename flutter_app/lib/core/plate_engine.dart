/// Boabat Al-Arabi - Enterprise Deterministic Arabic Plate Parsing & Validation Engine
/// 100% Synchronized with Web Plate Parser
library;

class PlateCandidate {
  final String letters;
  final String lettersCanonical;
  final String numbers;
  final String numbersCanonical;
  final String canonicalPlate;
  final String plateDisplay;
  final double confidence;
  final int sourceDigitCount;

  PlateCandidate({
    required this.letters,
    required this.lettersCanonical,
    required this.numbers,
    required this.numbersCanonical,
    required this.canonicalPlate,
    required this.plateDisplay,
    this.confidence = 0.98,
    this.sourceDigitCount = 4,
  });
}

class ValidationResult {
  final bool isValid;
  final String reason;
  final String? normalized;

  ValidationResult({
    required this.isValid,
    this.reason = '',
    this.normalized,
  });
}

class FlutterPlateEngine {
  static const Map<String, String> letterNames = {
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

  static const Map<String, String> singleDigits = {
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

  static const Set<String> noiseWords = {
    'السيارة', 'سيارة', 'السياره', 'سياره', 'لوحة', 'لوحه', 'اللوحة', 'اللوحه',
    'هناك', 'هنا', 'شوف', 'شايف', 'هذه', 'دي', 'ده', 'دا', 'روح', 'يا',
    'ايوه', 'ايوة', 'تمام', 'سجل', 'اكتب', 'رقم', 'الرقم', 'حرف', 'الحرف'
  };

  static String normalizeArabic(String str) {
    return str
        .replaceAll(RegExp(r'[إأآا]'), 'ا')
        .replaceAll('ة', 'ه')
        .replaceAll('هـ', 'ه')
        .replaceAll(RegExp(r'[ىي]'), 'ي')
        .replaceAll('ؤ', 'و')
        .replaceAll('ئ', 'ي')
        .replaceAll(RegExp(r'[\u064B-\u065F\u0670]'), '')
        .replaceAll(RegExp(r'[ـ\-_]'), '')
        .trim();
  }

  static String normalizeDigits(String str) {
    const map = {
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
    };
    String res = str;
    map.forEach((k, v) => res = res.replaceAll(k, v));
    return res;
  }

  static ValidationResult validatePlateCandidate(PlateCandidate candidate) {
    final letters = candidate.lettersCanonical.trim();
    final numbers = candidate.numbersCanonical.trim();
    final canonical = candidate.canonicalPlate;

    // 1. Letters count check (exactly 3 Arabic letters)
    if (letters.length != 3 || !RegExp(r'^[\u0621-\u064A]{3}$').hasMatch(letters)) {
      return ValidationResult(isValid: false, reason: 'invalid_letter_count');
    }

    // 2. Runaway source digit check (hallucination rejection)
    if (candidate.sourceDigitCount > 4) {
      return ValidationResult(isValid: false, reason: 'digit_sequence_too_long');
    }

    // 3. Numbers count check (exactly 4 digits)
    if (numbers.length != 4 || !RegExp(r'^\d{4}$').hasMatch(numbers)) {
      return ValidationResult(isValid: false, reason: 'invalid_digit_count');
    }

    return ValidationResult(isValid: true, normalized: canonical);
  }

  static List<PlateCandidate> parse(String rawText) {
    if (rawText.trim().isEmpty) return [];

    // 1. Convert Eastern digits
    String text = normalizeDigits(rawText);

    // 2. Normalize punctuation into whitespace
    text = text.replaceAll(RegExp(r'[،,.:;!؟\?\[\]\(\)\{\}\-_/\\|]'), ' ');

    final rawWords = text.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    final List<Map<String, String>> tokens = [];

    for (final raw in rawWords) {
      final norm = normalizeArabic(raw);
      if (noiseWords.contains(raw) || noiseWords.contains(norm)) continue;

      // A. Raw ASCII digit strings e.g. "2524"
      if (RegExp(r'^\d+$').hasMatch(raw)) {
        for (final d in raw.split('')) {
          tokens.add({'type': 'DIGIT', 'value': d});
        }
        continue;
      }

      // B. Concatenated word + digits e.g. "داد2524"
      if (RegExp(r'\d+').hasMatch(raw) && RegExp(r'[\u0621-\u064A]').hasMatch(raw)) {
        final match = RegExp(r'^([\u0621-\u064A]+)(\d+)$').firstMatch(raw);
        if (match != null) {
          final letStr = normalizeArabic(match.group(1)!);
          for (final ch in letStr.split('')) {
            tokens.add({'type': 'LETTER', 'value': ch});
          }
          for (final d in match.group(2)!.split('')) {
            tokens.add({'type': 'DIGIT', 'value': d});
          }
          continue;
        }
      }

      final withoutWa = raw.startsWith('و') && raw.length > 2 ? raw.substring(1) : raw;
      final normWithoutWa = norm.startsWith('و') && norm.length > 2 ? norm.substring(1) : norm;

      // C. Spoken single digits
      if (singleDigits.containsKey(raw) || singleDigits.containsKey(norm) || singleDigits.containsKey(withoutWa) || singleDigits.containsKey(normWithoutWa)) {
        final d = singleDigits[raw] ?? singleDigits[norm] ?? singleDigits[withoutWa] ?? singleDigits[normWithoutWa]!;
        tokens.add({'type': 'DIGIT', 'value': d});
        continue;
      }

      // D. Spoken Letter Names
      if (letterNames.containsKey(raw) || letterNames.containsKey(norm) || letterNames.containsKey(withoutWa) || letterNames.containsKey(normWithoutWa)) {
        final letVal = letterNames[raw] ?? letterNames[norm] ?? letterNames[withoutWa] ?? letterNames[normWithoutWa]!;
        tokens.add({'type': 'LETTER', 'value': letVal});
        continue;
      }

      // E. Raw Arabic letters cluster e.g. "داد"
      if (RegExp(r'^[\u0621-\u064A]{2,4}$').hasMatch(norm)) {
        for (final ch in norm.split('')) {
          tokens.add({'type': 'LETTER', 'value': ch});
        }
        continue;
      }
    }

    final List<PlateCandidate> rawCandidates = [];
    List<String> curLetters = [];
    List<String> curDigits = [];

    void evaluateCluster() {
      if (curLetters.isNotEmpty || curDigits.isNotEmpty) {
        final sourceDigitCount = curDigits.length;
        final sourceLetterCount = curLetters.length;

        if (sourceLetterCount == 3 && sourceDigitCount == 4) {
          final lettersDisplay = curLetters.join(' ');
          final lettersCanonical = curLetters.join('');
          final digitsDisplay = curDigits.join(' ');
          final digitsCanonical = curDigits.join('');
          final canonical = '$lettersCanonical$digitsCanonical';

          final candidate = PlateCandidate(
            letters: lettersDisplay,
            lettersCanonical: lettersCanonical,
            numbers: digitsDisplay,
            numbersCanonical: digitsCanonical,
            canonicalPlate: canonical,
            plateDisplay: '$lettersDisplay $digitsDisplay',
            confidence: 0.98,
            sourceDigitCount: sourceDigitCount,
          );

          final validation = validatePlateCandidate(candidate);
          if (validation.isValid) {
            rawCandidates.add(candidate);
          }
        }
      }
      curLetters = [];
      curDigits = [];
    }

    for (final tok in tokens) {
      if (tok['type'] == 'LETTER') {
        if (curDigits.isNotEmpty) {
          evaluateCluster();
        }
        curLetters.add(tok['value']!);
      } else if (tok['type'] == 'DIGIT') {
        if (curLetters.isNotEmpty) {
          curDigits.add(tok['value']!);
        }
      }
    }

    evaluateCluster();

    // Deduplicate candidates
    final List<PlateCandidate> unique = [];
    final Set<String> seen = {};
    for (final c in rawCandidates) {
      if (!seen.contains(c.canonicalPlate)) {
        seen.add(c.canonicalPlate);
        unique.add(c);
      }
    }

    return unique;
  }
}
