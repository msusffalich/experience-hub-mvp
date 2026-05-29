import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

void main() {
  runApp(const VibeApp());
}

class VibeApp extends StatelessWidget {
  const VibeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Vibeapp',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0D7C66)),
        useMaterial3: true,
      ),
      home: const QuickCaptureScreen(),
    );
  }
}

class QuickCaptureScreen extends StatefulWidget {
  const QuickCaptureScreen({super.key});

  @override
  State<QuickCaptureScreen> createState() => _QuickCaptureScreenState();
}

class _QuickCaptureScreenState extends State<QuickCaptureScreen> {
  final ImagePicker _imagePicker = ImagePicker();
  final AudioRecorder _audioRecorder = AudioRecorder();
  final TextEditingController _noteController = TextEditingController();
  final TextEditingController _apiUrlController = TextEditingController(
      text: 'https://experience-hub-web-production.up.railway.app');
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _sessionTitleController = TextEditingController();
  final List<CaptureQueueItem> _queue = [];
  Timer? _retryTimer;
  SyncState _syncState = SyncState.ready;
  String _accessToken = '';
  String _signedInEmail = '';
  ActiveExperienceSession? _activeSession;
  bool _isRecordingAudio = false;
  String _audioRecordingPath = '';
  bool _autoRetryRunning = false;
  bool _isCheckingBackend = false;
  bool _backendHealthOk = false;
  String _backendHealthMessage = 'Verifica el backend antes del piloto móvil.';

  @override
  void initState() {
    super.initState();
    _noteController.addListener(_handleNoteChanged);
    unawaited(_loadPersistedQueue());
    _retryTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => unawaited(_autoRetryDueQueue()),
    );
  }

  @override
  void dispose() {
    _noteController.removeListener(_handleNoteChanged);
    _noteController.dispose();
    _apiUrlController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _sessionTitleController.dispose();
    _retryTimer?.cancel();
    unawaited(_audioRecorder.dispose());
    super.dispose();
  }

  void _handleNoteChanged() {
    if (mounted) setState(() {});
  }

  Future<File> _queueStorageFile() async {
    final directory = await getApplicationDocumentsDirectory();
    return File(
        '${directory.path}${Platform.pathSeparator}vibeapp-capture-queue.json');
  }

  Future<void> _loadPersistedQueue() async {
    try {
      final file = await _queueStorageFile();
      if (!await file.exists()) return;
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map || decoded['queue'] is! List) return;
      final restored = (decoded['queue'] as List)
          .whereType<Map>()
          .map((item) =>
              CaptureQueueItem.fromJson(Map<String, dynamic>.from(item)))
          .whereType<CaptureQueueItem>()
          .toList();
      if (!mounted || restored.isEmpty) return;
      setState(() {
        _queue
          ..clear()
          ..addAll(restored);
        _syncState = restored.any((item) =>
                item.canSync && item.status != CaptureSyncStatus.synced)
            ? SyncState.needsAttention
            : SyncState.ready;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
    }
  }

  Future<void> _saveQueue() async {
    try {
      final file = await _queueStorageFile();
      await file.writeAsString(jsonEncode({
        'version': 1,
        'savedAt': DateTime.now().toUtc().toIso8601String(),
        'queue': _queue.map((item) => item.toJson()).toList(),
      }));
    } catch (_) {
      // Queue persistence is a local safety net; remote sync continues even
      // when the device cannot update this cache file.
    }
  }

  Future<void> _signIn() async {
    final settings = SyncSettings(
      apiBaseUrl: _apiUrlController.text.trim(),
      accessToken: _accessToken,
    );
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) return;
    setState(() => _syncState = SyncState.syncing);
    final result = await VibeAuthClient(settings).signIn(email, password);
    if (!mounted) return;
    if (result.ok && result.accessToken.isNotEmpty) {
      setState(() {
        _accessToken = result.accessToken;
        _signedInEmail = email;
        _syncState = SyncState.synced;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sesión lista. Reintentando cola.')),
      );
      await _syncPendingQueue(showSnackBar: true);
    } else {
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.message)),
      );
    }
  }

  Future<void> _verifyBackendHealth() async {
    final baseUrl = _apiUrlController.text.trim();
    if (baseUrl.isEmpty) {
      setState(() {
        _backendHealthOk = false;
        _backendHealthMessage = 'Define la URL de Vibe antes de verificar.';
      });
      return;
    }
    setState(() => _isCheckingBackend = true);
    try {
      final uri = Uri.parse(baseUrl).resolve('/api/health');
      final request =
          await HttpClient().getUrl(uri).timeout(const Duration(seconds: 8));
      final response =
          await request.close().timeout(const Duration(seconds: 12));
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError('HTTP ${response.statusCode}: ${shorten(body)}');
      }
      final decoded = jsonDecode(body);
      final data = decoded is Map<String, dynamic> ? decoded : {};
      final persistence = stringFromJson(data['persistence']);
      final storage = stringFromJson(data['mediaStorage']);
      final mode = stringFromJson(data['deploymentMode']);
      final supabaseReady = data['supabaseConfigured'] == true;
      if (!mounted) return;
      setState(() {
        _backendHealthOk = supabaseReady && persistence.contains('supabase');
        _backendHealthMessage = _backendHealthOk
            ? 'Backend listo: $mode · $persistence · $storage.'
            : 'Backend responde, pero falta confirmar Supabase/Storage.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _backendHealthOk = false;
        _backendHealthMessage =
            'No se pudo verificar Vibe: ${shorten(error.toString())}';
      });
    } finally {
      if (mounted) {
        setState(() => _isCheckingBackend = false);
      }
    }
  }

  Future<void> _saveDraft() async {
    final text = _noteController.text.trim();
    if (text.isEmpty) return;
    final command = NativeQuickCommand.parse(text);

    if (command.type == NativeQuickCommandType.closeExperience) {
      _noteController.clear();
      await _closeExperienceSession();
      return;
    }

    if (command.type == NativeQuickCommandType.startExperience) {
      final title = command.cleanedText.isEmpty
          ? 'Experiencia desde Vibeapp'
          : command.cleanedText;
      setState(() {
        if (_activeSession == null) {
          _activeSession = ActiveExperienceSession.start(title);
        } else {
          _activeSession!.addTextEvent('Nuevo tramo: $title');
          _upsertSessionQueueItem(_activeSession!);
        }
        _noteController.clear();
        _syncState = SyncState.ready;
      });
      await _saveQueue();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Experiencia activa: $title')),
      );
      return;
    }

    if (command.type == NativeQuickCommandType.agenda &&
        command.agenda != null) {
      _noteController.clear();
      _queueAgendaEvent(command.agenda!);
      return;
    }

    final noteText = command.cleanedText.isEmpty ? text : command.cleanedText;
    final session = _activeSession;
    setState(() {
      if (session == null) {
        _queue.insert(0, CaptureQueueItem.text(noteText));
      } else {
        session.addTextEvent(noteText);
        _upsertSessionQueueItem(session);
      }
      _noteController.clear();
      _syncState = SyncState.syncing;
    });
    await _syncPendingQueue(showSnackBar: true);
  }

  Future<void> _syncPendingQueue({
    bool showSnackBar = false,
    bool force = false,
  }) async {
    final settings = SyncSettings(
      apiBaseUrl: _apiUrlController.text.trim(),
      accessToken: _accessToken,
    );
    final pending = _queue
        .where(
            (item) => item.canSync && item.status != CaptureSyncStatus.synced)
        .where((item) => force || item.canAttemptSyncNow)
        .toList();

    if (pending.isEmpty) {
      final waitingRetry = _queue.any((item) =>
          item.canSync &&
          item.status != CaptureSyncStatus.synced &&
          !item.canAttemptSyncNow);
      setState(() => _syncState =
          waitingRetry ? SyncState.needsAttention : SyncState.ready);
      await _saveQueue();
      return;
    }

    if (!settings.hasSession) {
      setState(() {
        for (final item in pending) {
          item.status = CaptureSyncStatus.needsSession;
          item.error = 'Falta iniciar sesion para enviar a Supabase.';
        }
        _syncState = SyncState.needsAttention;
      });
      if (showSnackBar && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text(
                  'Captura guardada localmente. Falta token de sesión para sincronizar.')),
        );
      }
      await _saveQueue();
      return;
    }

    final client = ExperienceSyncClient(settings);
    var failures = 0;
    for (final item in pending) {
      final validation = item.validateForSync();
      if (!validation.canSync) {
        failures += 1;
        setState(() {
          item.markFailed(validation.primaryMessage, retryable: false);
          _syncState = SyncState.needsAttention;
        });
        continue;
      }
      setState(() {
        item.markAttemptStarted();
        _syncState = SyncState.syncing;
      });
      final result = await client.syncItem(item);
      if (!mounted) return;
      setState(() {
        if (result.ok) {
          item.markSynced(result.remoteId ?? item.id);
        } else {
          failures += 1;
          item.markFailed(result.message);
        }
      });
    }

    if (!mounted) return;
    setState(() => _syncState =
        failures == 0 ? SyncState.synced : SyncState.needsAttention);
    await _saveQueue();
    if (!mounted) return;
    if (showSnackBar) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            failures == 0
                ? 'Captura sincronizada con Vibe PWA.'
                : 'Captura en cola. Revisa conexión o sesión.',
          ),
        ),
      );
    }
  }

  Future<void> _autoRetryDueQueue() async {
    if (!mounted || _autoRetryRunning || _accessToken.isEmpty) return;
    if (_syncState == SyncState.syncing) return;
    final due = _queue.any((item) =>
        item.canSync &&
        item.status != CaptureSyncStatus.synced &&
        item.canAttemptSyncNow);
    if (!due) return;
    _autoRetryRunning = true;
    try {
      await _syncPendingQueue();
    } finally {
      _autoRetryRunning = false;
    }
  }

  void _registerNativeAction(NativeCaptureAction action) {
    setState(() {
      _syncState = SyncState.needsAttention;
      final session = _activeSession;
      if (session == null) {
        _queue.insert(0, CaptureQueueItem.nativeAction(action));
      } else {
        session.addNativeAction(action);
        _upsertSessionQueueItem(session);
      }
    });
    unawaited(_saveQueue());
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content: Text(
              '${action.label}: contrato definido; falta conectar plugin nativo.')),
    );
  }

  Future<void> _openAgendaSheet() async {
    final titleController = TextEditingController();
    final locationController = TextEditingController();
    final notesController = TextEditingController();
    var selectedDate = DateTime.now();
    var selectedTime = TimeOfDay.now();
    var durationMinutes = 60;

    final draft = await showModalBottomSheet<AgendaEventDraft>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              bottom: MediaQuery.of(context).viewInsets.bottom + 16,
              top: 8,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Crear evento de agenda',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'El evento se guarda en Vibe para verlo desde la PWA y otros dispositivos.',
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: titleController,
                    decoration: const InputDecoration(
                      labelText: 'Título',
                      hintText: 'Cena, reunión, visita, recordatorio...',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: selectedDate,
                            firstDate: DateTime.now()
                                .subtract(const Duration(days: 365)),
                            lastDate: DateTime.now()
                                .add(const Duration(days: 365 * 3)),
                          );
                          if (date != null) {
                            setSheetState(() => selectedDate = date);
                          }
                        },
                        icon: const Icon(Icons.calendar_month_outlined),
                        label: Text(formatDateLabel(selectedDate)),
                      ),
                      OutlinedButton.icon(
                        onPressed: () async {
                          final time = await showTimePicker(
                            context: context,
                            initialTime: selectedTime,
                          );
                          if (time != null) {
                            setSheetState(() => selectedTime = time);
                          }
                        },
                        icon: const Icon(Icons.schedule_outlined),
                        label: Text(selectedTime.format(context)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    initialValue: durationMinutes,
                    decoration: const InputDecoration(
                      labelText: 'Duración',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 15, child: Text('15 minutos')),
                      DropdownMenuItem(value: 30, child: Text('30 minutos')),
                      DropdownMenuItem(value: 60, child: Text('1 hora')),
                      DropdownMenuItem(value: 120, child: Text('2 horas')),
                      DropdownMenuItem(value: 180, child: Text('3 horas')),
                    ],
                    onChanged: (value) {
                      if (value != null) {
                        setSheetState(() => durationMinutes = value);
                      }
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: locationController,
                    decoration: const InputDecoration(
                      labelText: 'Lugar',
                      hintText: 'Opcional',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Notas',
                      hintText: 'Detalles útiles para recordar o preparar.',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        final title = titleController.text.trim();
                        if (title.isEmpty) return;
                        final start = DateTime(
                          selectedDate.year,
                          selectedDate.month,
                          selectedDate.day,
                          selectedTime.hour,
                          selectedTime.minute,
                        );
                        Navigator.of(context).pop(AgendaEventDraft(
                          title: title,
                          description: notesController.text.trim(),
                          location: locationController.text.trim(),
                          startAt: start.toUtc(),
                          endAt: start
                              .add(Duration(minutes: durationMinutes))
                              .toUtc(),
                        ));
                      },
                      icon: const Icon(Icons.event_available_outlined),
                      label: const Text('Guardar evento'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    titleController.dispose();
    locationController.dispose();
    notesController.dispose();
    if (draft == null) return;
    _queueAgendaEvent(draft);
  }

  void _queueAgendaEvent(AgendaEventDraft draft) {
    setState(() {
      final session = _activeSession;
      _queue.insert(0, CaptureQueueItem.agenda(draft));
      if (session != null) {
        session.addAgendaEvent(draft);
        _upsertSessionQueueItem(session);
      }
      _syncState = SyncState.syncing;
    });
    unawaited(_syncPendingQueue(showSnackBar: true));
  }

  Future<void> _captureLocation() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (!mounted) return;
        setState(() => _syncState = SyncState.needsAttention);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'Activa ubicación en el dispositivo para capturar el lugar.'),
          ),
        );
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (!mounted) return;
        setState(() => _syncState = SyncState.needsAttention);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Autoriza ubicación para guardar el lugar real.'),
          ),
        );
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      final location = LocationDraft.fromPosition(position);
      final session = _activeSession;
      setState(() {
        if (session == null) {
          _queue.insert(0, CaptureQueueItem.location(location));
        } else {
          session.addLocationEvent(location);
          _upsertSessionQueueItem(session);
        }
        _syncState = SyncState.syncing;
      });
      await _syncPendingQueue(showSnackBar: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'No se pudo capturar ubicación: ${shorten(error.toString())}'),
        ),
      );
    }
  }

  Future<void> _importBiometricFile() async {
    try {
      final picked = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['csv', 'json'],
        withData: false,
      );
      final filePath = picked?.files.single.path;
      if (filePath == null || filePath.isEmpty) return;
      final file = File(filePath);
      final rawText =
          utf8.decode(await file.readAsBytes(), allowMalformed: true);
      final summary = BiometricImportSummary.fromRawText(
        rawText,
        fileName: picked!.files.single.name,
        size: picked.files.single.size,
      );
      final attachment = NativeAttachmentDraft.fromFilePath(
        filePath,
        sourceType: 'biometric',
        previewText: summary.summaryText,
        analysisText: summary.analysisText,
        metadataExtras: {
          'payloadType': 'biometric',
          'extractedText':
              rawText.length > 12000 ? rawText.substring(0, 12000) : rawText,
          'extractionMethod': 'vibeapp-biometric-file-import',
          'extractionStatus': 'automatic',
          'biometricImport': summary.toJson(),
        },
      );
      final session = _activeSession;
      setState(() {
        if (session == null) {
          _queue.insert(0, CaptureQueueItem.biometric(attachment, summary));
        } else {
          session.addBiometricAttachment(attachment, summary);
          _upsertSessionQueueItem(session);
        }
        _syncState = SyncState.syncing;
      });
      await _syncPendingQueue(showSnackBar: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'No se pudo importar biometría: ${shorten(error.toString())}'),
        ),
      );
    }
  }

  Future<void> _importExternalSession() async {
    final titleController = TextEditingController();
    final notesController = TextEditingController();
    var selectedSource = ExternalSessionSource.metaGlasses;

    final draft = await showModalBottomSheet<ExternalSessionImportDraft>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              bottom: MediaQuery.of(context).viewInsets.bottom + 16,
              top: 8,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Importar sesion externa',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Usa este flujo para traer material de Meta/Oakley, Oura, Apple Health, Samsung Health, Health Connect o una carpeta del telefono. Vibeapp lo agrupa como una experiencia y lo envia a Vibe.',
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<ExternalSessionSource>(
                    initialValue: selectedSource,
                    decoration: const InputDecoration(
                      labelText: 'Origen',
                      border: OutlineInputBorder(),
                    ),
                    items: ExternalSessionSource.values
                        .map(
                          (source) => DropdownMenuItem(
                            value: source,
                            child: Text(source.label),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setSheetState(() => selectedSource = value);
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  ExternalSessionSourceGuide(source: selectedSource),
                  const SizedBox(height: 12),
                  TextField(
                    controller: titleController,
                    decoration: const InputDecoration(
                      labelText: 'Titulo de la experiencia',
                      hintText: 'Ejemplo: Paseo con lentes Meta',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    minLines: 3,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      labelText: 'Contexto',
                      hintText:
                          'Lugar, personas, intencion o detalle que ayude a interpretar los archivos.',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop(ExternalSessionImportDraft(
                          source: selectedSource,
                          title: titleController.text.trim().isEmpty
                              ? selectedSource.defaultTitle
                              : titleController.text.trim(),
                          notes: notesController.text.trim(),
                        ));
                      },
                      icon: const Icon(Icons.folder_open_outlined),
                      label: const Text('Elegir archivos'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    titleController.dispose();
    notesController.dispose();
    if (draft == null) return;

    try {
      final picked = await FilePicker.pickFiles(
        allowMultiple: true,
        type: FileType.custom,
        allowedExtensions: const [
          'jpg',
          'jpeg',
          'png',
          'webp',
          'gif',
          'heic',
          'heif',
          'mp4',
          'mov',
          'm4v',
          'webm',
          'hevc',
          'mp3',
          'm4a',
          'wav',
          'aac',
          'ogg',
          'pdf',
          'doc',
          'docx',
          'txt',
          'md',
          'csv',
          'json',
          'zip',
        ],
        withData: false,
      );
      final files = picked?.files
              .where((file) => (file.path ?? '').isNotEmpty)
              .toList() ??
          const <PlatformFile>[];
      if (files.isEmpty) return;
      final item = CaptureQueueItem.externalSession(draft, files);
      setState(() {
        _queue.insert(0, item);
        _syncState = SyncState.syncing;
      });
      await _syncPendingQueue(showSnackBar: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'No se pudo importar la sesion: ${shorten(error.toString())}'),
        ),
      );
    }
  }

  Future<void> _openPhotoCaptureSheet() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Agregar foto',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              const Text(
                'Puedes tomar una foto nueva o elegir una imagen existente. Vibeapp la sube a Storage privado y la vincula a la experiencia.',
              ),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Tomar foto'),
                onTap: () => Navigator.of(context).pop(ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Elegir imagen'),
                onTap: () => Navigator.of(context).pop(ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null) return;
    await _capturePhoto(source);
  }

  Future<void> _openVideoCaptureSheet() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Agregar video',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              const Text(
                'Puedes grabar un video nuevo o elegir uno existente. Vibeapp lo sube a Storage privado y lo vincula a la experiencia.',
              ),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.videocam_outlined),
                title: const Text('Grabar video'),
                onTap: () => Navigator.of(context).pop(ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.video_library_outlined),
                title: const Text('Elegir video'),
                onTap: () => Navigator.of(context).pop(ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null) return;
    await _captureVideo(source);
  }

  Future<void> _capturePhoto(ImageSource source) async {
    try {
      final picked = await _imagePicker.pickImage(
        source: source,
        imageQuality: 92,
        maxWidth: 2400,
      );
      if (picked == null) return;
      final attachment = await NativeAttachmentDraft.fromXFile(
        picked,
        sourceType: 'image',
      );
      final session = _activeSession;
      setState(() {
        if (session == null) {
          _queue.insert(0, CaptureQueueItem.media(attachment));
        } else {
          session.addAttachmentEvent(attachment);
          _upsertSessionQueueItem(session);
        }
        _syncState = SyncState.syncing;
      });
      await _syncPendingQueue(showSnackBar: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                'No se pudo agregar la foto: ${shorten(error.toString())}')),
      );
    }
  }

  Future<void> _captureVideo(ImageSource source) async {
    try {
      final picked = await _imagePicker.pickVideo(
        source: source,
        maxDuration: const Duration(minutes: 5),
      );
      if (picked == null) return;
      final attachment = await NativeAttachmentDraft.fromXFile(
        picked,
        sourceType: 'video',
      );
      final session = _activeSession;
      setState(() {
        if (session == null) {
          _queue.insert(0, CaptureQueueItem.media(attachment));
        } else {
          session.addAttachmentEvent(attachment);
          _upsertSessionQueueItem(session);
        }
        _syncState = SyncState.syncing;
      });
      await _syncPendingQueue(showSnackBar: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                'No se pudo agregar el video: ${shorten(error.toString())}')),
      );
    }
  }

  Future<void> _toggleAudioRecording() async {
    if (_isRecordingAudio) {
      await _stopAudioRecording();
    } else {
      await _startAudioRecording();
    }
  }

  Future<void> _startAudioRecording() async {
    try {
      if (!await _audioRecorder.hasPermission()) {
        if (!mounted) return;
        setState(() => _syncState = SyncState.needsAttention);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Autoriza el microfono para grabar audio.'),
          ),
        );
        return;
      }
      final dir = await getTemporaryDirectory();
      final path =
          '${dir.path}${Platform.pathSeparator}vibeapp-audio-${DateTime.now().millisecondsSinceEpoch}.m4a';
      const config = RecordConfig(
        encoder: AudioEncoder.aacLc,
        numChannels: 1,
        sampleRate: 44100,
        bitRate: 128000,
      );
      await _audioRecorder.start(config, path: path);
      if (!mounted) return;
      setState(() {
        _isRecordingAudio = true;
        _audioRecordingPath = path;
        _syncState = SyncState.ready;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Grabando audio. Pulsa Audio para detener.')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text('No se pudo iniciar audio: ${shorten(error.toString())}'),
        ),
      );
    }
  }

  Future<void> _stopAudioRecording() async {
    try {
      final path = await _audioRecorder.stop();
      final resolvedPath =
          (path == null || path.isEmpty) ? _audioRecordingPath : path;
      if (!mounted) return;
      setState(() {
        _isRecordingAudio = false;
        _audioRecordingPath = '';
      });
      if (resolvedPath.isEmpty) return;
      final attachment = NativeAttachmentDraft.fromFilePath(
        resolvedPath,
        sourceType: 'audio',
      );
      final session = _activeSession;
      setState(() {
        if (session == null) {
          _queue.insert(0, CaptureQueueItem.media(attachment));
        } else {
          session.addAttachmentEvent(attachment);
          _upsertSessionQueueItem(session);
        }
        _syncState = SyncState.syncing;
      });
      await _syncPendingQueue(showSnackBar: true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isRecordingAudio = false;
        _syncState = SyncState.needsAttention;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text('No se pudo guardar el audio: ${shorten(error.toString())}'),
        ),
      );
    }
  }

  void _startExperienceSession() {
    final title = _sessionTitleController.text.trim().isEmpty
        ? 'Experiencia desde Vibeapp'
        : _sessionTitleController.text.trim();
    setState(() {
      _activeSession = ActiveExperienceSession.start(title);
      _syncState = SyncState.ready;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Experiencia activa: $title')),
    );
  }

  Future<void> _closeExperienceSession() async {
    final session = _activeSession;
    if (session == null) return;
    setState(() {
      session.close();
      _upsertSessionQueueItem(session);
      _activeSession = null;
      _sessionTitleController.clear();
      _syncState = SyncState.syncing;
    });
    await _syncPendingQueue(showSnackBar: true);
  }

  void _upsertSessionQueueItem(ActiveExperienceSession session) {
    final item = CaptureQueueItem.fromSession(session);
    final index = _queue.indexWhere((queued) => queued.id == item.id);
    if (index >= 0) {
      final previous = _queue[index];
      item.remoteId = previous.remoteId;
      item.attemptCount = previous.attemptCount;
      item.lastAttemptAt = previous.lastAttemptAt;
      item.nextRetryAt = previous.nextRetryAt;
      item.status = previous.status == CaptureSyncStatus.synced
          ? CaptureSyncStatus.queued
          : previous.status;
      if (item.status == CaptureSyncStatus.needsSession ||
          item.status == CaptureSyncStatus.failed) {
        item.status = CaptureSyncStatus.queued;
      }
      _queue[index] = item;
    } else {
      _queue.insert(0, item);
    }
  }

  Future<void> _clearSyncedQueueItems() async {
    setState(() {
      _queue.removeWhere((item) => item.status == CaptureSyncStatus.synced);
      _syncState = _queue.any(
              (item) => item.canSync && item.status != CaptureSyncStatus.synced)
          ? SyncState.needsAttention
          : SyncState.ready;
    });
    await _saveQueue();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Capturas sincronizadas limpiadas.')),
    );
  }

  Future<void> _prepareHealthConnectPilotBundle() async {
    final bundle = HealthConnectPreviewBundle.pilot();
    setState(() {
      _queue.insert(0, CaptureQueueItem.healthConnect(bundle));
      _syncState = SyncState.syncing;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Contexto Health Connect preparado. Se sincronizara como biometria transversal.',
        ),
      ),
    );
    await _syncPendingQueue(showSnackBar: true);
  }

  @override
  Widget build(BuildContext context) {
    final commandPreview = _noteController.text.trim().isEmpty
        ? null
        : NativeQuickCommand.parse(_noteController.text);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Vibeapp'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(child: SyncBadge(state: _syncState)),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Captura rápida',
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'Registra una nota al paso. Si hay sesión, Vibeapp la envía al backend de Vibe para que aparezca en la PWA.',
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _noteController,
              minLines: 5,
              maxLines: 8,
              decoration: const InputDecoration(
                labelText: 'Nota',
                hintText:
                    'Ejemplo: V, toma nota que estoy llegando al museo...',
                border: OutlineInputBorder(),
              ),
            ),
            if (commandPreview != null) ...[
              const SizedBox(height: 12),
              NativeCommandPreviewCard(command: commandPreview),
            ],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _saveDraft,
              icon: const Icon(Icons.cloud_upload_outlined),
              label: Text(commandPreview == null
                  ? 'Guardar captura'
                  : commandPreview.primaryActionLabel),
            ),
            const SizedBox(height: 24),
            ExperienceSessionCard(
              titleController: _sessionTitleController,
              session: _activeSession,
              onStart: _startExperienceSession,
              onClose: _closeExperienceSession,
            ),
            const SizedBox(height: 16),
            NativePilotReadinessCard(
              backendOk: _backendHealthOk,
              backendMessage: _backendHealthMessage,
              checkingBackend: _isCheckingBackend,
              signedInEmail: _signedInEmail,
              queue: _queue,
              onVerifyBackend: _verifyBackendHealth,
            ),
            const SizedBox(height: 16),
            const NativeFlowSummary(),
            const SizedBox(height: 16),
            ExternalSessionImportCard(onImport: _importExternalSession),
            const SizedBox(height: 16),
            HealthConnectBridgeCard(
              permissionPlan: HealthConnectPermissionPlan.pilot(),
              onPreparePilotBundle: _prepareHealthConnectPilotBundle,
            ),
            const SizedBox(height: 16),
            SyncSettingsCard(
              apiUrlController: _apiUrlController,
              emailController: _emailController,
              passwordController: _passwordController,
              signedInEmail: _signedInEmail,
              onSignIn: _signIn,
              onRetry: _syncPendingQueue,
            ),
            const SizedBox(height: 16),
            CaptureActionGrid(
              onAction: _registerNativeAction,
              onAudio: _toggleAudioRecording,
              onPhoto: _openPhotoCaptureSheet,
              onVideo: _openVideoCaptureSheet,
              onAgenda: _openAgendaSheet,
              onLocation: _captureLocation,
              onBiometrics: _importBiometricFile,
              isRecordingAudio: _isRecordingAudio,
            ),
            const SizedBox(height: 16),
            CaptureQueuePanel(
              queue: _queue,
              onClearSynced: _clearSyncedQueueItems,
            ),
          ],
        ),
      ),
    );
  }
}

class NativeFlowSummary extends StatelessWidget {
  const NativeFlowSummary({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Contrato nativo',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'La app nativa captura permisos reales del dispositivo, guarda en cola local y sincroniza con Supabase a través del backend de Vibe.',
            ),
          ],
        ),
      ),
    );
  }
}

class NativePilotChecklist {
  const NativePilotChecklist({required this.items});

  factory NativePilotChecklist.fromState({
    required bool backendOk,
    required String signedInEmail,
    required CaptureQueueSummary queueSummary,
  }) {
    return NativePilotChecklist(items: [
      NativePilotCheckItem(
        id: 'backend',
        title: 'Backend Vibe',
        detail: backendOk
            ? 'API productiva respondio con Supabase activo.'
            : 'Verifica /api/health antes de probar en telefono.',
        ok: backendOk,
        critical: true,
      ),
      NativePilotCheckItem(
        id: 'session',
        title: 'Sesion',
        detail: signedInEmail.isEmpty
            ? 'Entra con el mismo usuario de la PWA.'
            : 'Sesion activa para $signedInEmail.',
        ok: signedInEmail.isNotEmpty,
        critical: true,
      ),
      NativePilotCheckItem(
        id: 'queue',
        title: 'Cola local',
        detail: queueSummary.operatorMessage,
        ok: queueSummary.isClear,
        critical: queueSummary.needsUserAction > 0,
      ),
      const NativePilotCheckItem(
        id: 'quick-note',
        title: 'Nota rapida',
        detail: 'Comando V, nota y experiencia activa cubiertos por pruebas.',
        ok: true,
      ),
      const NativePilotCheckItem(
        id: 'media',
        title: 'Foto, video y audio',
        detail: 'Contratos nativos y subida a /api/media verificados.',
        ok: true,
      ),
      const NativePilotCheckItem(
        id: 'context',
        title: 'Agenda, lugar y biometria',
        detail:
            'Agenda, lugar y biometria usan /api/integration/ingest validado.',
        ok: true,
      ),
      const NativePilotCheckItem(
        id: 'external-sources',
        title: 'Fuentes externas',
        detail:
            'Meta/Oakley, Oura, Apple Health, Samsung, Health Connect y galeria tienen perfiles.',
        ok: true,
      ),
      const NativePilotCheckItem(
        id: 'health-connect',
        title: 'Health Connect Android',
        detail:
            'Permisos Android y paquete piloto cubren Samsung/Galaxy por pasos, pulso, sueno y actividad.',
        ok: true,
      ),
      const NativePilotCheckItem(
        id: 'handoff',
        title: 'Lectura en PWA',
        detail: 'PWA usa experiencias, eventos y activos creados por Vibeapp.',
        ok: true,
      ),
    ]);
  }

  final List<NativePilotCheckItem> items;

  int get ready => items.where((item) => item.ok).length;
  int get total => items.length;
  int get score => total == 0 ? 0 : (ready / total * 100).round();
  List<NativePilotCheckItem> get blockers =>
      items.where((item) => !item.ok && item.critical).toList();
  bool get canRunPilot => blockers.isEmpty && score >= 85;
  String get summary {
    if (canRunPilot) {
      return 'Listo para prueba controlada: captura, cola y lectura PWA tienen criterio verificable.';
    }
    if (blockers.isNotEmpty) {
      return 'Antes del piloto: ${blockers.map((item) => item.title).join(', ')}.';
    }
    return 'Preparacion parcial: revisa los puntos pendientes antes de ampliar pruebas.';
  }
}

class NativePilotCheckItem {
  const NativePilotCheckItem({
    required this.id,
    required this.title,
    required this.detail,
    required this.ok,
    this.critical = false,
  });

  final String id;
  final String title;
  final String detail;
  final bool ok;
  final bool critical;
}

class NativePilotReadinessCard extends StatelessWidget {
  const NativePilotReadinessCard({
    required this.backendOk,
    required this.backendMessage,
    required this.checkingBackend,
    required this.signedInEmail,
    required this.queue,
    required this.onVerifyBackend,
    super.key,
  });

  final bool backendOk;
  final String backendMessage;
  final bool checkingBackend;
  final String signedInEmail;
  final List<CaptureQueueItem> queue;
  final Future<void> Function() onVerifyBackend;

  @override
  Widget build(BuildContext context) {
    final queueSummary = CaptureQueueSummary.fromItems(queue);
    final checklist = NativePilotChecklist.fromState(
      backendOk: backendOk,
      signedInEmail: signedInEmail,
      queueSummary: queueSummary,
    );
    final score = checklist.score;
    final color = score >= 85
        ? Colors.green
        : score >= 60
            ? Colors.orange
            : Colors.red;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Compuerta piloto móvil',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                Chip(
                  avatar: Icon(
                    score >= 85
                        ? Icons.verified_outlined
                        : Icons.warning_amber_outlined,
                    color: color,
                    size: 18,
                  ),
                  label: Text('$score%'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Usa esta tarjeta antes de probar en teléfono: confirma backend, sesión, cola y capacidades nativas sin exponer Supabase al usuario final.',
            ),
            const SizedBox(height: 6),
            Text(
              checklist.summary,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ReadinessChip(
                  ok: backendOk,
                  label: 'Backend',
                  detail: backendMessage,
                ),
                ReadinessChip(
                  ok: signedInEmail.isNotEmpty,
                  label: 'Sesión',
                  detail: signedInEmail.isEmpty
                      ? 'Falta entrar con usuario Vibe.'
                      : signedInEmail,
                ),
                ReadinessChip(
                  ok: queueSummary.isClear,
                  label: 'Cola',
                  detail: queueSummary.operatorMessage,
                ),
                const ReadinessChip(
                  ok: true,
                  label: 'Medios',
                  detail:
                      'Foto, video, audio y archivos usan permisos nativos.',
                ),
                const ReadinessChip(
                  ok: true,
                  label: 'Contexto',
                  detail: 'Agenda, lugar, biometría e importaciones externas.',
                ),
                const ReadinessChip(
                  ok: true,
                  label: 'Health Connect',
                  detail:
                      'Plan de permisos Android para Samsung/Galaxy y Health Connect.',
                ),
                const ReadinessChip(
                  ok: true,
                  label: 'Seguridad',
                  detail: 'Cola local, reintento y Storage privado.',
                ),
              ],
            ),
            const SizedBox(height: 12),
            DecoratedBox(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    for (final item in checklist.items)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                          item.ok
                              ? Icons.check_circle_outline
                              : Icons.warning_amber_outlined,
                          color: item.ok
                              ? Colors.green
                              : item.critical
                                  ? Colors.red
                                  : Colors.orange,
                        ),
                        title: Text(item.title),
                        subtitle: Text(item.detail),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: checkingBackend ? null : onVerifyBackend,
                icon: checkingBackend
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.health_and_safety_outlined),
                label: Text(checkingBackend
                    ? 'Verificando Vibe...'
                    : 'Verificar backend Vibe'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class NativeCommandPreviewCard extends StatelessWidget {
  const NativeCommandPreviewCard({required this.command, super.key});

  final NativeQuickCommand command;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer.withAlpha(92),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(command.previewIcon,
                color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    command.previewTitle,
                    style: Theme.of(context)
                        .textTheme
                        .labelLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(command.previewDetail),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ReadinessChip extends StatelessWidget {
  const ReadinessChip({
    required this.ok,
    required this.label,
    required this.detail,
    super.key,
  });

  final bool ok;
  final String label;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final color = ok ? Colors.green : Colors.orange;
    return Tooltip(
      message: detail,
      child: Chip(
        avatar: Icon(
          ok ? Icons.check_circle_outline : Icons.info_outline,
          color: color,
          size: 18,
        ),
        label: Text(label),
      ),
    );
  }
}

class ExternalSessionImportCard extends StatelessWidget {
  const ExternalSessionImportCard({required this.onImport, super.key});

  final Future<void> Function() onImport;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Sesiones externas',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'Para Meta/Oakley, Oura, Apple Health, Samsung Health o carpetas del telefono: importa varios archivos, Vibeapp los agrupa en una experiencia y conserva origen, tipo, fecha y metadatos para procesarlos en Vibe.',
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onImport,
              icon: const Icon(Icons.upload_file_outlined),
              label: const Text('Importar sesion externa'),
            ),
          ],
        ),
      ),
    );
  }
}

class HealthConnectBridgeCard extends StatelessWidget {
  const HealthConnectBridgeCard({
    required this.permissionPlan,
    required this.onPreparePilotBundle,
    super.key,
  });

  final HealthConnectPermissionPlan permissionPlan;
  final Future<void> Function() onPreparePilotBundle;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Health Connect / Samsung',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'Puente Android para Galaxy Watch, Samsung Health y otros proveedores que escriben en Health Connect. La lectura real pedira permisos por dato en el telefono.',
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final recordType in permissionPlan.recordTypes)
                  Chip(
                    label: Text(recordType.label),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onPreparePilotBundle,
                icon: const Icon(Icons.monitor_heart_outlined),
                label: const Text('Preparar prueba Health Connect'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ExternalSessionSourceGuide extends StatelessWidget {
  const ExternalSessionSourceGuide({required this.source, super.key});

  final ExternalSessionSource source;

  @override
  Widget build(BuildContext context) {
    final guide = source.guide;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              guide.title,
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(guide.detail),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final item in guide.accepted)
                  Chip(
                    label: Text(item),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class ExperienceSessionCard extends StatelessWidget {
  const ExperienceSessionCard({
    required this.titleController,
    required this.session,
    required this.onStart,
    required this.onClose,
    super.key,
  });

  final TextEditingController titleController;
  final ActiveExperienceSession? session;
  final VoidCallback onStart;
  final Future<void> Function() onClose;

  @override
  Widget build(BuildContext context) {
    final active = session;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Experiencia activa',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            if (active == null) ...[
              const Text(
                'Usa este modo cuando una experiencia tenga varios momentos. Cada nota o acción queda como evento interno del mismo registro.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Título de la experiencia',
                  hintText: 'Ejemplo: Visita al museo',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: onStart,
                icon: const Icon(Icons.play_circle_outline),
                label: const Text('Iniciar experiencia'),
              ),
            ] else ...[
              Text(active.title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      )),
              const SizedBox(height: 6),
              Text(
                '${active.events.length} evento(s) · inicio ${formatClock(active.startedAt)}',
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: onClose,
                icon: const Icon(Icons.stop_circle_outlined),
                label: const Text('Cerrar experiencia'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class SyncSettingsCard extends StatelessWidget {
  const SyncSettingsCard({
    required this.apiUrlController,
    required this.emailController,
    required this.passwordController,
    required this.signedInEmail,
    required this.onSignIn,
    required this.onRetry,
    super.key,
  });

  final TextEditingController apiUrlController;
  final TextEditingController emailController;
  final TextEditingController passwordController;
  final String signedInEmail;
  final Future<void> Function() onSignIn;
  final Future<void> Function({bool showSnackBar, bool force}) onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Sincronización',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
                'Primer contrato real: entra con el mismo usuario de Vibe PWA. La cola se reintenta sola cada 30 segundos cuando hay sesión activa; el botón queda para forzar el reintento.'),
            const SizedBox(height: 12),
            TextField(
              controller: apiUrlController,
              decoration: const InputDecoration(
                labelText: 'API de Vibe',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Correo',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: passwordController,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Clave',
                helperText:
                    'Se usa contra Supabase Auth mediante la clave pública de la PWA.',
                border: OutlineInputBorder(),
              ),
            ),
            if (signedInEmail.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text('Sesión activa: $signedInEmail'),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                FilledButton.icon(
                  onPressed: onSignIn,
                  icon: const Icon(Icons.login_outlined),
                  label: const Text('Entrar'),
                ),
                OutlinedButton.icon(
                  onPressed: () => onRetry(showSnackBar: true, force: true),
                  icon: const Icon(Icons.sync_outlined),
                  label: const Text('Reintentar cola'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class CaptureActionGrid extends StatelessWidget {
  const CaptureActionGrid({
    required this.onAction,
    required this.onAudio,
    required this.onPhoto,
    required this.onVideo,
    required this.onAgenda,
    required this.onLocation,
    required this.onBiometrics,
    required this.isRecordingAudio,
    super.key,
  });

  final ValueChanged<NativeCaptureAction> onAction;
  final Future<void> Function() onAudio;
  final Future<void> Function() onPhoto;
  final Future<void> Function() onVideo;
  final Future<void> Function() onAgenda;
  final Future<void> Function() onLocation;
  final Future<void> Function() onBiometrics;
  final bool isRecordingAudio;

  @override
  Widget build(BuildContext context) {
    final actions = [
      NativeCaptureAction(
        isRecordingAudio ? Icons.stop_circle_outlined : Icons.mic_none,
        'Audio',
        isRecordingAudio
            ? 'Grabando. Pulsa para detener, subir y vincular.'
            : 'Grabar audio y vincularlo a una experiencia abierta.',
      ),
      const NativeCaptureAction(Icons.photo_camera_outlined, 'Foto',
          'Tomar foto con cámara nativa y subir a Storage privado.'),
      const NativeCaptureAction(Icons.videocam_outlined, 'Video',
          'Capturar video y registrar metadatos de fecha, lugar y usuario.'),
      const NativeCaptureAction(Icons.event_available_outlined, 'Agenda',
          'Detectar intención de calendario y crear evento confirmado.'),
      const NativeCaptureAction(Icons.favorite_border, 'Biometría',
          'Importar señales de salud autorizadas y asociarlas por fecha y hora.'),
      const NativeCaptureAction(Icons.place_outlined, 'Lugar',
          'Guardar ubicación nativa cuando el usuario otorgue permiso.'),
    ];

    return GridView.count(
      crossAxisCount: 2,
      childAspectRatio: 1.4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      children: [
        for (final action in actions)
          OutlinedButton(
            onPressed: action.label == 'Foto'
                ? onPhoto
                : action.label == 'Video'
                    ? onVideo
                    : action.label == 'Audio'
                        ? onAudio
                        : action.label == 'Agenda'
                            ? onAgenda
                            : action.label == 'Lugar'
                                ? onLocation
                                : action.label == 'Biometría'
                                    ? onBiometrics
                                    : () => onAction(action),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(action.icon),
                const SizedBox(height: 8),
                Text(action.label,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  action.detail,
                  textAlign: TextAlign.center,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class CaptureQueuePanel extends StatelessWidget {
  const CaptureQueuePanel({
    required this.queue,
    required this.onClearSynced,
    super.key,
  });

  final List<CaptureQueueItem> queue;
  final Future<void> Function() onClearSynced;

  @override
  Widget build(BuildContext context) {
    final summary = CaptureQueueSummary.fromItems(queue);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Cola local',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                if (summary.synced > 0)
                  TextButton.icon(
                    onPressed: onClearSynced,
                    icon: const Icon(Icons.cleaning_services_outlined),
                    label: const Text('Limpiar listos'),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            if (queue.isEmpty)
              const Text(
                  'Sin capturas pendientes. Cuando guardes una nota o acciones un medio, aparecerá aquí antes de sincronizar.')
            else ...[
              Text(summary.operatorMessage),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(label: Text('${summary.total} total')),
                  Chip(label: Text('${summary.synced} listas')),
                  if (summary.readyToSync > 0)
                    Chip(label: Text('${summary.readyToSync} por enviar')),
                  if (summary.uploading > 0)
                    Chip(label: Text('${summary.uploading} subiendo')),
                  if (summary.waitingRetry > 0)
                    Chip(label: Text('${summary.waitingRetry} en reintento')),
                  if (summary.needsUserAction > 0)
                    Chip(label: Text('${summary.needsUserAction} por revisar')),
                  if (summary.attachmentsPending > 0)
                    Chip(
                        label: Text(
                            '${summary.attachmentsPending} archivo(s) pendientes')),
                  if (summary.eventsPending > 0)
                    Chip(
                        label: Text(
                            '${summary.eventsPending} evento(s) pendientes')),
                ],
              ),
              const SizedBox(height: 8),
              for (final item in queue.take(8)) QueueItemTile(item: item),
            ],
          ],
        ),
      ),
    );
  }
}

class QueueItemTile extends StatelessWidget {
  const QueueItemTile({required this.item, super.key});

  final CaptureQueueItem item;

  @override
  Widget build(BuildContext context) {
    final validation = item.validateForSync();
    final color = validation.canSync
        ? validation.hasWarnings
            ? Colors.orange
            : Colors.green
        : Colors.red;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(item.status.icon),
      title: Text(item.title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.subtitle),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              Chip(
                visualDensity: VisualDensity.compact,
                avatar: Icon(
                  validation.canSync
                      ? validation.hasWarnings
                          ? Icons.warning_amber_outlined
                          : Icons.verified_outlined
                      : Icons.error_outline,
                  size: 16,
                  color: color,
                ),
                label: Text(validation.label),
              ),
              if (item.attachments.isNotEmpty)
                Chip(
                  visualDensity: VisualDensity.compact,
                  label: Text('${item.attachments.length} archivo(s)'),
                ),
              if (item.events.isNotEmpty)
                Chip(
                  visualDensity: VisualDensity.compact,
                  label: Text('${item.events.length} evento(s)'),
                ),
            ],
          ),
          if (validation.messages.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              validation.messages.take(2).join(' '),
              style:
                  Theme.of(context).textTheme.bodySmall?.copyWith(color: color),
            ),
          ],
          if (item.retryDescription.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              item.retryDescription,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.blueGrey),
            ),
          ],
        ],
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(item.status.label),
          if (item.attemptCount > 0)
            Text(
              '${item.attemptCount} intento(s)',
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
    );
  }
}

class ExperienceSyncClient {
  ExperienceSyncClient(this.settings, {this.transport});

  final SyncSettings settings;
  final NativeSyncTransport? transport;

  Future<SyncResult> syncItem(CaptureQueueItem item) {
    final agendaEvent = item.agendaEvent;
    if (agendaEvent != null) {
      return ingestAgendaEvent(agendaEvent);
    }
    if (item.shouldUseIntegrationIngest) {
      return ingestCaptureSignal(item);
    }
    return upsertExperience(item);
  }

  Future<SyncResult> ingestCaptureSignal(CaptureQueueItem item) async {
    try {
      final uri =
          Uri.parse(settings.apiBaseUrl).resolve('/api/integration/ingest');
      final payload = item.toIntegrationSignal();
      final customTransport = transport;
      final response = customTransport == null
          ? await NativeHttpTransport().postJson(
              uri,
              accessToken: settings.accessToken,
              idempotencyKey: item.idempotencyKey,
              payload: payload,
            )
          : await customTransport.postJson(
              uri,
              accessToken: settings.accessToken,
              idempotencyKey: item.idempotencyKey,
              payload: payload,
            );
      return parseIntegrationIngestResponse(response, item.id);
    } on TimeoutException {
      return SyncResult.failure('Tiempo de espera agotado en la ingesta.');
    } on SocketException {
      return SyncResult.failure('Sin conexion para ingesta validada.');
    } on FormatException {
      return SyncResult.failure('Respuesta invalida de ingesta.');
    } catch (error) {
      return SyncResult.failure(shorten(error.toString()));
    }
  }

  Future<SyncResult> ingestAgendaEvent(AgendaEventDraft event) async {
    try {
      final uri =
          Uri.parse(settings.apiBaseUrl).resolve('/api/integration/ingest');
      final customTransport = transport;
      final response = customTransport == null
          ? await NativeHttpTransport().postJson(
              uri,
              accessToken: settings.accessToken,
              idempotencyKey: event.idempotencyKey,
              payload: event.toIntegrationSignal(),
            )
          : await customTransport.postJson(
              uri,
              accessToken: settings.accessToken,
              idempotencyKey: event.idempotencyKey,
              payload: event.toIntegrationSignal(),
            );
      return parseIntegrationIngestResponse(response, event.id);
    } on TimeoutException {
      return SyncResult.failure(
          'Tiempo de espera agotado al guardar el evento.');
    } on SocketException {
      return SyncResult.failure('Sin conexion para guardar el evento.');
    } on FormatException {
      return SyncResult.failure('Respuesta invalida al guardar el evento.');
    } catch (error) {
      return SyncResult.failure(shorten(error.toString()));
    }
  }

  SyncResult parseIntegrationIngestResponse(
    NativeSyncResponse response,
    String fallbackId,
  ) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return SyncResult.failure(
          'Ingesta HTTP ${response.statusCode}: ${shorten(response.body)}');
    }
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    if (decoded['ok'] == false) {
      return SyncResult.failure('Ingesta rechazada: ${shorten(response.body)}');
    }
    final results = decoded['results'];
    if (results is List && results.isNotEmpty && results.first is Map) {
      final first = Map<String, dynamic>.from(results.first as Map);
      return SyncResult.success((first['id'] ?? fallbackId).toString());
    }
    return SyncResult.success((decoded['id'] ?? fallbackId).toString());
  }

  Future<SyncResult> upsertExperience(CaptureQueueItem item) async {
    try {
      final attachments = <Map<String, dynamic>>[];
      for (final attachment in item.attachments) {
        final uploaded = await uploadMediaAttachment(attachment);
        if (!uploaded.ok) return uploaded;
        attachments
            .add(uploaded.payload ?? attachment.toExperienceAttachment());
      }
      final uri = Uri.parse(settings.apiBaseUrl).resolve('/api/experiences');
      final payload = item.toExperiencePayload(attachments);
      final customTransport = transport;
      final response = customTransport == null
          ? await NativeHttpTransport().postJson(
              uri,
              accessToken: settings.accessToken,
              idempotencyKey: item.idempotencyKey,
              payload: payload,
            )
          : await customTransport.postJson(
              uri,
              accessToken: settings.accessToken,
              idempotencyKey: item.idempotencyKey,
              payload: payload,
            );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return SyncResult.failure(
            'HTTP ${response.statusCode}: ${shorten(response.body)}');
      }
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      return SyncResult.success((decoded['id'] ?? item.id).toString());
    } on TimeoutException {
      return SyncResult.failure('Tiempo de espera agotado.');
    } on SocketException {
      return SyncResult.failure('Sin conexión con la API.');
    } on FormatException {
      return SyncResult.failure('Respuesta inválida del servidor.');
    } catch (error) {
      return SyncResult.failure(shorten(error.toString()));
    }
  }

  Future<SyncResult> uploadMediaAttachment(
      NativeAttachmentDraft attachment) async {
    try {
      final file = File(attachment.filePath);
      final bytes = await file.readAsBytes();
      final boundary = '----vibeapp-${DateTime.now().microsecondsSinceEpoch}';
      final uri = Uri.parse(settings.apiBaseUrl).resolve('/api/media');
      final metadata = jsonEncode(attachment.toMediaMetadata(bytes.length));
      final customTransport = transport;
      final response = customTransport == null
          ? await NativeHttpTransport().postMultipart(
              uri,
              accessToken: settings.accessToken,
              idempotencyKey: attachment.idempotencyKey,
              attachment: attachment,
              bytes: bytes,
              boundary: boundary,
              metadata: metadata,
            )
          : await customTransport.postMultipart(
              uri,
              accessToken: settings.accessToken,
              idempotencyKey: attachment.idempotencyKey,
              attachment: attachment,
              bytes: bytes,
              boundary: boundary,
              metadata: metadata,
            );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return SyncResult.failure(
            'Media HTTP ${response.statusCode}: ${shorten(response.body)}');
      }
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      return SyncResult.mediaSuccess(
          attachment.toExperienceAttachment(decoded));
    } on TimeoutException {
      return SyncResult.failure(
          'Tiempo de espera agotado al subir el archivo.');
    } on SocketException {
      return SyncResult.failure('Sin conexion para subir el archivo.');
    } catch (error) {
      return SyncResult.failure(shorten(error.toString()));
    }
  }
}

abstract class NativeSyncTransport {
  Future<NativeSyncResponse> postJson(
    Uri uri, {
    required String accessToken,
    required String idempotencyKey,
    required Object payload,
  });

  Future<NativeSyncResponse> postMultipart(
    Uri uri, {
    required String accessToken,
    required String idempotencyKey,
    required NativeAttachmentDraft attachment,
    required List<int> bytes,
    required String boundary,
    required String metadata,
  });
}

class NativeSyncResponse {
  const NativeSyncResponse({required this.statusCode, required this.body});

  final int statusCode;
  final String body;
}

class NativeHttpTransport implements NativeSyncTransport {
  @override
  Future<NativeSyncResponse> postJson(
    Uri uri, {
    required String accessToken,
    required String idempotencyKey,
    required Object payload,
  }) async {
    final request =
        await HttpClient().postUrl(uri).timeout(const Duration(seconds: 10));
    request.headers.contentType = ContentType.json;
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
    request.headers.set('Idempotency-Key', idempotencyKey);
    request.headers.set('X-Vibe-Source-Id', idempotencyKey);
    request.write(jsonEncode(payload));
    final response = await request.close().timeout(const Duration(seconds: 20));
    final responseText = await response.transform(utf8.decoder).join();
    return NativeSyncResponse(
      statusCode: response.statusCode,
      body: responseText,
    );
  }

  @override
  Future<NativeSyncResponse> postMultipart(
    Uri uri, {
    required String accessToken,
    required String idempotencyKey,
    required NativeAttachmentDraft attachment,
    required List<int> bytes,
    required String boundary,
    required String metadata,
  }) async {
    final request =
        await HttpClient().postUrl(uri).timeout(const Duration(seconds: 10));
    request.headers.contentType = ContentType(
      'multipart',
      'form-data',
      parameters: {'boundary': boundary},
    );
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
    request.headers.set('Idempotency-Key', idempotencyKey);
    request.headers.set('X-Vibe-Source-Id', idempotencyKey);
    request.add(utf8.encode('--$boundary\r\n'));
    request.add(
        utf8.encode('Content-Disposition: form-data; name="metadata"\r\n'));
    request.add(utf8.encode('Content-Type: application/json\r\n\r\n'));
    request.add(utf8.encode(metadata));
    request.add(utf8.encode('\r\n--$boundary\r\n'));
    request.add(utf8.encode(
        'Content-Disposition: form-data; name="file"; filename="${attachment.name}"\r\n'));
    request.add(utf8.encode('Content-Type: ${attachment.mimeType}\r\n\r\n'));
    request.add(bytes);
    request.add(utf8.encode('\r\n--$boundary--\r\n'));
    final response = await request.close().timeout(const Duration(seconds: 45));
    final responseText = await response.transform(utf8.decoder).join();
    return NativeSyncResponse(
      statusCode: response.statusCode,
      body: responseText,
    );
  }
}

class VibeAuthClient {
  VibeAuthClient(this.settings);

  final SyncSettings settings;

  Future<AuthResult> signIn(String email, String password) async {
    try {
      final config = await _loadConfig();
      final supabaseUrl = (config['supabaseUrl'] ?? '').toString();
      final publishableKey =
          (config['supabasePublishableKey'] ?? '').toString();
      if (supabaseUrl.isEmpty || publishableKey.isEmpty) {
        return AuthResult.failure(
            'La API de Vibe no expone configuración Supabase.');
      }
      final uri =
          Uri.parse(supabaseUrl).resolve('/auth/v1/token?grant_type=password');
      final request =
          await HttpClient().postUrl(uri).timeout(const Duration(seconds: 10));
      request.headers.contentType = ContentType.json;
      request.headers.set('apikey', publishableKey);
      request.write(jsonEncode({'email': email, 'password': password}));
      final response =
          await request.close().timeout(const Duration(seconds: 20));
      final responseText = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return AuthResult.failure('Acceso rechazado: ${shorten(responseText)}');
      }
      final decoded = jsonDecode(responseText) as Map<String, dynamic>;
      return AuthResult.success((decoded['access_token'] ?? '').toString());
    } on TimeoutException {
      return AuthResult.failure('Tiempo de espera agotado al entrar.');
    } on SocketException {
      return AuthResult.failure('Sin conexión con Vibe o Supabase.');
    } on FormatException {
      return AuthResult.failure('Respuesta de acceso inválida.');
    } catch (error) {
      return AuthResult.failure(shorten(error.toString()));
    }
  }

  Future<Map<String, dynamic>> _loadConfig() async {
    final uri = Uri.parse(settings.apiBaseUrl).resolve('/api/config');
    final request =
        await HttpClient().getUrl(uri).timeout(const Duration(seconds: 10));
    final response = await request.close().timeout(const Duration(seconds: 15));
    final responseText = await response.transform(utf8.decoder).join();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
          'config_http_${response.statusCode}: ${shorten(responseText)}');
    }
    return jsonDecode(responseText) as Map<String, dynamic>;
  }
}

class SyncSettings {
  const SyncSettings({required this.apiBaseUrl, required this.accessToken});

  final String apiBaseUrl;
  final String accessToken;

  bool get hasSession => apiBaseUrl.isNotEmpty && accessToken.isNotEmpty;
}

class AuthResult {
  const AuthResult._({
    required this.ok,
    required this.message,
    this.accessToken = '',
  });

  factory AuthResult.success(String accessToken) => AuthResult._(
        ok: accessToken.isNotEmpty,
        message: accessToken.isNotEmpty
            ? 'Sesión iniciada'
            : 'Supabase no devolvió token.',
        accessToken: accessToken,
      );
  factory AuthResult.failure(String message) =>
      AuthResult._(ok: false, message: message);

  final bool ok;
  final String message;
  final String accessToken;
}

class SyncResult {
  const SyncResult._({
    required this.ok,
    required this.message,
    this.remoteId,
    this.payload,
  });

  factory SyncResult.success(String remoteId) =>
      SyncResult._(ok: true, message: 'Sincronizado', remoteId: remoteId);
  factory SyncResult.mediaSuccess(Map<String, dynamic> payload) =>
      SyncResult._(ok: true, message: 'Media sincronizada', payload: payload);
  factory SyncResult.failure(String message) =>
      SyncResult._(ok: false, message: message);

  final bool ok;
  final String message;
  final String? remoteId;
  final Map<String, dynamic>? payload;
}

enum ExternalSessionSource {
  metaGlasses(
    'Meta / Oakley / Ray-Ban',
    'Sesion Meta importada',
    'meta_glasses_import',
  ),
  oura(
    'Oura Ring',
    'Contexto biometrico Oura',
    'oura_import',
  ),
  appleHealth(
    'Apple Health',
    'Contexto Apple Health',
    'apple_health_import',
  ),
  samsungHealth(
    'Samsung Health / Galaxy Watch',
    'Contexto Samsung Health',
    'samsung_health_import',
  ),
  healthConnect(
    'Health Connect',
    'Contexto Health Connect',
    'health_connect_import',
  ),
  phoneGallery(
    'Galeria del telefono',
    'Sesion desde galeria',
    'phone_gallery_import',
  ),
  other(
    'Otro origen',
    'Sesion externa',
    'external_import',
  );

  const ExternalSessionSource(this.label, this.defaultTitle, this.contract);

  final String label;
  final String defaultTitle;
  final String contract;

  ExternalSessionSourceGuideData get guide {
    switch (this) {
      case ExternalSessionSource.metaGlasses:
        return const ExternalSessionSourceGuideData(
          title: 'Flujo recomendado Meta/Oakley',
          detail:
              'Importa primero desde Meta AI a Fotos/Galeria. Luego trae JPG/HEIC, MP4/HEVC o el JSON/HTML de datos como una sola experiencia.',
          accepted: ['JPG/HEIC', 'MP4/HEVC', 'JSON/HTML', 'ZIP transporte'],
        );
      case ExternalSessionSource.oura:
        return const ExternalSessionSourceGuideData(
          title: 'Flujo recomendado Oura',
          detail:
              'Usa CSV o JSON de Oura/Oura Teams. Vibeapp lo guarda como contexto biometrico transversal, no como foto o audio.',
          accepted: ['CSV', 'JSON', 'PDF referencia'],
        );
      case ExternalSessionSource.appleHealth:
        return const ExternalSessionSourceGuideData(
          title: 'Flujo recomendado Apple Health',
          detail:
              'Usa CSV o JSON exportado. La PWA cruza fecha/hora con experiencias para energia, sueno, actividad y recuperacion.',
          accepted: ['CSV', 'JSON', 'ZIP transporte'],
        );
      case ExternalSessionSource.samsungHealth:
        return const ExternalSessionSourceGuideData(
          title: 'Flujo recomendado Samsung Health',
          detail:
              'Usa exportaciones CSV/JSON de Samsung Health o Galaxy Watch. Si viene como ZIP, se transporta y se procesa despues.',
          accepted: ['CSV', 'JSON', 'ZIP transporte'],
        );
      case ExternalSessionSource.healthConnect:
        return const ExternalSessionSourceGuideData(
          title: 'Flujo recomendado Health Connect',
          detail:
              'Usa exportaciones estructuradas del telefono Android. Se priorizan fechas, pasos, frecuencia cardiaca, sueno y actividad.',
          accepted: ['CSV', 'JSON'],
        );
      case ExternalSessionSource.phoneGallery:
        return const ExternalSessionSourceGuideData(
          title: 'Flujo recomendado Galeria',
          detail:
              'Selecciona fotos, videos y audios de una misma salida o momento. Vibeapp los agrupa como eventos internos.',
          accepted: ['Imagenes', 'Videos', 'Audio', 'Documentos'],
        );
      case ExternalSessionSource.other:
        return const ExternalSessionSourceGuideData(
          title: 'Otro origen',
          detail:
              'Importa archivos normales y agrega contexto humano. Vibeapp conserva metadatos para que la PWA los revise.',
          accepted: ['Imagen', 'Video', 'Audio', 'Documento', 'ZIP'],
        );
    }
  }
}

class ExternalFileImportProfile {
  const ExternalFileImportProfile({
    required this.sourceType,
    required this.payloadType,
    required this.processingIntent,
    required this.captureOrigin,
    required this.treatment,
    required this.privacyHint,
    required this.expectedConsumer,
    this.transportOnly = false,
    this.autoInterpret = true,
  });

  final String sourceType;
  final String payloadType;
  final String processingIntent;
  final String captureOrigin;
  final String treatment;
  final String privacyHint;
  final String expectedConsumer;
  final bool transportOnly;
  final bool autoInterpret;

  String eventTitle(int order) => externalFileEventTitle(sourceType, order);

  String previewText(ExternalSessionSource source, String fileName) {
    return 'Archivo importado desde ${source.label}: $fileName. $treatment';
  }

  String analysisText(ExternalSessionSource source, String fileName) {
    if (transportOnly) {
      return 'Paquete de transporte de ${source.label}: $fileName. Se conserva y descarga, pero no se interpreta automaticamente.';
    }
    return 'Activo de ${source.label}: $fileName. Uso esperado: $expectedConsumer. Procesamiento: $processingIntent.';
  }

  Map<String, dynamic> toMetadata(
    ExternalSessionSource source,
    String originalFileName,
  ) {
    return {
      'payloadType': payloadType,
      'externalPayloadType': payloadType,
      'externalSource': source.label,
      'externalSourceKey': source.name,
      'externalSourceContract': source.contract,
      'externalProcessingIntent': processingIntent,
      'externalCaptureOrigin': captureOrigin,
      'externalTreatment': treatment,
      'externalPrivacyHint': privacyHint,
      'externalExpectedConsumer': expectedConsumer,
      'externalTransportOnly': transportOnly,
      'externalAutoInterpret': autoInterpret,
      'importedAsSession': true,
      'originalFileName': originalFileName,
    };
  }
}

ExternalFileImportProfile buildExternalFileImportProfile(
  ExternalSessionSource source,
  String fileName,
) {
  final genericType = classifyExternalFileSource(fileName);
  final lower = fileName.toLowerCase();
  final isStructured = RegExp(r'\.(csv|json)$').hasMatch(lower);
  final isHtml = RegExp(r'\.(html|htm)$').hasMatch(lower);
  final isZip = lower.endsWith('.zip');

  if (isZip) {
    return ExternalFileImportProfile(
      sourceType: 'zip',
      payloadType: 'transport_bundle',
      processingIntent: 'transport_only',
      captureOrigin: '${source.name}_export',
      treatment: 'Se guarda para descarga o revision posterior.',
      privacyHint: 'Puede contener datos sensibles; mantener Storage privado.',
      expectedConsumer: 'respaldo y auditoria',
      transportOnly: true,
      autoInterpret: false,
    );
  }

  switch (source) {
    case ExternalSessionSource.metaGlasses:
      if (genericType == 'image' || genericType == 'video') {
        return ExternalFileImportProfile(
          sourceType: genericType,
          payloadType: 'social_memory_media',
          processingIntent: genericType == 'image'
              ? 'visual_memory_ocr_and_caption'
              : 'video_key_moments_and_transcription',
          captureOrigin: 'meta_ai_phone_import',
          treatment:
              'Medio capturado con lentes e importado al telefono antes de Vibeapp.',
          privacyHint: 'Revisar personas visibles antes de publicar.',
          expectedConsumer: 'memoria, reportes y publicaciones vividas',
        );
      }
      if (genericType == 'audio') {
        return const ExternalFileImportProfile(
          sourceType: 'audio',
          payloadType: 'voice_activity_log',
          processingIntent: 'voice_log_transcription',
          captureOrigin: 'meta_ai_download_your_information',
          treatment:
              'Audio o registro de voz asociado a Meta AI; requiere revision humana.',
          privacyHint: 'Puede contener conversaciones o terceros.',
          expectedConsumer: 'contexto narrativo y evidencia de voz',
        );
      }
      if (isStructured || isHtml) {
        return const ExternalFileImportProfile(
          sourceType: 'document',
          payloadType: 'account_export',
          processingIntent: 'account_export_reference',
          captureOrigin: 'meta_ai_download_your_information',
          treatment:
              'Exportacion de datos de cuenta; sirve como referencia, no como biometria.',
          privacyHint: 'Puede incluir actividad de cuenta y datos personales.',
          expectedConsumer: 'auditoria, trazabilidad y contexto',
          autoInterpret: false,
        );
      }
      break;
    case ExternalSessionSource.oura:
    case ExternalSessionSource.appleHealth:
    case ExternalSessionSource.samsungHealth:
    case ExternalSessionSource.healthConnect:
      if (isStructured) {
        return ExternalFileImportProfile(
          sourceType: 'biometric',
          payloadType: 'biometric_context',
          processingIntent: 'biometric_time_context',
          captureOrigin: '${source.name}_structured_export',
          treatment:
              'Se cruza por fecha y hora con experiencias; no pertenece a una sola captura.',
          privacyHint:
              'Dato de salud sensible; usar solo con permiso del usuario.',
          expectedConsumer:
              'energia, recuperacion, sueno, actividad y reportes',
        );
      }
      if (genericType == 'document') {
        return ExternalFileImportProfile(
          sourceType: 'document',
          payloadType: 'biometric_report_document',
          processingIntent: 'health_report_summary',
          captureOrigin: '${source.name}_report_export',
          treatment:
              'Reporte de referencia; se resume en lenguaje claro cuando el backend lo procese.',
          privacyHint: 'Dato de salud sensible; evitar publicacion abierta.',
          expectedConsumer: 'hallazgos personales y conversaciones medicas',
        );
      }
      break;
    case ExternalSessionSource.phoneGallery:
      if (genericType == 'image' ||
          genericType == 'video' ||
          genericType == 'audio') {
        return ExternalFileImportProfile(
          sourceType: genericType,
          payloadType: 'phone_gallery_memory',
          processingIntent: '${genericType}_memory_enrichment',
          captureOrigin: 'phone_gallery',
          treatment:
              'Medio seleccionado desde galeria y agrupado como recuerdo de una experiencia.',
          privacyHint: 'Revisar contenido privado antes de compartir.',
          expectedConsumer: 'memoria, reportes y publicaciones',
        );
      }
      break;
    case ExternalSessionSource.other:
      break;
  }

  return ExternalFileImportProfile(
    sourceType: genericType,
    payloadType: genericType == 'biometric' ? 'structured_data' : genericType,
    processingIntent: genericType == 'document'
        ? 'document_text_extraction'
        : '${genericType}_asset_processing',
    captureOrigin: '${source.name}_manual_import',
    treatment: 'Activo normalizado para procesamiento posterior en Vibe.',
    privacyHint: 'Mantener privado hasta que el usuario revise el contenido.',
    expectedConsumer: 'biblioteca, activos, reportes y publicaciones',
  );
}

class ExternalSessionSourceGuideData {
  const ExternalSessionSourceGuideData({
    required this.title,
    required this.detail,
    required this.accepted,
  });

  final String title;
  final String detail;
  final List<String> accepted;
}

enum NativeQuickCommandType {
  note,
  agenda,
  startExperience,
  closeExperience,
}

class NativeQuickCommand {
  const NativeQuickCommand({
    required this.type,
    required this.cleanedText,
    this.agenda,
  });

  factory NativeQuickCommand.parse(String rawText) {
    final command = stripNativeWakePhrase(rawText);
    final lower = command.toLowerCase();

    if (RegExp(
      r'\b(cierra|cerrar|termina|terminar|finaliza|finalizar|stop|close|end)\b.*\b(experiencia|experience)\b',
    ).hasMatch(lower)) {
      return const NativeQuickCommand(
        type: NativeQuickCommandType.closeExperience,
        cleanedText: '',
      );
    }

    if (RegExp(
      r'\b(empieza|inicia|iniciar|abre|nueva|graba|start|begin|new|create)\b.*\b(experiencia|experience)\b',
    ).hasMatch(lower)) {
      return NativeQuickCommand(
        type: NativeQuickCommandType.startExperience,
        cleanedText: cleanNativeExperienceTitle(command),
      );
    }

    if (RegExp(
      r'\b(agenda|calendario|recordarme|recuérdame|recuerdame|schedule|calendar|remind)\b',
    ).hasMatch(lower)) {
      return NativeQuickCommand(
        type: NativeQuickCommandType.agenda,
        cleanedText: command,
        agenda: buildNativeAgendaFromCommand(command),
      );
    }

    return NativeQuickCommand(
      type: NativeQuickCommandType.note,
      cleanedText: cleanNativeNoteText(command),
    );
  }

  final NativeQuickCommandType type;
  final String cleanedText;
  final AgendaEventDraft? agenda;

  String get primaryActionLabel {
    return switch (type) {
      NativeQuickCommandType.agenda => 'Crear agenda',
      NativeQuickCommandType.startExperience => 'Iniciar experiencia',
      NativeQuickCommandType.closeExperience => 'Cerrar experiencia',
      NativeQuickCommandType.note => 'Guardar nota',
    };
  }

  IconData get previewIcon {
    return switch (type) {
      NativeQuickCommandType.agenda => Icons.event_available_outlined,
      NativeQuickCommandType.startExperience => Icons.play_circle_outline,
      NativeQuickCommandType.closeExperience => Icons.stop_circle_outlined,
      NativeQuickCommandType.note => Icons.sticky_note_2_outlined,
    };
  }

  String get previewTitle {
    return switch (type) {
      NativeQuickCommandType.agenda => 'Vibe entendió: crear agenda',
      NativeQuickCommandType.startExperience =>
        'Vibe entendió: iniciar experiencia',
      NativeQuickCommandType.closeExperience =>
        'Vibe entendió: cerrar experiencia',
      NativeQuickCommandType.note => 'Vibe entendió: guardar nota',
    };
  }

  String get previewDetail {
    if (type == NativeQuickCommandType.agenda && agenda != null) {
      final localStart = agenda!.startAt.toLocal();
      final time =
          '${localStart.hour.toString().padLeft(2, '0')}:${localStart.minute.toString().padLeft(2, '0')}';
      final place =
          agenda!.location.isEmpty ? 'sin lugar definido' : agenda!.location;
      return '${agenda!.title} · ${formatDateLabel(localStart)} $time · $place.';
    }
    if (type == NativeQuickCommandType.startExperience) {
      return cleanedText.isEmpty
          ? 'Se abrirá una experiencia activa.'
          : 'Se abrirá una experiencia activa: $cleanedText.';
    }
    if (type == NativeQuickCommandType.closeExperience) {
      return 'Se cerrará la experiencia activa y se intentará sincronizar.';
    }
    return cleanedText.isEmpty
        ? 'Se guardará como nota rápida.'
        : 'Se guardará como nota: $cleanedText.';
  }
}

class ExternalSessionImportDraft {
  const ExternalSessionImportDraft({
    required this.source,
    required this.title,
    required this.notes,
  });

  final ExternalSessionSource source;
  final String title;
  final String notes;
}

enum HealthConnectRecordType {
  steps(
    'Pasos',
    'steps',
    'count',
    'android.permission.health.READ_STEPS',
  ),
  activeCalories(
    'Calorias activas',
    'activeCaloriesBurned',
    'kcal',
    'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  ),
  distance(
    'Distancia',
    'distance',
    'meters',
    'android.permission.health.READ_DISTANCE',
  ),
  heartRate(
    'Frecuencia cardiaca',
    'heartRate',
    'bpm',
    'android.permission.health.READ_HEART_RATE',
  ),
  restingHeartRate(
    'Pulso en reposo',
    'restingHeartRate',
    'bpm',
    'android.permission.health.READ_RESTING_HEART_RATE',
  ),
  heartRateVariability(
    'HRV',
    'heartRateVariability',
    'ms',
    'android.permission.health.READ_HEART_RATE_VARIABILITY',
  ),
  oxygenSaturation(
    'Oxigeno',
    'oxygenSaturation',
    'percent',
    'android.permission.health.READ_OXYGEN_SATURATION',
  ),
  respiratoryRate(
    'Respiracion',
    'respiratoryRate',
    'breathsPerMinute',
    'android.permission.health.READ_RESPIRATORY_RATE',
  ),
  bodyTemperature(
    'Temperatura',
    'bodyTemperature',
    'celsius',
    'android.permission.health.READ_BODY_TEMPERATURE',
  ),
  sleepSession(
    'Sueno',
    'sleep',
    'minutes',
    'android.permission.health.READ_SLEEP',
  ),
  exerciseSession(
    'Ejercicio',
    'exercise',
    'minutes',
    'android.permission.health.READ_EXERCISE',
  );

  const HealthConnectRecordType(
    this.label,
    this.payloadKey,
    this.unit,
    this.androidReadPermission,
  );

  final String label;
  final String payloadKey;
  final String unit;
  final String androidReadPermission;
}

class HealthConnectPermissionPlan {
  const HealthConnectPermissionPlan({required this.recordTypes});

  factory HealthConnectPermissionPlan.pilot() {
    return const HealthConnectPermissionPlan(recordTypes: [
      HealthConnectRecordType.steps,
      HealthConnectRecordType.activeCalories,
      HealthConnectRecordType.distance,
      HealthConnectRecordType.heartRate,
      HealthConnectRecordType.restingHeartRate,
      HealthConnectRecordType.heartRateVariability,
      HealthConnectRecordType.oxygenSaturation,
      HealthConnectRecordType.respiratoryRate,
      HealthConnectRecordType.bodyTemperature,
      HealthConnectRecordType.sleepSession,
      HealthConnectRecordType.exerciseSession,
    ]);
  }

  final List<HealthConnectRecordType> recordTypes;

  List<String> get androidReadPermissions =>
      recordTypes.map((item) => item.androidReadPermission).toList();

  bool covers(HealthConnectRecordType type) => recordTypes.contains(type);

  Map<String, dynamic> toJson() {
    return {
      'connector': 'android-health-connect',
      'package': 'com.google.android.apps.healthdata',
      'recordTypes': recordTypes.map((item) => item.payloadKey).toList(),
      'androidReadPermissions': androidReadPermissions,
      'runtimePermissionRequired': true,
      'recommendedProviders': [
        'Samsung Health',
        'Galaxy Watch',
        'Oura',
        'Fitbit'
      ],
    };
  }
}

class HealthConnectRecordDraft {
  HealthConnectRecordDraft({
    required this.type,
    required this.value,
    required this.startAt,
    required this.endAt,
    this.sourceDevice = 'Android Health Connect',
    String? id,
  }) : id = id ??
            'health-connect-${type.payloadKey}-${startAt.microsecondsSinceEpoch}';

  final String id;
  final HealthConnectRecordType type;
  final num value;
  final DateTime startAt;
  final DateTime endAt;
  final String sourceDevice;

  Map<String, dynamic> toNormalizedSignal() {
    return {
      'source': 'Android Health Connect',
      'connector': 'android-health-connect',
      'sourceId': id,
      'capturedAt': endAt.toUtc().toIso8601String(),
      'participantId': 'miguel',
      'payloadType': 'biometric',
      'privacyLevel': 'sensitive',
      'payload': {
        'dataType': type.payloadKey,
        'value': value,
        'unit': type.unit,
        'startTime': startAt.toUtc().toIso8601String(),
        'endTime': endAt.toUtc().toIso8601String(),
      },
      'deviceMetadata': {
        'platform': 'android',
        'sourceDevice': sourceDevice,
        'permission': type.androidReadPermission,
        'nativeBridge': 'Vibeapp',
      },
      'idempotencyKey': 'android-health-connect:${type.payloadKey}:$id',
    };
  }
}

class HealthConnectPreviewBundle {
  const HealthConnectPreviewBundle({
    required this.records,
    required this.permissionPlan,
  });

  factory HealthConnectPreviewBundle.pilot() {
    final now = DateTime.now().toUtc();
    final start = now.subtract(const Duration(hours: 2));
    return HealthConnectPreviewBundle(
      permissionPlan: HealthConnectPermissionPlan.pilot(),
      records: [
        HealthConnectRecordDraft(
          type: HealthConnectRecordType.steps,
          value: 4200,
          startAt: start,
          endAt: now,
          sourceDevice: 'Galaxy Watch / Health Connect',
        ),
        HealthConnectRecordDraft(
          type: HealthConnectRecordType.heartRate,
          value: 74,
          startAt: start,
          endAt: now,
          sourceDevice: 'Galaxy Watch / Health Connect',
        ),
        HealthConnectRecordDraft(
          type: HealthConnectRecordType.sleepSession,
          value: 420,
          startAt: now.subtract(const Duration(hours: 10)),
          endAt: now.subtract(const Duration(hours: 3)),
          sourceDevice: 'Samsung Health / Health Connect',
        ),
      ],
    );
  }

  final List<HealthConnectRecordDraft> records;
  final HealthConnectPermissionPlan permissionPlan;

  String get summaryText {
    final labels = records.map((item) => item.type.label).join(', ');
    return 'Health Connect preparado con ${records.length} registros: $labels.';
  }

  Map<String, dynamic> toJson() {
    return {
      'connector': 'android-health-connect',
      'summary': summaryText,
      'permissionPlan': permissionPlan.toJson(),
      'signals': records.map((item) => item.toNormalizedSignal()).toList(),
    };
  }
}

class NativeCaptureAction {
  const NativeCaptureAction(this.icon, this.label, this.detail);

  final IconData icon;
  final String label;
  final String detail;
}

class AgendaEventDraft {
  AgendaEventDraft({
    required this.title,
    required this.startAt,
    required this.endAt,
    this.description = '',
    this.location = '',
    String? id,
    DateTime? createdAt,
  })  : id = id ?? 'native-agenda-${DateTime.now().microsecondsSinceEpoch}',
        createdAt = createdAt ?? DateTime.now().toUtc();

  factory AgendaEventDraft.fromJson(Map<String, dynamic> json) {
    final startAt = parseNativeDate(json['startAt']) ?? DateTime.now().toUtc();
    return AgendaEventDraft(
      id: stringFromJson(json['id']),
      title: stringFromJson(json['title']).isEmpty
          ? 'Evento'
          : stringFromJson(json['title']),
      description: stringFromJson(json['description']),
      location: stringFromJson(json['location']),
      startAt: startAt,
      endAt: parseNativeDate(json['endAt']) ??
          startAt.add(const Duration(hours: 1)),
      createdAt: parseNativeDate(json['createdAt']),
    );
  }

  final String id;
  final String title;
  final String description;
  final String location;
  final DateTime startAt;
  final DateTime endAt;
  final DateTime createdAt;

  String get idempotencyKey => 'vibeapp-agenda:$id';

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'type': 'Personal',
      'description': description,
      'startAt': startAt.toIso8601String(),
      'endAt': endAt.toIso8601String(),
      'location': location.isEmpty ? 'Sin ubicación' : location,
      'participants': 'Usuario',
      'priority': 'normal',
      'status': 'Planificado',
      'sourceType': 'vibeapp-native-agenda',
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
      'metadata': {
        'source': 'vibeapp-native',
        'sourceDevice': Platform.operatingSystem,
        'idempotencyKey': idempotencyKey,
        'payloadType': 'calendar',
      },
    };
  }

  Map<String, dynamic> toIntegrationSignal() {
    return {
      'sourceId': id,
      'sourceType': 'vibeapp-native',
      'capturedAt': createdAt.toIso8601String(),
      'participantId': 'Usuario',
      'payloadType': 'calendar',
      'payload': {
        'title': title,
        'description': description,
        'location': location.isEmpty ? 'Sin ubicación' : location,
        'startAt': startAt.toIso8601String(),
        'endAt': endAt.toIso8601String(),
        'type': 'Personal',
      },
      'privacyLevel': 'private',
      'idempotencyKey': idempotencyKey,
      'deviceMetadata': {
        'platform': Platform.operatingSystem,
        'sourceDevice': 'Vibeapp',
      },
      'metadata': {
        'syncContract': 'vibeapp-ingest-calendar-v1',
      },
    };
  }
}

class LocationDraft {
  LocationDraft({
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    this.altitude = 0,
    this.speed = 0,
    this.heading = 0,
    String? id,
    DateTime? capturedAt,
  })  : id = id ?? 'native-location-${DateTime.now().microsecondsSinceEpoch}',
        capturedAt = capturedAt ?? DateTime.now().toUtc();

  factory LocationDraft.fromPosition(Position position) {
    return LocationDraft(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      altitude: position.altitude,
      speed: position.speed,
      heading: position.heading,
      capturedAt: position.timestamp.toUtc(),
    );
  }

  factory LocationDraft.fromJson(Map<String, dynamic> json) {
    return LocationDraft(
      id: stringFromJson(json['id']),
      latitude: doubleFromJson(json['latitude']),
      longitude: doubleFromJson(json['longitude']),
      accuracy: doubleFromJson(json['accuracy']),
      altitude: doubleFromJson(json['altitude']),
      speed: doubleFromJson(json['speed']),
      heading: doubleFromJson(json['heading']),
      capturedAt: parseNativeDate(json['capturedAt']),
    );
  }

  final String id;
  final double latitude;
  final double longitude;
  final double accuracy;
  final double altitude;
  final double speed;
  final double heading;
  final DateTime capturedAt;

  String get displayLocation =>
      '${latitude.toStringAsFixed(6)}, ${longitude.toStringAsFixed(6)}';

  String get detail =>
      'Coordenadas $displayLocation · precisión aproximada ${accuracy.toStringAsFixed(0)} m';

  Map<String, dynamic> toMetadata() {
    return {
      'source': 'vibeapp-native',
      'sourceDevice': Platform.operatingSystem,
      'payloadType': 'location',
      'locationId': id,
      'latitude': latitude,
      'longitude': longitude,
      'accuracyMeters': accuracy,
      'altitude': altitude,
      'speed': speed,
      'heading': heading,
      'capturedAt': capturedAt.toIso8601String(),
    };
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'altitude': altitude,
      'speed': speed,
      'heading': heading,
      'capturedAt': capturedAt.toIso8601String(),
    };
  }
}

class BiometricImportSummary {
  const BiometricImportSummary({
    required this.name,
    required this.size,
    required this.recordCount,
    required this.metricNames,
    required this.startAt,
    required this.endAt,
    required this.summaryText,
    required this.analysisText,
  });

  factory BiometricImportSummary.fromRawText(
    String rawText, {
    required String fileName,
    required int size,
  }) {
    final normalized = rawText.replaceFirst('\uFEFF', '').trim();
    final rows = fileName.toLowerCase().endsWith('.json')
        ? _countJsonRows(normalized)
        : _parseCsvRows(normalized);
    final recordCount = rows.length;
    final metricNames = _detectBiometricMetrics(rows, normalized);
    final dates = rows.map(_extractDateValue).whereType<DateTime>().toList()
      ..sort();
    final startAt = dates.isEmpty ? '' : dates.first.toUtc().toIso8601String();
    final endAt = dates.isEmpty ? '' : dates.last.toUtc().toIso8601String();
    final metricText = metricNames.isEmpty
        ? 'sin señales identificadas'
        : metricNames.join(', ');
    final rangeText = startAt.isEmpty
        ? 'sin rango de fechas detectado'
        : '${formatDateLabel(DateTime.parse(startAt))} - ${formatDateLabel(DateTime.parse(endAt))}';
    final summary =
        'Importación biométrica desde Vibeapp. $recordCount registros. Señales: $metricText. Rango: $rangeText.';
    return BiometricImportSummary(
      name: fileName,
      size: size,
      recordCount: recordCount,
      metricNames: metricNames,
      startAt: startAt,
      endAt: endAt,
      summaryText: summary,
      analysisText:
          '$summary Contexto transversal para cruzar por fecha/hora con energía, recuperación, sueño, actividad o estrés.',
    );
  }

  factory BiometricImportSummary.fromJson(Map<String, dynamic> json) {
    return BiometricImportSummary(
      name: stringFromJson(json['name']).isEmpty
          ? 'biometria.csv'
          : stringFromJson(json['name']),
      size: intFromJson(json['size']),
      recordCount: intFromJson(json['recordCount']),
      metricNames: listOfStringsFromJson(json['metricNames']),
      startAt: stringFromJson(json['startAt']),
      endAt: stringFromJson(json['endAt']),
      summaryText: stringFromJson(json['summaryText']),
      analysisText: stringFromJson(json['analysisText']),
    );
  }

  final String name;
  final int size;
  final int recordCount;
  final List<String> metricNames;
  final String startAt;
  final String endAt;
  final String summaryText;
  final String analysisText;

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'size': size,
      'recordCount': recordCount,
      'metricNames': metricNames,
      'startAt': startAt,
      'endAt': endAt,
      'summaryText': summaryText,
      'analysisText': analysisText,
      'sourceDevice': 'Vibeapp biometric file',
      'importedAt': DateTime.now().toUtc().toIso8601String(),
    };
  }

  static List<Map<String, String>> _parseCsvRows(String text) {
    final lines = text
        .split(RegExp(r'\r?\n'))
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();
    if (lines.isEmpty) return const [];
    final headers = _splitCsvLine(lines.first);
    return lines.skip(1).take(20000).map((line) {
      final values = _splitCsvLine(line);
      return {
        for (var i = 0; i < headers.length; i++)
          headers[i].trim(): i < values.length ? values[i].trim() : '',
      };
    }).toList();
  }

  static List<Map<String, String>> _countJsonRows(String text) {
    try {
      final decoded = jsonDecode(text);
      final items = decoded is List
          ? decoded
          : decoded is Map && decoded['data'] is List
              ? decoded['data'] as List
              : decoded is Map && decoded['records'] is List
                  ? decoded['records'] as List
                  : decoded is Map && decoded['items'] is List
                      ? decoded['items'] as List
                      : const [];
      return items.take(20000).map((item) {
        if (item is Map) {
          return item.map((key, value) => MapEntry('$key', '$value'));
        }
        return {'value': '$item'};
      }).toList();
    } catch (_) {
      return const [];
    }
  }

  static List<String> _splitCsvLine(String line) {
    final values = <String>[];
    final buffer = StringBuffer();
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      final char = line[i];
      if (char == '"') {
        quoted = !quoted;
      } else if (char == ',' && !quoted) {
        values.add(buffer.toString());
        buffer.clear();
      } else {
        buffer.write(char);
      }
    }
    values.add(buffer.toString());
    return values;
  }

  static List<String> _detectBiometricMetrics(
    List<Map<String, String>> rows,
    String rawText,
  ) {
    final haystack = [
      rawText.substring(0, rawText.length > 4000 ? 4000 : rawText.length),
      ...rows.take(20).map((row) => row.values.join(' ')),
    ].join(' ').toLowerCase();
    final candidates = <String, RegExp>{
      'sueño': RegExp(r'sleep|sue[nñ]o'),
      'pasos': RegExp(r'step|paso'),
      'frecuencia cardiaca': RegExp(r'heart|cardio|pulse|frecuencia'),
      'energía activa': RegExp(r'active energy|calor|kcal|energia|energía'),
      'distancia': RegExp(r'distance|distancia'),
      'entrenamiento': RegExp(r'workout|exercise|actividad|entreno'),
      'oxígeno': RegExp(r'oxygen|spo2|respir'),
    };
    return candidates.entries
        .where((entry) => entry.value.hasMatch(haystack))
        .map((entry) => entry.key)
        .toList();
  }

  static DateTime? _extractDateValue(Map<String, String> row) {
    for (final entry in row.entries) {
      final key = entry.key.toLowerCase();
      if (!RegExp(r'date|time|fecha|inicio|start|end').hasMatch(key)) {
        continue;
      }
      final parsed = DateTime.tryParse(entry.value);
      if (parsed != null) return parsed;
    }
    return null;
  }
}

class NativeAttachmentDraft {
  const NativeAttachmentDraft({
    required this.id,
    required this.filePath,
    required this.name,
    required this.mimeType,
    required this.size,
    required this.sourceType,
    required this.createdAt,
    this.previewText = '',
    this.analysisText = '',
    this.metadataExtras = const {},
    this.eventId = '',
    this.eventTitle = '',
    this.eventOrder = 0,
  });

  factory NativeAttachmentDraft.fromFilePath(
    String filePath, {
    required String sourceType,
    String eventId = '',
    String eventTitle = '',
    int eventOrder = 0,
    String previewText = '',
    String analysisText = '',
    Map<String, dynamic> metadataExtras = const {},
  }) {
    final file = File(filePath);
    final name = file.uri.pathSegments.isNotEmpty
        ? file.uri.pathSegments.last
        : 'vibeapp-image.jpg';
    final size = file.existsSync() ? file.lengthSync() : 0;
    final now = DateTime.now().toUtc();
    return NativeAttachmentDraft(
      id: 'native-asset-${now.microsecondsSinceEpoch}',
      filePath: filePath,
      name: name,
      mimeType: inferMimeType(name, sourceType),
      size: size,
      sourceType: sourceType,
      createdAt: now,
      previewText: previewText,
      analysisText: analysisText,
      metadataExtras: metadataExtras,
      eventId: eventId,
      eventTitle: eventTitle,
      eventOrder: eventOrder,
    );
  }

  static Future<NativeAttachmentDraft> fromXFile(
    XFile file, {
    required String sourceType,
    String eventId = '',
    String eventTitle = '',
    int eventOrder = 0,
  }) async {
    final now = DateTime.now().toUtc();
    final name = file.name.isNotEmpty ? file.name : 'vibeapp-image.jpg';
    final size = await file.length();
    return NativeAttachmentDraft(
      id: 'native-asset-${now.microsecondsSinceEpoch}',
      filePath: file.path,
      name: name,
      mimeType: file.mimeType ?? inferMimeType(name, sourceType),
      size: size,
      sourceType: sourceType,
      createdAt: now,
      eventId: eventId,
      eventTitle: eventTitle,
      eventOrder: eventOrder,
    );
  }

  factory NativeAttachmentDraft.fromJson(Map<String, dynamic> json) {
    return NativeAttachmentDraft(
      id: stringFromJson(json['id']).isEmpty
          ? 'native-asset-${DateTime.now().microsecondsSinceEpoch}'
          : stringFromJson(json['id']),
      filePath: stringFromJson(json['filePath']),
      name: stringFromJson(json['name']).isEmpty
          ? 'vibeapp-asset'
          : stringFromJson(json['name']),
      mimeType: stringFromJson(json['mimeType']).isEmpty
          ? inferMimeType(
              stringFromJson(json['name']), stringFromJson(json['sourceType']))
          : stringFromJson(json['mimeType']),
      size: intFromJson(json['size']),
      sourceType: stringFromJson(json['sourceType']).isEmpty
          ? 'document'
          : stringFromJson(json['sourceType']),
      createdAt: parseNativeDate(json['createdAt']) ?? DateTime.now().toUtc(),
      previewText: stringFromJson(json['previewText']),
      analysisText: stringFromJson(json['analysisText']),
      metadataExtras: mapFromJson(json['metadataExtras']),
      eventId: stringFromJson(json['eventId']),
      eventTitle: stringFromJson(json['eventTitle']),
      eventOrder: intFromJson(json['eventOrder']),
    );
  }

  final String id;
  final String filePath;
  final String name;
  final String mimeType;
  final int size;
  final String sourceType;
  final DateTime createdAt;
  final String previewText;
  final String analysisText;
  final Map<String, dynamic> metadataExtras;
  final String eventId;
  final String eventTitle;
  final int eventOrder;

  String get kind => sourceType == 'image' ? 'image' : sourceType;

  String get displayLabel {
    if (sourceType == 'biometric') return 'Biometría';
    if (sourceType == 'video') return 'Video';
    if (sourceType == 'audio') return 'Audio';
    if (sourceType == 'document') return 'Documento';
    if (sourceType == 'zip') return 'ZIP';
    return 'Foto';
  }

  String get idempotencyKey => 'vibeapp-asset:$id';

  String get storageObjectHint {
    final safeName =
        name.replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '-').replaceAll('--', '-');
    return '$id-$safeName';
  }

  Map<String, dynamic> toMediaMetadata(int byteLength) {
    return {
      'id': id,
      'name': name,
      'type': mimeType,
      'size': byteLength,
      'kind': kind,
      'sourceType': 'vibeapp-native-$sourceType',
      'sourceDevice': Platform.operatingSystem,
      'sourceId': id,
      'idempotencyKey': idempotencyKey,
      'createdAt': createdAt.toIso8601String(),
      'metadata': {
        'source': 'vibeapp-native',
        'capturedAt': createdAt.toIso8601String(),
        'idempotencyKey': idempotencyKey,
        'storageObjectHint': storageObjectHint,
        'eventId': eventId,
        'eventTitle': eventTitle,
        'eventOrder': eventOrder,
        ...metadataExtras,
      },
    };
  }

  Map<String, dynamic> toExperienceAttachment([Map<String, dynamic>? remote]) {
    return {
      'id': id,
      'name': remote?['name'] ?? name,
      'type': remote?['type'] ?? mimeType,
      'originalType': remote?['originalType'] ?? mimeType,
      'size': remote?['size'] ?? size,
      'kind': remote?['kind'] ?? kind,
      'storage': remote?['storage'] ?? 'local-native',
      'path': remote?['path'] ?? '',
      'url': remote?['url'] ?? '',
      'sourceType': 'vibeapp-native-$sourceType',
      'sourceDevice': Platform.operatingSystem,
      'sourceId': id,
      'eventId': eventId,
      'eventTitle': eventTitle,
      'eventOrder': eventOrder,
      'previewText': previewText.isEmpty
          ? '$displayLabel capturado desde Vibeapp.'
          : previewText,
      'analysisText': analysisText.isEmpty
          ? '$displayLabel capturado desde la app nativa y sincronizado con Storage privado.'
          : analysisText,
      'metadata': {
        ...(remote?['metadata'] is Map<String, dynamic>
            ? remote!['metadata'] as Map<String, dynamic>
            : <String, dynamic>{}),
        'source': 'vibeapp-native',
        'capturedAt': createdAt.toIso8601String(),
        'idempotencyKey': idempotencyKey,
        'storageObjectHint': storageObjectHint,
        'linkedEventId': eventId,
        'linkedEventTitle': eventTitle,
        'eventOrder': eventOrder,
        ...metadataExtras,
      },
    };
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'filePath': filePath,
      'name': name,
      'mimeType': mimeType,
      'size': size,
      'sourceType': sourceType,
      'createdAt': createdAt.toIso8601String(),
      'previewText': previewText,
      'analysisText': analysisText,
      'metadataExtras': metadataExtras,
      'eventId': eventId,
      'eventTitle': eventTitle,
      'eventOrder': eventOrder,
    };
  }
}

class NativePayloadValidation {
  const NativePayloadValidation({
    this.errors = const [],
    this.warnings = const [],
  });

  final List<String> errors;
  final List<String> warnings;

  bool get canSync => errors.isEmpty;
  bool get hasWarnings => warnings.isNotEmpty;
  List<String> get messages => [...errors, ...warnings];
  String get label {
    if (errors.isNotEmpty) return 'Revisar antes de enviar';
    if (warnings.isNotEmpty) return 'Listo con advertencias';
    return 'Listo para sincronizar';
  }

  String get primaryMessage {
    if (errors.isNotEmpty) return errors.first;
    if (warnings.isNotEmpty) return warnings.first;
    return 'Listo para sincronizar.';
  }
}

class CaptureQueueItem {
  CaptureQueueItem({
    required this.id,
    required this.title,
    required this.detail,
    required this.sourceType,
    required this.createdAt,
    required this.status,
    this.error = '',
    this.remoteId,
    this.events = const [],
    this.attachments = const [],
    this.agendaEvent,
    this.locationDraft,
    this.biometricSummary,
    this.closedAt,
    this.externalSessionSource,
    this.externalSessionContract,
    this.structuredContext = const {},
    this.attemptCount = 0,
    this.lastAttemptAt,
    this.nextRetryAt,
  });

  factory CaptureQueueItem.text(String text) {
    final now = DateTime.now().toUtc();
    return CaptureQueueItem(
      id: 'native-${now.microsecondsSinceEpoch}',
      title: 'Texto',
      detail: text,
      sourceType: 'text',
      createdAt: now,
      status: CaptureSyncStatus.queued,
    );
  }

  factory CaptureQueueItem.media(NativeAttachmentDraft attachment) {
    final now = DateTime.now().toUtc();
    final label = attachment.displayLabel;
    return CaptureQueueItem(
      id: 'native-media-${now.microsecondsSinceEpoch}',
      title: label,
      detail: '$label capturado desde Vibeapp: ${attachment.name}',
      sourceType: attachment.sourceType,
      createdAt: now,
      status: CaptureSyncStatus.queued,
      attachments: [attachment],
    );
  }

  factory CaptureQueueItem.agenda(AgendaEventDraft event) {
    return CaptureQueueItem(
      id: event.id,
      title: 'Agenda',
      detail:
          '${event.title} · ${formatDateLabel(event.startAt.toLocal())} ${formatClock(event.startAt)}',
      sourceType: 'agenda',
      createdAt: event.createdAt,
      status: CaptureSyncStatus.queued,
      agendaEvent: event,
    );
  }

  factory CaptureQueueItem.location(LocationDraft location) {
    return CaptureQueueItem(
      id: location.id,
      title: 'Lugar',
      detail: location.detail,
      sourceType: 'location',
      createdAt: location.capturedAt,
      status: CaptureSyncStatus.queued,
      locationDraft: location,
    );
  }

  factory CaptureQueueItem.biometric(
    NativeAttachmentDraft attachment,
    BiometricImportSummary summary,
  ) {
    return CaptureQueueItem(
      id: 'native-biometric-${DateTime.now().microsecondsSinceEpoch}',
      title: 'Biometría',
      detail: summary.summaryText,
      sourceType: 'biometric',
      createdAt: DateTime.now().toUtc(),
      status: CaptureSyncStatus.queued,
      attachments: [attachment],
      biometricSummary: summary,
    );
  }

  factory CaptureQueueItem.healthConnect(HealthConnectPreviewBundle bundle) {
    final now = DateTime.now().toUtc();
    final id = 'native-health-connect-${now.microsecondsSinceEpoch}';
    final records = bundle.records;
    final events = records.asMap().entries.map((entry) {
      final order = entry.key + 1;
      final record = entry.value;
      return ExperienceEventDraft(
        id: '$id-event-$order',
        title: 'Health Connect: ${record.type.label}',
        description:
            '${record.value} ${record.type.unit} desde ${record.sourceDevice}.',
        order: order,
        timestamp: record.endAt,
      );
    }).toList();
    return CaptureQueueItem(
      id: id,
      title: 'Health Connect',
      detail: bundle.summaryText,
      sourceType: 'health-connect-context',
      createdAt: now,
      status: CaptureSyncStatus.queued,
      events: events,
      externalSessionSource: 'Health Connect',
      externalSessionContract: 'android-health-connect-native-v1',
      structuredContext: bundle.toJson(),
    );
  }

  factory CaptureQueueItem.externalSession(
    ExternalSessionImportDraft draft,
    List<PlatformFile> files,
  ) {
    final now = DateTime.now().toUtc();
    final id = 'native-external-${now.microsecondsSinceEpoch}';
    final intro = draft.notes.isEmpty
        ? 'Sesion importada desde ${draft.source.label}.'
        : draft.notes;
    final events = <ExperienceEventDraft>[
      ExperienceEventDraft(
        id: '$id-event-1',
        title: 'Sesion externa importada',
        description:
            '$intro Origen: ${draft.source.label}. Archivos: ${files.length}.',
        order: 1,
        timestamp: now,
      ),
    ];
    final attachments = <NativeAttachmentDraft>[];
    for (final file in files) {
      final path = file.path ?? '';
      if (path.isEmpty) continue;
      final order = events.length + 1;
      final profile = buildExternalFileImportProfile(draft.source, file.name);
      final sourceType = profile.sourceType;
      final eventTitle = profile.eventTitle(order);
      final eventId = '$id-event-$order';
      events.add(ExperienceEventDraft(
        id: eventId,
        title: eventTitle,
        description: '${profile.treatment} Archivo: ${file.name}.',
        order: order,
        timestamp: now,
      ));
      attachments.add(NativeAttachmentDraft.fromFilePath(
        path,
        sourceType: sourceType,
        eventId: eventId,
        eventTitle: eventTitle,
        eventOrder: order,
        previewText: profile.previewText(draft.source, file.name),
        analysisText: profile.analysisText(draft.source, file.name),
        metadataExtras: profile.toMetadata(draft.source, file.name),
      ));
    }
    return CaptureQueueItem(
      id: id,
      title: draft.title,
      detail:
          '$intro\nOrigen: ${draft.source.label}\nArchivos importados: ${attachments.length}',
      sourceType: 'external-session',
      createdAt: now,
      status: CaptureSyncStatus.queued,
      events: events,
      attachments: attachments,
      externalSessionSource: draft.source.label,
      externalSessionContract: draft.source.contract,
    );
  }

  factory CaptureQueueItem.fromSession(ActiveExperienceSession session) {
    final details = session.events
        .map((event) => '${event.order}. ${event.title}: ${event.description}')
        .join('\n');
    return CaptureQueueItem(
      id: session.id,
      title: session.title,
      detail: details.isEmpty ? 'Experiencia iniciada desde Vibeapp.' : details,
      sourceType: 'experience-session',
      createdAt: session.startedAt,
      status: CaptureSyncStatus.queued,
      events: List<ExperienceEventDraft>.from(session.events),
      attachments: List<NativeAttachmentDraft>.from(session.attachments),
      closedAt: session.closedAt,
    );
  }

  factory CaptureQueueItem.nativeAction(NativeCaptureAction action) {
    final now = DateTime.now().toUtc();
    return CaptureQueueItem(
      id: 'native-action-${now.microsecondsSinceEpoch}',
      title: action.label,
      detail: action.detail,
      sourceType: action.label.toLowerCase(),
      createdAt: now,
      status: CaptureSyncStatus.needsNativePlugin,
      error: 'Falta conectar plugin nativo.',
    );
  }

  factory CaptureQueueItem.fromJson(Map<String, dynamic> json) {
    return CaptureQueueItem(
      id: stringFromJson(json['id']).isEmpty
          ? 'native-${DateTime.now().microsecondsSinceEpoch}'
          : stringFromJson(json['id']),
      title: stringFromJson(json['title']).isEmpty
          ? 'Captura'
          : stringFromJson(json['title']),
      detail: stringFromJson(json['detail']),
      sourceType: stringFromJson(json['sourceType']).isEmpty
          ? 'text'
          : stringFromJson(json['sourceType']),
      createdAt: parseNativeDate(json['createdAt']) ?? DateTime.now().toUtc(),
      status: captureStatusFromJson(json['status']),
      error: stringFromJson(json['error']),
      remoteId: stringFromJson(json['remoteId']).isEmpty
          ? null
          : stringFromJson(json['remoteId']),
      events: listOfMapsFromJson(json['events'])
          .map(ExperienceEventDraft.fromJson)
          .toList(),
      attachments: listOfMapsFromJson(json['attachments'])
          .map(NativeAttachmentDraft.fromJson)
          .toList(),
      agendaEvent: json['agendaEvent'] is Map
          ? AgendaEventDraft.fromJson(mapFromJson(json['agendaEvent']))
          : null,
      locationDraft: json['locationDraft'] is Map
          ? LocationDraft.fromJson(mapFromJson(json['locationDraft']))
          : null,
      biometricSummary: json['biometricSummary'] is Map
          ? BiometricImportSummary.fromJson(
              mapFromJson(json['biometricSummary']))
          : null,
      closedAt: parseNativeDate(json['closedAt']),
      externalSessionSource:
          stringFromJson(json['externalSessionSource']).isEmpty
              ? null
              : stringFromJson(json['externalSessionSource']),
      externalSessionContract:
          stringFromJson(json['externalSessionContract']).isEmpty
              ? null
              : stringFromJson(json['externalSessionContract']),
      structuredContext: mapFromJson(json['structuredContext']),
      attemptCount: intFromJson(json['attemptCount']),
      lastAttemptAt: parseNativeDate(json['lastAttemptAt']),
      nextRetryAt: parseNativeDate(json['nextRetryAt']),
    );
  }

  final String id;
  final String title;
  final String detail;
  final String sourceType;
  final DateTime createdAt;
  CaptureSyncStatus status;
  String error;
  String? remoteId;
  final List<ExperienceEventDraft> events;
  final List<NativeAttachmentDraft> attachments;
  final AgendaEventDraft? agendaEvent;
  final LocationDraft? locationDraft;
  final BiometricImportSummary? biometricSummary;
  final DateTime? closedAt;
  final String? externalSessionSource;
  final String? externalSessionContract;
  final Map<String, dynamic> structuredContext;
  int attemptCount;
  DateTime? lastAttemptAt;
  DateTime? nextRetryAt;

  String get idempotencyKey => 'vibeapp-capture:$sourceType:$id';

  bool get shouldUseIntegrationIngest {
    if (attachments.isNotEmpty) return false;
    return sourceType == 'text' ||
        sourceType == 'location' ||
        sourceType == 'health-connect-context';
  }

  bool get canSync =>
      sourceType == 'text' ||
      sourceType == 'experience-session' ||
      sourceType == 'external-session' ||
      sourceType == 'health-connect-context' ||
      agendaEvent != null ||
      locationDraft != null ||
      biometricSummary != null ||
      attachments.isNotEmpty;

  bool get canAttemptSyncNow {
    return canAttemptSyncAt(DateTime.now().toUtc());
  }

  bool canAttemptSyncAt(DateTime now) {
    if (status == CaptureSyncStatus.needsNativePlugin) return false;
    final retryAt = nextRetryAt;
    return retryAt == null || !now.toUtc().isBefore(retryAt);
  }

  String get retryDescription {
    final retryAt = nextRetryAt;
    if (retryAt == null || status == CaptureSyncStatus.synced) return '';
    final seconds = retryAt.difference(DateTime.now().toUtc()).inSeconds;
    if (seconds <= 0) return 'Listo para reintentar.';
    if (seconds < 60) return 'Reintento automatico en ${seconds}s.';
    return 'Reintento automatico en ${(seconds / 60).ceil()} min.';
  }

  void markAttemptStarted() {
    attemptCount += 1;
    lastAttemptAt = DateTime.now().toUtc();
    nextRetryAt = null;
    status = CaptureSyncStatus.uploading;
    error = '';
  }

  void markSynced(String remoteIdValue) {
    status = CaptureSyncStatus.synced;
    remoteId = remoteIdValue;
    error = '';
    nextRetryAt = null;
  }

  void markFailed(String message, {bool retryable = true}) {
    status = CaptureSyncStatus.failed;
    error = message;
    if (!retryable) {
      nextRetryAt = null;
      return;
    }
    const waits = [15, 45, 120, 300, 900];
    final waitSeconds = waits[attemptCount.clamp(1, waits.length) - 1];
    nextRetryAt = DateTime.now().toUtc().add(Duration(seconds: waitSeconds));
  }

  NativePayloadValidation validateForSync() {
    final errors = <String>[];
    final warnings = <String>[];
    if (!canSync) {
      errors.add('Esta accion aun no tiene contrato de sincronizacion.');
    }
    if (title.trim().isEmpty) {
      errors.add('Falta titulo.');
    }
    if (sourceType == 'text' && detail.trim().isEmpty) {
      errors.add('Falta texto de la captura.');
    }
    if (sourceType == 'experience-session' &&
        events.isEmpty &&
        attachments.isEmpty) {
      warnings.add('La experiencia no tiene eventos ni activos.');
    }
    if (sourceType == 'external-session' && attachments.isEmpty) {
      errors.add('La sesion externa no tiene archivos validos.');
    }
    if (sourceType == 'health-connect-context' && structuredContext.isEmpty) {
      errors.add('Falta el paquete Health Connect normalizado.');
    }
    if (events.isNotEmpty) {
      final orders = <int>{};
      for (final event in events) {
        if (event.title.trim().isEmpty) errors.add('Hay un evento sin titulo.');
        if (event.description.trim().isEmpty) {
          warnings.add('Hay un evento sin descripcion.');
        }
        if (!orders.add(event.order)) {
          warnings.add('Hay eventos con orden repetido.');
        }
      }
    }
    for (final attachment in attachments) {
      final file = File(attachment.filePath);
      if (attachment.filePath.trim().isEmpty || !file.existsSync()) {
        errors.add('No se encuentra el archivo ${attachment.name}.');
        continue;
      }
      if (attachment.size <= 0 && file.lengthSync() <= 0) {
        errors.add('El archivo ${attachment.name} esta vacio.');
      }
      if (attachment.mimeType == 'application/octet-stream') {
        warnings.add('Tipo MIME no reconocido para ${attachment.name}.');
      }
      if ((sourceType == 'experience-session' ||
              sourceType == 'external-session') &&
          attachment.eventId.isEmpty) {
        warnings.add('${attachment.name} no tiene evento vinculado.');
      }
    }
    if (sourceType == 'external-session') {
      final hasVisual = attachments.any(
          (item) => item.sourceType == 'image' || item.sourceType == 'video');
      final hasBiometric =
          attachments.any((item) => item.sourceType == 'biometric');
      final source = externalSessionSource ?? '';
      if (source.contains('Meta') && !hasVisual) {
        warnings.add('Meta/Oakley normalmente deberia traer fotos o videos.');
      }
      if ((source.contains('Oura') ||
              source.contains('Apple') ||
              source.contains('Samsung') ||
              source.contains('Health Connect')) &&
          !hasBiometric) {
        warnings.add('Este origen funciona mejor con CSV o JSON biometrico.');
      }
    }
    return NativePayloadValidation(errors: errors, warnings: warnings);
  }

  String get subtitle {
    final reason = error.isEmpty ? detail : '$detail\n$error';
    return reason;
  }

  Map<String, dynamic> toExperiencePayload(
      [List<Map<String, dynamic>>? uploadedAttachments]) {
    final iso = createdAt.toIso8601String();
    final locationLabel = locationDraft?.displayLocation ?? 'Captura móvil';
    final isBiometric = biometricSummary != null ||
        sourceType == 'biometric' ||
        sourceType == 'health-connect-context';
    final isSession =
        sourceType == 'experience-session' || sourceType == 'external-session';
    final isExternalSession = sourceType == 'external-session';
    final eventList = events.isEmpty
        ? [
            ExperienceEventDraft(
              id: '$id-event-1',
              title: isBiometric
                  ? 'Biometría importada'
                  : locationDraft == null
                      ? 'Nota rápida'
                      : 'Lugar capturado',
              description: detail,
              order: 1,
              timestamp: createdAt,
            )
          ]
        : events;
    final duration = (closedAt ?? DateTime.now().toUtc())
        .difference(createdAt)
        .inMinutes
        .clamp(0, 1440);
    return {
      'id': id,
      'title': isSession
          ? title
          : detail.length > 48
              ? '${detail.substring(0, 48)}...'
              : detail,
      'category': isBiometric ? 'Salud' : 'Dato del usuario',
      'timestamp': iso,
      'duration': duration,
      'mood': 'Calmo',
      'energy': 5,
      'location': isExternalSession
          ? 'Importacion externa'
          : isBiometric
              ? 'Contexto transversal'
              : locationLabel,
      'people': 'Usuario',
      'objective': sourceType == 'experience-session'
          ? 'Experiencia con eventos desde Vibeapp'
          : isExternalSession
              ? 'Sesion externa importada desde Vibeapp'
              : isBiometric
                  ? 'Biometría transversal desde Vibeapp'
                  : locationDraft == null
                      ? 'Captura rápida desde Vibeapp'
                      : 'Ubicación capturada desde Vibeapp',
      'notes': detail,
      'locale': 'es',
      'metadata': {
        'sourceType': 'vibeapp-native',
        'sourceDevice': Platform.operatingSystem,
        'sourceEventId': id,
        'idempotencyKey': idempotencyKey,
        'capturedAt': iso,
        'closedAt': closedAt?.toIso8601String(),
        if (externalSessionSource != null)
          'externalSessionSource': externalSessionSource,
        if (externalSessionContract != null)
          'externalSessionContract': externalSessionContract,
        if (structuredContext.isNotEmpty)
          'structuredContext': structuredContext,
        if (locationDraft != null) ...locationDraft!.toMetadata(),
        if (biometricSummary != null)
          'biometricImport': biometricSummary!.toJson(),
        'syncContract': sourceType == 'experience-session'
            ? 'vibeapp-session-v1'
            : isExternalSession
                ? 'vibeapp-external-session-v1'
                : isBiometric
                    ? sourceType == 'health-connect-context'
                        ? 'vibeapp-health-connect-v1'
                        : 'vibeapp-biometric-file-v1'
                    : locationDraft == null
                        ? 'vibeapp-text-v1'
                        : 'vibeapp-location-v1',
      },
      'events': eventList.map((event) => event.toJson()).toList(),
      'attachments': uploadedAttachments ??
          attachments.map((item) => item.toExperienceAttachment()).toList(),
    };
  }

  Map<String, dynamic> toIntegrationSignal() {
    final payloadType = sourceType == 'health-connect-context'
        ? inferHealthConnectPayloadType()
        : locationDraft != null
            ? 'location'
            : 'text';
    return {
      'sourceId': id,
      'sourceType': sourceType == 'health-connect-context'
          ? 'android-health-connect'
          : 'vibeapp-native',
      'capturedAt': createdAt.toIso8601String(),
      'participantId': 'Usuario',
      'payloadType': payloadType,
      'payload': buildIntegrationPayload(),
      'privacyLevel': payloadType == 'biometric' || payloadType == 'activity'
          ? 'sensitive'
          : 'private',
      'idempotencyKey': idempotencyKey,
      'deviceMetadata': {
        'platform': Platform.operatingSystem,
        'sourceDevice': sourceType == 'health-connect-context'
            ? 'Health Connect'
            : 'Vibeapp',
      },
      'metadata': {
        'syncContract': sourceType == 'health-connect-context'
            ? 'vibeapp-ingest-health-connect-v1'
            : locationDraft != null
                ? 'vibeapp-ingest-location-v1'
                : 'vibeapp-ingest-text-v1',
        if (structuredContext.isNotEmpty)
          'structuredContext': structuredContext,
      },
    };
  }

  String inferHealthConnectPayloadType() {
    final signals = structuredContext['signals'];
    if (signals is List && signals.isNotEmpty && signals.first is Map) {
      final first = Map<String, dynamic>.from(signals.first as Map);
      final value = stringFromJson(first['payloadType']);
      if (value.isNotEmpty) return value;
    }
    return 'biometric';
  }

  Map<String, dynamic> buildIntegrationPayload() {
    if (locationDraft != null) {
      return {
        'latitude': locationDraft!.latitude,
        'longitude': locationDraft!.longitude,
        'accuracyMeters': locationDraft!.accuracy,
        'altitude': locationDraft!.altitude,
        'speed': locationDraft!.speed,
        'heading': locationDraft!.heading,
        'location': locationDraft!.displayLocation,
      };
    }
    if (sourceType == 'health-connect-context') {
      final signals = structuredContext['signals'];
      final firstSignal =
          signals is List && signals.isNotEmpty && signals.first is Map
              ? Map<String, dynamic>.from(signals.first as Map)
              : <String, dynamic>{};
      final firstPayload = firstSignal['payload'] is Map
          ? Map<String, dynamic>.from(firstSignal['payload'] as Map)
          : <String, dynamic>{};
      return {
        ...firstPayload,
        'records': signals is List ? signals : const [],
        'metrics': structuredContext['metrics'] is Map
            ? structuredContext['metrics']
            : const {},
        'summary': detail,
      };
    }
    return {
      'title': title,
      'text': detail,
      'category': 'Dato del usuario',
      'energy': 5,
      'mood': 'Calmo',
    };
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'detail': detail,
      'sourceType': sourceType,
      'createdAt': createdAt.toIso8601String(),
      'status': status.name,
      'error': error,
      'remoteId': remoteId,
      'events': events.map((event) => event.toJson()).toList(),
      'attachments':
          attachments.map((attachment) => attachment.toJson()).toList(),
      'agendaEvent': agendaEvent?.toJson(),
      'locationDraft': locationDraft?.toJson(),
      'biometricSummary': biometricSummary?.toJson(),
      'closedAt': closedAt?.toIso8601String(),
      'externalSessionSource': externalSessionSource,
      'externalSessionContract': externalSessionContract,
      'structuredContext': structuredContext,
      'attemptCount': attemptCount,
      'lastAttemptAt': lastAttemptAt?.toIso8601String(),
      'nextRetryAt': nextRetryAt?.toIso8601String(),
    };
  }
}

class CaptureQueueSummary {
  const CaptureQueueSummary({
    required this.total,
    required this.synced,
    required this.uploading,
    required this.readyToSync,
    required this.waitingRetry,
    required this.retryableFailures,
    required this.terminalFailures,
    required this.needsSession,
    required this.needsNativePlugin,
    required this.validationBlocked,
    required this.attachmentsPending,
    required this.eventsPending,
  });

  factory CaptureQueueSummary.fromItems(
    Iterable<CaptureQueueItem> items, {
    DateTime? now,
  }) {
    final referenceTime = (now ?? DateTime.now()).toUtc();
    var total = 0;
    var synced = 0;
    var uploading = 0;
    var readyToSync = 0;
    var waitingRetry = 0;
    var retryableFailures = 0;
    var terminalFailures = 0;
    var needsSession = 0;
    var needsNativePlugin = 0;
    var validationBlocked = 0;
    var attachmentsPending = 0;
    var eventsPending = 0;

    for (final item in items) {
      total += 1;
      if (item.status == CaptureSyncStatus.synced) {
        synced += 1;
        continue;
      }
      attachmentsPending += item.attachments.length;
      eventsPending += item.events.length;
      final validation = item.validateForSync();
      if (!validation.canSync) {
        validationBlocked += 1;
      }
      switch (item.status) {
        case CaptureSyncStatus.synced:
          break;
        case CaptureSyncStatus.uploading:
          uploading += 1;
          break;
        case CaptureSyncStatus.needsSession:
          needsSession += 1;
          break;
        case CaptureSyncStatus.needsNativePlugin:
          needsNativePlugin += 1;
          break;
        case CaptureSyncStatus.failed:
          if (item.nextRetryAt == null) {
            terminalFailures += 1;
          } else if (item.canAttemptSyncAt(referenceTime)) {
            retryableFailures += 1;
            if (validation.canSync) readyToSync += 1;
          } else {
            waitingRetry += 1;
          }
          break;
        case CaptureSyncStatus.queued:
          if (item.canAttemptSyncAt(referenceTime) && validation.canSync) {
            readyToSync += 1;
          } else {
            waitingRetry += 1;
          }
          break;
      }
    }

    return CaptureQueueSummary(
      total: total,
      synced: synced,
      uploading: uploading,
      readyToSync: readyToSync,
      waitingRetry: waitingRetry,
      retryableFailures: retryableFailures,
      terminalFailures: terminalFailures,
      needsSession: needsSession,
      needsNativePlugin: needsNativePlugin,
      validationBlocked: validationBlocked,
      attachmentsPending: attachmentsPending,
      eventsPending: eventsPending,
    );
  }

  final int total;
  final int synced;
  final int uploading;
  final int readyToSync;
  final int waitingRetry;
  final int retryableFailures;
  final int terminalFailures;
  final int needsSession;
  final int needsNativePlugin;
  final int validationBlocked;
  final int attachmentsPending;
  final int eventsPending;

  int get pending => total - synced;
  int get needsUserAction =>
      terminalFailures + needsSession + needsNativePlugin + validationBlocked;
  bool get isClear => pending == 0;
  bool get isHealthy => needsUserAction == 0 && waitingRetry == 0;

  String get operatorMessage {
    if (total == 0) {
      return 'Sin capturas en cola. La proxima captura se sincronizara automaticamente al tener sesion y conexion.';
    }
    if (isClear) {
      return 'Todo lo capturado ya esta sincronizado con Vibe.';
    }
    if (needsUserAction > 0) {
      return '$needsUserAction elemento(s) requieren accion: sesion, archivo valido o plugin nativo.';
    }
    if (uploading > 0) {
      return '$uploading elemento(s) se estan subiendo ahora.';
    }
    if (readyToSync > 0) {
      return '$readyToSync elemento(s) listos para sincronizar. Vibeapp los enviara automaticamente.';
    }
    if (waitingRetry > 0) {
      return '$waitingRetry elemento(s) esperando reintento automatico.';
    }
    return '$pending elemento(s) pendientes de sincronizacion.';
  }
}

class ActiveExperienceSession {
  ActiveExperienceSession({
    required this.id,
    required this.title,
    required this.startedAt,
    this.closedAt,
    List<ExperienceEventDraft>? events,
    List<NativeAttachmentDraft>? attachments,
  })  : events = events ?? [],
        attachments = attachments ?? [];

  factory ActiveExperienceSession.start(String title) {
    final now = DateTime.now().toUtc();
    return ActiveExperienceSession(
      id: 'native-session-${now.microsecondsSinceEpoch}',
      title: title,
      startedAt: now,
    );
  }

  final String id;
  final String title;
  final DateTime startedAt;
  DateTime? closedAt;
  final List<ExperienceEventDraft> events;
  final List<NativeAttachmentDraft> attachments;

  void addTextEvent(String text) {
    events.add(ExperienceEventDraft(
      id: '$id-event-${events.length + 1}',
      title: 'Nota ${events.length + 1}',
      description: text,
      order: events.length + 1,
      timestamp: DateTime.now().toUtc(),
    ));
  }

  void addNativeAction(NativeCaptureAction action) {
    events.add(ExperienceEventDraft(
      id: '$id-event-${events.length + 1}',
      title: '${action.label} pendiente',
      description:
          '${action.detail} Estado: falta conectar el plugin nativo antes de capturar el archivo real.',
      order: events.length + 1,
      timestamp: DateTime.now().toUtc(),
    ));
  }

  void addAgendaEvent(AgendaEventDraft agenda) {
    events.add(ExperienceEventDraft(
      id: '$id-event-${events.length + 1}',
      title: 'Agenda: ${agenda.title}',
      description:
          '${agenda.description.isEmpty ? 'Evento creado desde Vibeapp.' : agenda.description} Lugar: ${agenda.location.isEmpty ? 'Sin ubicación' : agenda.location}.',
      order: events.length + 1,
      timestamp: agenda.startAt,
    ));
  }

  void addLocationEvent(LocationDraft location) {
    events.add(ExperienceEventDraft(
      id: '$id-event-${events.length + 1}',
      title: 'Lugar capturado',
      description: location.detail,
      order: events.length + 1,
      timestamp: location.capturedAt,
    ));
  }

  void addBiometricEvent(BiometricImportSummary summary) {
    events.add(ExperienceEventDraft(
      id: '$id-event-${events.length + 1}',
      title: 'Biometría importada',
      description: summary.summaryText,
      order: events.length + 1,
      timestamp: DateTime.now().toUtc(),
    ));
  }

  void addBiometricAttachment(
    NativeAttachmentDraft attachment,
    BiometricImportSummary summary,
  ) {
    final order = events.length + 1;
    final event = ExperienceEventDraft(
      id: '$id-event-$order',
      title: 'Biometría importada',
      description: summary.summaryText,
      order: order,
      timestamp: DateTime.now().toUtc(),
    );
    events.add(event);
    attachments.add(NativeAttachmentDraft.fromFilePath(
      attachment.filePath,
      sourceType: attachment.sourceType,
      eventId: event.id,
      eventTitle: event.title,
      eventOrder: event.order,
      previewText: attachment.previewText,
      analysisText: attachment.analysisText,
      metadataExtras: attachment.metadataExtras,
    ));
  }

  void addAttachmentEvent(NativeAttachmentDraft attachment) {
    final order = events.length + 1;
    final label = attachment.displayLabel;
    final event = ExperienceEventDraft(
      id: '$id-event-$order',
      title: '$label $order',
      description:
          '$label capturado desde Vibeapp y vinculado a esta experiencia.',
      order: order,
      timestamp: DateTime.now().toUtc(),
    );
    events.add(event);
    attachments.add(NativeAttachmentDraft.fromFilePath(
      attachment.filePath,
      sourceType: attachment.sourceType,
      eventId: event.id,
      eventTitle: event.title,
      eventOrder: event.order,
    ));
  }

  void close() {
    closedAt = DateTime.now().toUtc();
  }
}

class ExperienceEventDraft {
  const ExperienceEventDraft({
    required this.id,
    required this.title,
    required this.description,
    required this.order,
    required this.timestamp,
  });

  factory ExperienceEventDraft.fromJson(Map<String, dynamic> json) {
    return ExperienceEventDraft(
      id: stringFromJson(json['id']).isEmpty
          ? 'native-event-${DateTime.now().microsecondsSinceEpoch}'
          : stringFromJson(json['id']),
      title: stringFromJson(json['title']).isEmpty
          ? 'Evento'
          : stringFromJson(json['title']),
      description: stringFromJson(json['description']),
      order: intFromJson(json['order']),
      timestamp: parseNativeDate(json['timestamp']) ?? DateTime.now().toUtc(),
    );
  }

  final String id;
  final String title;
  final String description;
  final int order;
  final DateTime timestamp;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'description': description,
      'order': order,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}

class SyncBadge extends StatelessWidget {
  const SyncBadge({required this.state, super.key});

  final SyncState state;

  @override
  Widget build(BuildContext context) {
    final label = switch (state) {
      SyncState.ready => 'Listo',
      SyncState.syncing => 'Sincronizando',
      SyncState.synced => 'Sincronizado',
      SyncState.needsAttention => 'Revisar',
    };
    final color = switch (state) {
      SyncState.ready => Colors.blueGrey,
      SyncState.syncing => Colors.orange,
      SyncState.synced => Colors.green,
      SyncState.needsAttention => Colors.red,
    };

    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Text(label,
            style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

enum SyncState { ready, syncing, synced, needsAttention }

enum CaptureSyncStatus {
  queued('Pendiente', Icons.pending_actions_outlined),
  uploading('Subiendo', Icons.cloud_upload_outlined),
  synced('Listo', Icons.cloud_done_outlined),
  failed('Error', Icons.error_outline),
  needsSession('Sesión', Icons.lock_outline),
  needsNativePlugin('Nativo', Icons.extension_outlined);

  const CaptureSyncStatus(this.label, this.icon);

  final String label;
  final IconData icon;
}

CaptureSyncStatus captureStatusFromJson(Object? value) {
  final name = stringFromJson(value);
  return CaptureSyncStatus.values.firstWhere(
    (status) => status.name == name,
    orElse: () => CaptureSyncStatus.queued,
  );
}

DateTime? parseNativeDate(Object? value) {
  if (value == null) return null;
  return DateTime.tryParse(value.toString())?.toUtc();
}

String stringFromJson(Object? value) {
  if (value == null) return '';
  return value.toString();
}

int intFromJson(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

double doubleFromJson(Object? value) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

List<String> listOfStringsFromJson(Object? value) {
  if (value is! List) return const [];
  return value.map((item) => item.toString()).toList();
}

Map<String, dynamic> mapFromJson(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

List<Map<String, dynamic>> listOfMapsFromJson(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();
}

String shorten(String value, [int max = 180]) {
  if (value.length <= max) return value;
  return '${value.substring(0, max)}...';
}

String inferMimeType(String name, String sourceType) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (sourceType == 'image') return 'image/jpeg';
  if (sourceType == 'video') return 'video/mp4';
  if (sourceType == 'audio') return 'audio/mp4';
  if (sourceType == 'biometric') return 'text/csv';
  if (sourceType == 'document') return 'application/pdf';
  if (sourceType == 'zip') return 'application/zip';
  return 'application/octet-stream';
}

String classifyExternalFileSource(String name) {
  final lower = name.toLowerCase();
  if (RegExp(r'\.(jpg|jpeg|png|webp|gif|heic|heif)$').hasMatch(lower)) {
    return 'image';
  }
  if (RegExp(r'\.(mp4|mov|m4v|webm|hevc)$').hasMatch(lower)) {
    return 'video';
  }
  if (RegExp(r'\.(mp3|m4a|wav|aac|ogg)$').hasMatch(lower)) {
    return 'audio';
  }
  if (RegExp(r'\.(csv|json)$').hasMatch(lower)) {
    return 'biometric';
  }
  if (lower.endsWith('.zip')) return 'zip';
  return 'document';
}

String externalFileEventTitle(String sourceType, int order) {
  final label = switch (sourceType) {
    'image' => 'Imagen',
    'video' => 'Video',
    'audio' => 'Audio',
    'biometric' => 'Datos biometricos',
    'zip' => 'Paquete ZIP',
    _ => 'Documento',
  };
  return '$label $order';
}

String stripNativeWakePhrase(String text) {
  return text
      .trim()
      .replaceFirst(
        RegExp(r'^(hola|hello|hi|hey|oye)\s+(v|ve|vee)\b[,\s:;-]*',
            caseSensitive: false),
        '',
      )
      .replaceFirst(
        RegExp(r'^(v|ve|vee)\b[,\s:;-]*', caseSensitive: false),
        '',
      )
      .trim();
}

String cleanNativeNoteText(String text) {
  final cleaned = text
      .replaceFirst(
        RegExp(
          r'^(toma nota|tomar nota|anota|nota que|guarda esto|guardar esto|take note|note that|save this)\s*(que|:)?\s*',
          caseSensitive: false,
        ),
        '',
      )
      .trim();
  return cleaned.isEmpty ? text.trim() : cleaned;
}

String cleanNativeExperienceTitle(String text) {
  final cleaned = text
      .replaceFirst(
        RegExp(
          r'^(empieza|inicia|iniciar|abre|crear|crea|graba|start|begin|create|new)\s*(una|un|nueva|nuevo)?\s*(experiencia|experience)?\s*(que|sobre|:)?\s*',
          caseSensitive: false,
        ),
        '',
      )
      .trim();
  return cleaned.isEmpty ? 'Experiencia desde Vibeapp' : sentenceCase(cleaned);
}

AgendaEventDraft buildNativeAgendaFromCommand(String command) {
  final now = DateTime.now();
  final startAt = parseNativeCommandDateTime(command, now);
  final title = buildNativeAgendaTitle(command);
  return AgendaEventDraft(
    title: title,
    description: 'Creado desde comando rápido: ${command.trim()}',
    location: extractNativeAgendaLocation(command),
    startAt: startAt.toUtc(),
    endAt: startAt.add(const Duration(hours: 1)).toUtc(),
  );
}

DateTime parseNativeCommandDateTime(String command, DateTime now) {
  final lower = command.toLowerCase();
  var date = DateTime(now.year, now.month, now.day);
  if (lower.contains('mañana') || lower.contains('manana')) {
    date = date.add(const Duration(days: 1));
  }

  final match = RegExp(
    r'(?:a\s+las|at)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?',
    caseSensitive: false,
  ).firstMatch(lower);
  if (match == null) {
    return now.add(const Duration(hours: 1));
  }

  var hour = int.tryParse(match.group(1) ?? '') ?? now.hour;
  final minute = int.tryParse(match.group(2) ?? '') ?? 0;
  final meridiem = (match.group(3) ?? '').replaceAll('.', '').toLowerCase();
  if (meridiem == 'pm' && hour < 12) hour += 12;
  if (meridiem == 'am' && hour == 12) hour = 0;
  if (meridiem.isEmpty && hour < 7 && lower.contains('tarde')) hour += 12;
  final parsed = DateTime(date.year, date.month, date.day, hour, minute);
  return parsed.isBefore(now) ? parsed.add(const Duration(days: 1)) : parsed;
}

String buildNativeAgendaTitle(String command) {
  var title = command
      .replaceAll(
        RegExp(
          r'\b(pon en mi agenda|agrega a mi agenda|agenda|calendario|recordarme|recuérdame|recuerdame|schedule|calendar|remind me|remind)\b',
          caseSensitive: false,
        ),
        '',
      )
      .replaceAll(
        RegExp(
          r'\b(hoy|mañana|manana|today|tomorrow|a las|at|am|pm|a\.m\.|p\.m\.)\b',
          caseSensitive: false,
        ),
        '',
      )
      .replaceAll(RegExp(r'\d{1,2}(:\d{2})?'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  title = title.replaceFirst(
    RegExp(r'^(que|tengo|tener|un|una)\s+', caseSensitive: false),
    '',
  );
  return title.isEmpty ? 'Recordatorio desde Vibeapp' : sentenceCase(title);
}

String extractNativeAgendaLocation(String command) {
  final match = RegExp(
    r'\b(?:en|at)\s+(.+?)(?:\s+(?:con|hoy|mañana|manana|today|tomorrow|a las|at)\b|$)',
    caseSensitive: false,
  ).firstMatch(command);
  final value = match?.group(1)?.trim() ?? '';
  if (value.length < 3 || RegExp(r'^\d').hasMatch(value)) return '';
  return sentenceCase(value);
}

String sentenceCase(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return '';
  return '${trimmed[0].toUpperCase()}${trimmed.substring(1)}';
}

String formatClock(DateTime value) {
  final local = value.toLocal();
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}

String formatDateLabel(DateTime value) {
  final local = value.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  return '$day/$month/${local.year}';
}
