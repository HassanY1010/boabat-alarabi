import 'package:flutter_test/flutter_test.dart';
import 'package:boabat_alarabi/core/plate_engine.dart';

void main() {
  group('FlutterPlateEngine Tests', () {
    test('Standard letter pronunciation test', () {
      final res = FlutterPlateEngine.parse('ألف هاء راء 2753');
      expect(res.length, 1);
      expect(res[0].canonicalPlate, 'اهر2753');
      expect(res[0].letters, 'ا ه ر');
      expect(res[0].numbers, '2753');
    });

    test('Egyptian compound spoken numbers test', () {
      final res = FlutterPlateEngine.parse('ألف هاء راء ألفين سبعمية تلاتة وخمسين');
      expect(res.length, 1);
      expect(res[0].canonicalPlate, 'اهر2753');
    });

    test('Colloquial dialect letter test', () {
      final res = FlutterPlateEngine.parse('باء ياء دال 3863');
      expect(res.length, 1);
      expect(res[0].canonicalPlate, 'بيد3863');
    });

    test('Video demonstration multi-plate continuous sequence test', () {
      const videoSpeech = 'ديل الف دال 2 5 2 4 د ب ك 2 1 2 1 د ر ص 2 8 2 8 د ع د 5 1 5 1 د ر ب 27 27 د ك ن 2 7 2 7 د و ع 5 1 5 1 د ر ب 2 3 2 3 ي ص ن 0 5 0 5';
      final res = FlutterPlateEngine.parse(videoSpeech);
      expect(res.length, 9);
      expect(res[0].canonicalPlate, 'داد2524');
      expect(res[1].canonicalPlate, 'دبك2121');
      expect(res[2].canonicalPlate, 'درص2828');
      expect(res[3].canonicalPlate, 'دعد5151');
      expect(res[4].canonicalPlate, 'درب2727');
      expect(res[5].canonicalPlate, 'دكن2727');
      expect(res[6].canonicalPlate, 'دوع5151');
      expect(res[7].canonicalPlate, 'درب2323');
      expect(res[8].canonicalPlate, 'يصن0505');
    });
  });
}
