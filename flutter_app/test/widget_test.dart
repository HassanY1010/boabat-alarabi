import 'package:flutter_test/flutter_test.dart';
import 'package:boabat_alarabi/main.dart';

void main() {
  testWidgets('App basic smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const BoabatAlarabiApp());
    expect(find.text('بوابة العربي'), findsOneWidget);
  });
}
