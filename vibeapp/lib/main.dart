import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
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
  SyncState _syncState = SyncState.ready;
  String _accessToken = '';
  String _signedInEmail = '';
  ActiveExperienceSession? _activeSession;
  bool _isRecordingAudio = false;
  String _audioRecordingPath = '';

  @override
  void dispose() {
    _noteController.dispose();
    _apiUrlController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _sessionTitleController.dispose();
    unawaited(_audioRecorder.dispose());
    super.dispose();
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

  Future<void> _saveDraft() async {
    final text = _noteController.text.trim();
    if (text.isEmpty) return;
    final session = _activeSession;
    setState(() {
      if (session == null) {
        _queue.insert(0, CaptureQueueItem.text(text));
      } else {
        session.addTextEvent(text);
        _upsertSessionQueueItem(session);
      }
      _noteController.clear();
      _syncState = SyncState.syncing;
    });
    await _syncPendingQueue(showSnackBar: true);
  }

  Future<void> _syncPendingQueue({bool showSnackBar = false}) async {
    final settings = SyncSettings(
      apiBaseUrl: _apiUrlController.text.trim(),
      accessToken: _accessToken,
    );
    final pending = _queue
        .where(
            (item) => item.canSync && item.status != CaptureSyncStatus.synced)
        .toList();

    if (pending.isEmpty) {
      setState(() => _syncState = SyncState.ready);
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
      return;
    }

    final client = ExperienceSyncClient(settings);
    var failures = 0;
    for (final item in pending) {
      setState(() {
        item.status = CaptureSyncStatus.uploading;
        item.error = '';
        _syncState = SyncState.syncing;
      });
      final result = await client.syncItem(item);
      if (!mounted) return;
      setState(() {
        if (result.ok) {
          item.status = CaptureSyncStatus.synced;
          item.remoteId = result.remoteId;
        } else {
          failures += 1;
          item.status = CaptureSyncStatus.failed;
          item.error = result.message;
        }
      });
    }

    if (!mounted) return;
    setState(() => _syncState =
        failures == 0 ? SyncState.synced : SyncState.needsAttention);
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

  @override
  Widget build(BuildContext context) {
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
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _saveDraft,
              icon: const Icon(Icons.cloud_upload_outlined),
              label: const Text('Guardar captura'),
            ),
            const SizedBox(height: 24),
            ExperienceSessionCard(
              titleController: _sessionTitleController,
              session: _activeSession,
              onStart: _startExperienceSession,
              onClose: _closeExperienceSession,
            ),
            const SizedBox(height: 16),
            const NativeFlowSummary(),
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
              isRecordingAudio: _isRecordingAudio,
            ),
            const SizedBox(height: 16),
            CaptureQueuePanel(queue: _queue),
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
  final Future<void> Function({bool showSnackBar}) onRetry;

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
                'Primer contrato real: entra con el mismo usuario de Vibe PWA y reintenta la cola sin copiar tokens manualmente.'),
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
                  onPressed: () => onRetry(showSnackBar: true),
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
    required this.isRecordingAudio,
    super.key,
  });

  final ValueChanged<NativeCaptureAction> onAction;
  final Future<void> Function() onAudio;
  final Future<void> Function() onPhoto;
  final Future<void> Function() onVideo;
  final Future<void> Function() onAgenda;
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
  const CaptureQueuePanel({required this.queue, super.key});

  final List<CaptureQueueItem> queue;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Cola local',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            if (queue.isEmpty)
              const Text(
                  'Sin capturas pendientes. Cuando guardes una nota o acciones un medio, aparecerá aquí antes de sincronizar.')
            else
              for (final item in queue.take(8))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(item.status.icon),
                  title: Text(item.title),
                  subtitle: Text(item.subtitle),
                  trailing: Text(item.status.label),
                ),
          ],
        ),
      ),
    );
  }
}

class ExperienceSyncClient {
  ExperienceSyncClient(this.settings);

  final SyncSettings settings;

  Future<SyncResult> syncItem(CaptureQueueItem item) {
    final agendaEvent = item.agendaEvent;
    if (agendaEvent != null) {
      return upsertAgendaEvent(agendaEvent);
    }
    return upsertExperience(item);
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
      final request =
          await HttpClient().postUrl(uri).timeout(const Duration(seconds: 10));
      request.headers.contentType = ContentType.json;
      request.headers.set(
          HttpHeaders.authorizationHeader, 'Bearer ${settings.accessToken}');
      request.write(jsonEncode(item.toExperiencePayload(attachments)));
      final response =
          await request.close().timeout(const Duration(seconds: 20));
      final responseText = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return SyncResult.failure(
            'HTTP ${response.statusCode}: ${shorten(responseText)}');
      }
      final decoded = jsonDecode(responseText) as Map<String, dynamic>;
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

  Future<SyncResult> upsertAgendaEvent(AgendaEventDraft event) async {
    try {
      final uri = Uri.parse(settings.apiBaseUrl).resolve('/api/agenda');
      final request =
          await HttpClient().postUrl(uri).timeout(const Duration(seconds: 10));
      request.headers.contentType = ContentType.json;
      request.headers.set(
          HttpHeaders.authorizationHeader, 'Bearer ${settings.accessToken}');
      request.write(jsonEncode(event.toJson()));
      final response =
          await request.close().timeout(const Duration(seconds: 20));
      final responseText = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return SyncResult.failure(
            'Agenda HTTP ${response.statusCode}: ${shorten(responseText)}');
      }
      final decoded = jsonDecode(responseText) as Map<String, dynamic>;
      return SyncResult.success((decoded['id'] ?? event.id).toString());
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

  Future<SyncResult> uploadMediaAttachment(
      NativeAttachmentDraft attachment) async {
    try {
      final file = File(attachment.filePath);
      final bytes = await file.readAsBytes();
      final boundary = '----vibeapp-${DateTime.now().microsecondsSinceEpoch}';
      final uri = Uri.parse(settings.apiBaseUrl).resolve('/api/media');
      final request =
          await HttpClient().postUrl(uri).timeout(const Duration(seconds: 10));
      request.headers.contentType = ContentType(
        'multipart',
        'form-data',
        parameters: {'boundary': boundary},
      );
      request.headers.set(
          HttpHeaders.authorizationHeader, 'Bearer ${settings.accessToken}');
      final metadata = jsonEncode(attachment.toMediaMetadata(bytes.length));
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
      final response =
          await request.close().timeout(const Duration(seconds: 45));
      final responseText = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return SyncResult.failure(
            'Media HTTP ${response.statusCode}: ${shorten(responseText)}');
      }
      final decoded = jsonDecode(responseText) as Map<String, dynamic>;
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
  })  : id = 'native-agenda-${DateTime.now().microsecondsSinceEpoch}',
        createdAt = DateTime.now().toUtc();

  final String id;
  final String title;
  final String description;
  final String location;
  final DateTime startAt;
  final DateTime endAt;
  final DateTime createdAt;

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
        'payloadType': 'calendar',
      },
    };
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

  final String id;
  final String filePath;
  final String name;
  final String mimeType;
  final int size;
  final String sourceType;
  final DateTime createdAt;
  final String eventId;
  final String eventTitle;
  final int eventOrder;

  String get kind => sourceType == 'image' ? 'image' : sourceType;

  String get displayLabel {
    if (sourceType == 'video') return 'Video';
    if (sourceType == 'audio') return 'Audio';
    return 'Foto';
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
      'createdAt': createdAt.toIso8601String(),
      'metadata': {
        'source': 'vibeapp-native',
        'capturedAt': createdAt.toIso8601String(),
        'eventId': eventId,
        'eventTitle': eventTitle,
        'eventOrder': eventOrder,
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
      'previewText': '$displayLabel capturado desde Vibeapp.',
      'analysisText':
          '$displayLabel capturado desde la app nativa y sincronizado con Storage privado.',
      'metadata': {
        ...(remote?['metadata'] is Map<String, dynamic>
            ? remote!['metadata'] as Map<String, dynamic>
            : <String, dynamic>{}),
        'source': 'vibeapp-native',
        'capturedAt': createdAt.toIso8601String(),
        'linkedEventId': eventId,
        'linkedEventTitle': eventTitle,
        'eventOrder': eventOrder,
      },
    };
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
    this.closedAt,
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
  final DateTime? closedAt;

  bool get canSync =>
      sourceType == 'text' ||
      sourceType == 'experience-session' ||
      agendaEvent != null ||
      attachments.isNotEmpty;

  String get subtitle {
    final reason = error.isEmpty ? detail : '$detail\n$error';
    return reason;
  }

  Map<String, dynamic> toExperiencePayload(
      [List<Map<String, dynamic>>? uploadedAttachments]) {
    final iso = createdAt.toIso8601String();
    final eventList = events.isEmpty
        ? [
            ExperienceEventDraft(
              id: '$id-event-1',
              title: 'Nota rápida',
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
      'title': sourceType == 'experience-session'
          ? title
          : detail.length > 48
              ? '${detail.substring(0, 48)}...'
              : detail,
      'category': 'Dato del usuario',
      'timestamp': iso,
      'duration': duration,
      'mood': 'Calmo',
      'energy': 5,
      'location': 'Captura móvil',
      'people': 'Usuario',
      'objective': sourceType == 'experience-session'
          ? 'Experiencia con eventos desde Vibeapp'
          : 'Captura rápida desde Vibeapp',
      'notes': detail,
      'locale': 'es',
      'metadata': {
        'sourceType': 'vibeapp-native',
        'sourceDevice': Platform.operatingSystem,
        'sourceEventId': id,
        'capturedAt': iso,
        'closedAt': closedAt?.toIso8601String(),
        'syncContract': sourceType == 'experience-session'
            ? 'vibeapp-session-v1'
            : 'vibeapp-text-v1',
      },
      'events': eventList.map((event) => event.toJson()).toList(),
      'attachments': uploadedAttachments ??
          attachments.map((item) => item.toExperienceAttachment()).toList(),
    };
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
  if (sourceType == 'image') return 'image/jpeg';
  if (sourceType == 'video') return 'video/mp4';
  if (sourceType == 'audio') return 'audio/mp4';
  return 'application/octet-stream';
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
