import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:vibeapp/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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
    expect(
        locationPayload['objective'], 'Ubicaci\u00f3n capturada desde Vibeapp');
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

  test('External session import profiles Meta and biometric sources correctly',
      () {
    final tempDir =
        Directory.systemTemp.createTempSync('vibeapp-external-profile-');
    addTearDown(() {
      if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
    });

    PlatformFile makeFile(String name, List<int> bytes) {
      final file = File('${tempDir.path}${Platform.pathSeparator}$name')
        ..writeAsBytesSync(bytes);
      return PlatformFile(name: name, size: bytes.length, path: file.path);
    }

    final metaItem = CaptureQueueItem.externalSession(
      const ExternalSessionImportDraft(
        source: ExternalSessionSource.metaGlasses,
        title: 'Paseo con lentes Meta',
        notes: 'Salida corta con lentes.',
      ),
      [
        makeFile('foto.heic', [1, 2, 3]),
        makeFile('clip.mp4', [4, 5, 6]),
        makeFile('meta-export.json', [7, 8, 9]),
      ],
    );
    final metaPayload = metaItem.toExperiencePayload();
    expect(metaPayload['metadata']['externalSessionContract'],
        'meta_glasses_import');
    final metaAttachments =
        metaPayload['attachments'] as List<Map<String, dynamic>>;
    expect(metaAttachments.length, 3);
    expect(metaAttachments[0]['sourceType'], 'vibeapp-native-image');
    expect(metaAttachments[0]['metadata']['externalPayloadType'],
        'social_memory_media');
    expect(metaAttachments[1]['sourceType'], 'vibeapp-native-video');
    expect(metaAttachments[1]['metadata']['externalProcessingIntent'],
        'video_key_moments_and_transcription');
    expect(metaAttachments[2]['sourceType'], 'vibeapp-native-document');
    expect(metaAttachments[2]['metadata']['externalPayloadType'],
        'account_export');
    expect(metaAttachments[2]['metadata']['externalAutoInterpret'], isFalse);
    expect(metaItem.validateForSync().canSync, isTrue);

    final ouraItem = CaptureQueueItem.externalSession(
      const ExternalSessionImportDraft(
        source: ExternalSessionSource.oura,
        title: 'Oura semanal',
        notes: 'Exportacion de salud.',
      ),
      [
        makeFile('oura-readiness.csv', utf8.encode('date,score\n2026-05-27,82'))
      ],
    );
    final ouraPayload = ouraItem.toExperiencePayload();
    final ouraAttachment =
        (ouraPayload['attachments'] as List<Map<String, dynamic>>).single;
    expect(ouraAttachment['sourceType'], 'vibeapp-native-biometric');
    expect(
        ouraAttachment['metadata']['externalPayloadType'], 'biometric_context');
    expect(ouraAttachment['metadata']['externalProcessingIntent'],
        'biometric_time_context');
    expect(ouraItem.validateForSync().canSync, isTrue);
  });

  test('Native sync client sends media, experience, and agenda requests',
      () async {
    final tempDir = Directory.systemTemp.createTempSync('vibeapp-sync-');
    addTearDown(() async {
      if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
    });

    final transport = FakeNativeSyncTransport();
    const settings = SyncSettings(
      apiBaseUrl: 'https://vibe.test',
      accessToken: 'test-token',
    );
    final client = ExperienceSyncClient(settings, transport: transport);
    final attachmentFile =
        File('${tempDir.path}${Platform.pathSeparator}nota.txt')
          ..writeAsStringSync('Contenido de prueba');
    final session = ActiveExperienceSession.start('Contrato sync');
    session.addTextEvent('Evento con documento.');
    session.addAttachmentEvent(NativeAttachmentDraft.fromFilePath(
      attachmentFile.path,
      sourceType: 'document',
    ));
    session.close();

    final experienceResult =
        await client.syncItem(CaptureQueueItem.fromSession(session));
    expect(experienceResult.ok, isTrue);
    expect(experienceResult.remoteId, 'remote-exp-1');

    final agendaResult = await client.syncItem(CaptureQueueItem.agenda(
      AgendaEventDraft(
        title: 'Cena de prueba',
        description: 'Validar agenda nativa',
        location: 'Casa',
        startAt: DateTime.utc(2026, 5, 27, 20),
        endAt: DateTime.utc(2026, 5, 27, 21),
      ),
    ));
    expect(agendaResult.ok, isTrue);
    expect(agendaResult.remoteId, 'remote-agenda-1');

    final mediaRequest =
        transport.requests.firstWhere((item) => item['path'] == '/api/media');
    expect(mediaRequest['method'], 'multipart');
    expect(mediaRequest['authorization'], 'Bearer test-token');
    expect(mediaRequest['metadata'],
        contains('"sourceType":"vibeapp-native-document"'));
    expect(mediaRequest['fileName'], 'nota.txt');

    final experienceRequest = transport.requests
        .firstWhere((item) => item['path'] == '/api/experiences');
    final experienceBody = experienceRequest['payload'] as Map<String, dynamic>;
    expect(experienceRequest['authorization'], 'Bearer test-token');
    expect(experienceBody['metadata']['syncContract'], 'vibeapp-session-v1');
    expect((experienceBody['events'] as List).length, 2);
    expect(
      (experienceBody['attachments'] as List).single['storage'],
      'supabase-storage',
    );

    final agendaRequest =
        transport.requests.firstWhere((item) => item['path'] == '/api/agenda');
    final agendaBody = agendaRequest['payload'] as Map<String, dynamic>;
    expect(agendaRequest['authorization'], 'Bearer test-token');
    expect(agendaBody['title'], 'Cena de prueba');
    expect(agendaBody['sourceType'], 'vibeapp-native-agenda');
  });

  test('Native sync client reports media and agenda failures clearly',
      () async {
    final tempDir = Directory.systemTemp.createTempSync('vibeapp-sync-fail-');
    addTearDown(() {
      if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
    });

    const settings = SyncSettings(
      apiBaseUrl: 'https://vibe.test',
      accessToken: 'test-token',
    );
    final attachmentFile =
        File('${tempDir.path}${Platform.pathSeparator}audio.webm')
          ..writeAsBytesSync([1, 2, 3, 4, 5]);
    final session = ActiveExperienceSession.start('Falla controlada');
    session.addTextEvent('Evento antes de adjuntar audio.');
    session.addAttachmentEvent(NativeAttachmentDraft.fromFilePath(
      attachmentFile.path,
      sourceType: 'audio',
    ));

    final mediaFailureTransport = FakeNativeSyncTransport(
      mediaStatusCode: 500,
      mediaBody: '{"error":"storage_down"}',
    );
    final mediaFailure = await ExperienceSyncClient(
      settings,
      transport: mediaFailureTransport,
    ).syncItem(CaptureQueueItem.fromSession(session));

    expect(mediaFailure.ok, isFalse);
    expect(mediaFailure.message, contains('Media HTTP 500'));
    expect(mediaFailure.message, contains('storage_down'));
    expect(
      mediaFailureTransport.requests
          .where((item) => item['path'] == '/api/experiences'),
      isEmpty,
    );

    final agendaFailureTransport = FakeNativeSyncTransport(
      agendaStatusCode: 503,
      agendaBody: '{"error":"agenda_unavailable"}',
    );
    final agendaFailure = await ExperienceSyncClient(
      settings,
      transport: agendaFailureTransport,
    ).syncItem(CaptureQueueItem.agenda(
      AgendaEventDraft(
        title: 'Cita no sincronizada',
        startAt: DateTime.utc(2026, 5, 27, 18),
        endAt: DateTime.utc(2026, 5, 27, 19),
      ),
    ));

    expect(agendaFailure.ok, isFalse);
    expect(agendaFailure.message, contains('Agenda HTTP 503'));
    expect(agendaFailure.message, contains('agenda_unavailable'));
  });

  test('Native queue validates files and retry state before sync', () {
    final tempDir = Directory.systemTemp.createTempSync('vibeapp-queue-');
    addTearDown(() {
      if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
    });

    final missingFile =
        File('${tempDir.path}${Platform.pathSeparator}missing.jpg')
          ..writeAsBytesSync([1, 2, 3]);
    final missingAttachment = NativeAttachmentDraft.fromFilePath(
      missingFile.path,
      sourceType: 'image',
    );
    missingFile.deleteSync();

    final missingItem = CaptureQueueItem.media(missingAttachment);
    final validation = missingItem.validateForSync();
    expect(validation.canSync, isFalse);
    expect(validation.primaryMessage, contains('No se encuentra el archivo'));

    final retryItem = CaptureQueueItem.text('Captura con reintento');
    expect(retryItem.canAttemptSyncNow, isTrue);
    retryItem.markAttemptStarted();
    expect(retryItem.status, CaptureSyncStatus.uploading);
    expect(retryItem.attemptCount, 1);
    expect(retryItem.lastAttemptAt, isNotNull);

    retryItem.markFailed('Fallo temporal de red');
    expect(retryItem.status, CaptureSyncStatus.failed);
    expect(retryItem.error, 'Fallo temporal de red');
    expect(retryItem.nextRetryAt, isNotNull);
    expect(retryItem.canAttemptSyncNow, isFalse);
    expect(retryItem.retryDescription, contains('Reintento automatico'));

    final restored = CaptureQueueItem.fromJson(retryItem.toJson());
    expect(restored.status, CaptureSyncStatus.failed);
    expect(restored.attemptCount, 1);
    expect(restored.nextRetryAt, isNotNull);

    retryItem.markSynced('remote-text-1');
    expect(retryItem.status, CaptureSyncStatus.synced);
    expect(retryItem.remoteId, 'remote-text-1');
    expect(retryItem.error, isEmpty);
    expect(retryItem.nextRetryAt, isNull);
    expect(retryItem.retryDescription, isEmpty);

    final terminalFailure = CaptureQueueItem.text('Archivo invalido');
    terminalFailure.markFailed('No se encuentra el archivo', retryable: false);
    expect(terminalFailure.status, CaptureSyncStatus.failed);
    expect(terminalFailure.nextRetryAt, isNull);
    expect(terminalFailure.canAttemptSyncNow, isTrue);
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

class FakeNativeSyncTransport implements NativeSyncTransport {
  FakeNativeSyncTransport({
    this.mediaStatusCode = 200,
    this.mediaBody = '',
    this.experienceStatusCode = 200,
    this.experienceBody = '{"id":"remote-exp-1"}',
    this.agendaStatusCode = 200,
    this.agendaBody = '{"id":"remote-agenda-1"}',
  });

  final requests = <Map<String, dynamic>>[];
  final int mediaStatusCode;
  final String mediaBody;
  final int experienceStatusCode;
  final String experienceBody;
  final int agendaStatusCode;
  final String agendaBody;

  @override
  Future<NativeSyncResponse> postJson(
    Uri uri, {
    required String accessToken,
    required Object payload,
  }) async {
    requests.add({
      'method': 'json',
      'path': uri.path,
      'authorization': 'Bearer $accessToken',
      'payload': payload,
    });
    if (uri.path == '/api/experiences') {
      return NativeSyncResponse(
        statusCode: experienceStatusCode,
        body: experienceBody,
      );
    }
    if (uri.path == '/api/agenda') {
      return NativeSyncResponse(
        statusCode: agendaStatusCode,
        body: agendaBody,
      );
    }
    return const NativeSyncResponse(statusCode: 404, body: '{"error":"no"}');
  }

  @override
  Future<NativeSyncResponse> postMultipart(
    Uri uri, {
    required String accessToken,
    required NativeAttachmentDraft attachment,
    required List<int> bytes,
    required String boundary,
    required String metadata,
  }) async {
    requests.add({
      'method': 'multipart',
      'path': uri.path,
      'authorization': 'Bearer $accessToken',
      'fileName': attachment.name,
      'mimeType': attachment.mimeType,
      'bytes': bytes.length,
      'boundary': boundary,
      'metadata': metadata,
    });
    return NativeSyncResponse(
      statusCode: mediaStatusCode,
      body: mediaBody.isNotEmpty
          ? mediaBody
          : jsonEncode({
              'id': 'remote-media-1',
              'name': attachment.name,
              'type': attachment.mimeType,
              'originalType': attachment.mimeType,
              'size': bytes.length,
              'kind': attachment.kind,
              'storage': 'supabase-storage',
              'path': 'user/native/${attachment.name}',
              'url': 'signed://${attachment.name}',
              'metadata': {'server': 'fake'},
            }),
    );
  }
}
