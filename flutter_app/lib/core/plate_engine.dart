/// Boabat Al-Arabi - Flutter Arabic Plate Parsing Engine
library;

class PlateCandidate {
  final String letters;
  final String numbers;
  final String canonicalPlate;
  final String plateDisplay;
  final double confidence;

  PlateCandidate({
    required this.letters,
    required this.numbers,
    required this.canonicalPlate,
    required this.plateDisplay,
    this.confidence = 0.98,
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

  static const Map<String, int> singleDigits = {
    'صفر': 0, 'زيرو': 0,
    'واحد': 1, 'واحده': 1,
    'اثنين': 2, 'اتنين': 2, 'إثنين': 2,
    'ثلاثة': 3, 'تلاتة': 3, 'تلاته': 3, 'ثلاث': 3,
    'أربعة': 4, 'اربعه': 4, 'أربعه': 4, 'اربع': 4,
    'خمسة': 5, 'خمسه': 5, 'خمس': 5,
    'ستة': 6, 'سته': 6, 'ست': 6,
    'سبعة': 7, 'سبعه': 7, 'سبع': 7,
    'ثمانية': 8, 'تمانية': 8, 'تمانيه': 8, 'تمن': 8,
    'تسعة': 9, 'تسعه': 9, 'تسع': 9,
  };

  static const Map<String, int> compoundNumbers = {
    'عشرة': 10, 'حداشر': 11, 'اتناشر': 12, 'تلتاشر': 13, 'اربعتاشر': 14,
    'خمستاشر': 15, 'ستاشر': 16, 'سبعتاشر': 17, 'تمنتاشر': 18, 'تسعتاشر': 19,
    'عشرين': 20, 'تلاتين': 30, 'اربعين': 40, 'خمسين': 50, 'ستين': 60, 'سبعين': 70, 'تمانين': 80, 'تسعين': 90,
    'مية': 100, 'ميتين': 200, 'تلتماية': 300, 'تلاتمية': 300, 'ربعمية': 400, 'خمسمية': 500,
    'ستمية': 600, 'سبعمية': 700, 'تمنمية': 800, 'تسعمية': 900,
    'ألفين': 2000, 'الفين': 2000, 'تلات آلاف': 3000, 'اربع الاف': 4000,
  };

  static const Set<String> noiseWords = {
    'السيارة', 'سيارة', 'السياره', 'سياره', 'لوحة', 'لوحه', 'اللوحة', 'اللوحه',
    'هناك', 'هنا', 'شوف', 'شايف', 'هذه', 'دي', 'ده', 'دا', 'روح', 'يا', 'ايوه', 'ايوة', 'تمام'
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

  static String canonicalize(String plateStr) {
    final digits = normalizeDigits(plateStr);
    return normalizeArabic(digits).replaceAll(RegExp(r'\s+'), '');
  }

  static List<PlateCandidate> parse(String rawText) {
    final clean = normalizeDigits(rawText);
    final words = clean.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    final candidates = <PlateCandidate>[];

    List<String> letters = [];
    String digits = '';
    int compoundSum = 0;
    bool hasCompound = false;

    void flush() {
      String finalNum = digits;
      if (hasCompound && compoundSum > 0 && compoundSum <= 9999) {
        finalNum = compoundSum.toString();
      }

      if (letters.length >= 2 && letters.length <= 4 && finalNum.isNotEmpty && finalNum.length <= 4) {
        final finalLetters = letters.take(3).toList();
        final displayLetters = finalLetters.join(' ');
        final canonicalLetters = finalLetters.join('');
        final canonical = '$canonicalLetters$finalNum';

        candidates.add(PlateCandidate(
          letters: displayLetters,
          numbers: finalNum,
          canonicalPlate: canonical,
          plateDisplay: '$displayLetters $finalNum',
          confidence: 0.98,
        ));
      }

      letters = [];
      digits = '';
      compoundSum = 0;
      hasCompound = false;
    }

    for (final raw in words) {
      final norm = normalizeArabic(raw);
      if (noiseWords.contains(raw) || noiseWords.contains(norm)) continue;

      if (RegExp(r'^\d+$').hasMatch(raw)) {
        if (raw.length >= 3 && raw.length <= 4) {
          if (letters.length >= 2) {
            digits += raw;
            flush();
          }
        } else {
          for (final ch in raw.split('')) {
            if (letters.length >= 2) {
              if (hasCompound) {
                compoundSum += int.tryParse(ch) ?? 0;
              } else {
                digits += ch;
                if (digits.length == 4) flush();
              }
            }
          }
        }
        continue;
      }

      final withoutWa = raw.startsWith('و') ? raw.substring(1) : raw;
      final normWithoutWa = norm.startsWith('و') ? norm.substring(1) : norm;

      if (compoundNumbers.containsKey(raw) || compoundNumbers.containsKey(withoutWa) || compoundNumbers.containsKey(norm) || compoundNumbers.containsKey(normWithoutWa)) {
        final val = compoundNumbers[raw] ?? compoundNumbers[withoutWa] ?? compoundNumbers[norm] ?? compoundNumbers[normWithoutWa]!;
        if (letters.length >= 2) {
          hasCompound = true;
          compoundSum += val;
        }
        continue;
      }

      if (singleDigits.containsKey(raw) || singleDigits.containsKey(norm) || singleDigits.containsKey(withoutWa) || singleDigits.containsKey(normWithoutWa)) {
        final d = singleDigits[raw] ?? singleDigits[norm] ?? singleDigits[withoutWa] ?? singleDigits[normWithoutWa]!;
        if (letters.length >= 2) {
          if (hasCompound) {
            compoundSum += d;
          } else {
            digits += d.toString();
            if (digits.length == 4) flush();
          }
        }
        continue;
      }

      if (letterNames.containsKey(raw) || letterNames.containsKey(norm)) {
        final letVal = letterNames[raw] ?? letterNames[norm]!;
        if (digits.isNotEmpty || hasCompound) flush();
        if (letters.length < 4) letters.add(letVal);
        continue;
      }

      if (RegExp(r'^[\u0621-\u064A]{2,4}$').hasMatch(norm)) {
        if (digits.isNotEmpty || hasCompound) flush();
        for (final ch in norm.split('')) {
          letters.add(ch);
        }
        continue;
      }
    }

    flush();
    return candidates;
  }
}
