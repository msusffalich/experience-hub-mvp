import 'dart:io';

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

  test('Native payloads preserve event, media, location, and biometric context',
      () {
    final tempDir = Directory.systemTemp.createTempSync('vibeapp-contract-');
    addTearDown(() {
      if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
    });

    final imageFile = File('${tempDir.path}${Platform.pathSeparator}foto.jpg')
      ..writeAsBytesSync([1, 2, 3, 4]);
    final biometricFile =
        File('${tempDir.path}${Platform.pathSeparator}health.csv')
          ..writeAsStringSync(
            'startDate,steps,heart_rate\n'
            '2026-05-27T08:00:00Z,1200,72\n',
          );

    final session = ActiveExperienceSession.start('Paseo de prueba');
    session.addTextEvent('Llegada al parque.');
    session.addAttachmentEvent(NativeAttachmentDraft.fromFilePath(
      imageFile.path,
      sourceType: 'image',
    ));
    session.close();

    final sessionItem = CaptureQueueItem.fromSession(session);
    final validation = sessionItem.validateForSync();
    expect(validation.canSync, isTrue);

    final sessionPayload = sessionItem.toExperiencePayload();
    expect(sessionPayload['metadata']['syncContract'], 'vibeapp-session-v1');
    expect(sessionPayload['events'], isA<List>());
    expect((sessionPayload['events'] as List).length, 2);
    expect(sessionPayload['attachments'], isA<List>());
    final attachment =
        (sessionPayload['attachments'] as List).single as Map<String, dynamic>;
    expect(attachment['sourceType'], 'vibeapp-native-image');
    expect(attachment['eventId'], isNotEmpty);
    expect(attachment['metadata']['linkedEventId'], attachment['eventId']);
    expect(attachment['metadata']['eventOrder'], greaterThan(0));

    final locationItem = CaptureQueueItem.location(LocationDraft(
      latitude: 38.8895,
      longitude: -77.0353,
      accuracy: 12,
    ));
    final locationPayload = locationItem.toExperiencePayload();
    expect(locationPayload['objective'], 'Ubicaci\u00f3n capturada desde Vibeapp');
    expect(locationPayload['metadata']['payloadType'], 'location');
    expect(locationPayload['metadata']['accuracyMeters'], 12);

    final biometricSummary = BiometricImportSummary.fromRawText(
      biometricFile.readAsStringSync(),
      fileName: 'health.csv',
      size: biometricFile.lengthSync(),
    );
    final biometricAttachment = NativeAttachmentDraft.fromFilePath(
      biometricFile.path,
      sourceType: 'biometric',
      previewText: biometricSummary.summaryText,
      analysisText: biometricSummary.analysisText,
    );
    final biometricItem =
        CaptureQueueItem.biometric(biometricAttachment, biometricSummary);
    final biometricPayload = biometricItem.toExperiencePayload();
    expect(biometricPayload['category'], 'Salud');
    expect(biometricPayload['metadata']['syncContract'],
        'vibeapp-biometric-file-v1');
    expect(biometricPayload['metadata']['biometricImport']['recordCount'], 1);
    expect(
      (biometricPayload['attachments'] as List).single['sourceType'],
      'vibeapp-native-biometric',
    );
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
    await tester.pump();
    expect(find.text('Vibe entendió: guardar nota'), findsOneWidget);
    expect(find.text('Guardar nota'), findsOneWidget);
    await tester.tap(find.text('Guardar nota'));
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
