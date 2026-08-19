import 'package:flutter_test/flutter_test.dart';
import 'package:boabat_alarabi/core/plate_engine.dart';

void main() {
  group('FlutterPlateEngine 100% Web Parity Tests', () {
    test('Case 1: Mixed colloquial terms ("دال ألف دال تنين خمسة اثنين أربعة")', () {
      final candidates = FlutterPlateEngine.parse('دال ألف دال تنين خمسة اثنين أربعة');
      expect(candidates.isNotEmpty, true);
      expect(candidates.first.canonicalPlate, 'داد2524');
    });

    test('Case 2: Standard terms ("دال ألف دال اثنين خمسة اثنين أربعة")', () {
      final candidates = FlutterPlateEngine.parse('دال ألف دال اثنين خمسة اثنين أربعة');
      expect(candidates.isNotEmpty, true);
      expect(candidates.first.canonicalPlate, 'داد2524');
    });

    test('Case 3: Deduplication of repeated phrase', () {
      final candidates = FlutterPlateEngine.parse('دال ألف دال تنين خمسة اثنين أربعة، دال ألف دال تنين خمسة اثنين أربعة');
      expect(candidates.length, 1);
      expect(candidates.first.canonicalPlate, 'داد2524');
    });

    test('Case 4: Rejection of runaway repeated digits ("سين باء 2222222222222222")', () {
      final candidates = FlutterPlateEngine.parse('سين باء 2222222222222222');
      expect(candidates.isEmpty, true);
    });

    test('Case 5: Rejection of incomplete plate ("دال ألف دال")', () {
      final candidates = FlutterPlateEngine.parse('دال ألف دال');
      expect(candidates.isEmpty, true);
    });

    test('Case 6: Direct digits ("دال ألف دال 2524")', () {
      final candidates = FlutterPlateEngine.parse('دال ألف دال 2524');
      expect(candidates.isNotEmpty, true);
      expect(candidates.first.canonicalPlate, 'داد2524');
    });
  });
}
