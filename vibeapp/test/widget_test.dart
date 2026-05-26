import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:vibeapp/main.dart';

void main() {
  test('Native quick commands parse note, agenda, and experience actions', () {
    final note = NativeQuickCommand.parse(
        'Hola V, toma nota que el parque está hermoso');
    expect(note.type, NativeQuickCommandType.note);
    expect(note.cleanedText, 'el parque está hermoso');

    final agenda = NativeQuickCommand.parse(
      'V, agenda cena con Ana hoy a las 8 pm en Casa',
    );
    expect(agenda.type, NativeQuickCommandType.agenda);
    expect(agenda.agenda?.title.toLowerCase(), contains('cena'));
    expect(agenda.agenda?.location, 'Casa');

    final start = NativeQuickCommand.parse(
      'V, inicia experiencia paseo por Praga',
    );
    expect(start.type, NativeQuickCommandType.startExperience);
    expect(start.cleanedText, 'Paseo por Praga');

    final close = NativeQuickCommand.parse('V, cerrar experiencia');
    expect(close.type, NativeQuickCommandType.closeExperience);
  });

  testWidgets('Vibeapp quick capture smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const VibeApp());

    expect(find.text('Vibeapp'), findsOneWidget);
    expect(find.text('Captura rápida'), findsOneWidget);
    expect(find.text('Guardar captura'), findsOneWidget);
    expect(find.text('Experiencia activa'), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Nota'),
      'V, toma nota de prueba.',
    );
    await tester.tap(find.text('Guardar captura'));
    await tester.pumpAndSettle();

    expect(find.text('Revisar'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Compuerta piloto móvil'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Compuerta piloto móvil'), findsOneWidget);
    expect(find.text('Verificar backend Vibe'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Importar sesion externa'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Sesiones externas'), findsOneWidget);
    expect(find.text('Importar sesion externa'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Audio'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Audio'), findsOneWidget);
    expect(find.text('Foto'), findsOneWidget);
    expect(find.text('Video'), findsOneWidget);
    expect(find.text('Agenda'), findsOneWidget);
    expect(find.text('Biometría'), findsOneWidget);
    expect(find.text('Lugar'), findsOneWidget);
  });
}
