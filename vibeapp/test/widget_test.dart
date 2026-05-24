// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:vibeapp/main.dart';

void main() {
  testWidgets('Vibeapp quick capture smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const VibeApp());

    expect(find.text('Vibeapp'), findsOneWidget);
    expect(find.text('Captura rápida'), findsOneWidget);
    expect(find.text('Guardar captura'), findsOneWidget);

    await tester.enterText(find.byType(EditableText), 'V, toma nota de prueba.');
    await tester.tap(find.text('Guardar captura'));
    await tester.pump();

    expect(find.text('Sincronizando'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Sincronizado'), findsOneWidget);
  });
}
