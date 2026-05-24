import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

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
  final TextEditingController _noteController = TextEditingController();
  final TextEditingController _apiUrlController = TextEditingController(
      text: 'https://experience-hub-web-production.up.railway.app');
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final List<CaptureQueueItem> _queue = [];
  SyncState _syncState = SyncState.ready;
  String _accessToken = '';
  String _signedInEmail = '';

  @override
  void dispose() {
    _noteController.dispose();
    _apiUrlController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
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
    final item = CaptureQueueItem.text(text);
    setState(() {
      _queue.insert(0, item);
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
          item.error = 'Falta token de sesion para enviar a Supabase.';
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
      final result = await client.upsertTextExperience(item);
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
      _queue.insert(0, CaptureQueueItem.nativeAction(action));
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content: Text(
              '${action.label}: contrato definido; falta conectar plugin nativo.')),
    );
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
            CaptureActionGrid(onAction: _registerNativeAction),
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
  const CaptureActionGrid({required this.onAction, super.key});

  final ValueChanged<NativeCaptureAction> onAction;

  @override
  Widget build(BuildContext context) {
    final actions = [
      const NativeCaptureAction(Icons.mic_none, 'Audio',
          'Grabar, transcribir y vincular a una experiencia abierta.'),
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
            onPressed: () => onAction(action),
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

  Future<SyncResult> upsertTextExperience(CaptureQueueItem item) async {
    try {
      final uri = Uri.parse(settings.apiBaseUrl).resolve('/api/experiences');
      final request =
          await HttpClient().postUrl(uri).timeout(const Duration(seconds: 10));
      request.headers.contentType = ContentType.json;
      request.headers.set(
          HttpHeaders.authorizationHeader, 'Bearer ${settings.accessToken}');
      request.write(jsonEncode(item.toExperiencePayload()));
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
  const SyncResult._({required this.ok, required this.message, this.remoteId});

  factory SyncResult.success(String remoteId) =>
      SyncResult._(ok: true, message: 'Sincronizado', remoteId: remoteId);
  factory SyncResult.failure(String message) =>
      SyncResult._(ok: false, message: message);

  final bool ok;
  final String message;
  final String? remoteId;
}

class NativeCaptureAction {
  const NativeCaptureAction(this.icon, this.label, this.detail);

  final IconData icon;
  final String label;
  final String detail;
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

  bool get canSync => sourceType == 'text';

  String get subtitle {
    final reason = error.isEmpty ? detail : '$detail\n$error';
    return reason;
  }

  Map<String, dynamic> toExperiencePayload() {
    final iso = createdAt.toIso8601String();
    return {
      'id': id,
      'title': detail.length > 48 ? '${detail.substring(0, 48)}...' : detail,
      'category': 'Dato del usuario',
      'timestamp': iso,
      'duration': 0,
      'mood': 'Calmo',
      'energy': 5,
      'location': 'Captura móvil',
      'people': 'Usuario',
      'objective': 'Captura rápida desde Vibeapp',
      'notes': detail,
      'locale': 'es',
      'metadata': {
        'sourceType': 'vibeapp-native',
        'sourceDevice': Platform.operatingSystem,
        'sourceEventId': id,
        'capturedAt': iso,
        'syncContract': 'vibeapp-text-v1',
      },
      'events': [
        {
          'id': '$id-event-1',
          'title': 'Nota rápida',
          'description': detail,
          'order': 1,
          'timestamp': iso,
        }
      ],
      'attachments': [],
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
