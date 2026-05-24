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
  final List<CaptureQueueItem> _queue = [];
  SyncState _syncState = SyncState.ready;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _saveDraft() async {
    final text = _noteController.text.trim();
    if (text.isEmpty) return;
    setState(() => _syncState = SyncState.syncing);

    // This first skeleton keeps the contract visible without wiring secrets in the app.
    // The next increment will replace this delay with Supabase Auth + queue + upload.
    await Future<void>.delayed(const Duration(milliseconds: 450));

    if (!mounted) return;
    setState(() {
      _queue.insert(0, CaptureQueueItem.text(text));
      _syncState = SyncState.synced;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Nota guardada para sincronización.')),
    );
  }

  void _registerNativeAction(NativeCaptureAction action) {
    setState(() {
      _syncState = SyncState.needsAttention;
      _queue.insert(0, CaptureQueueItem.pending(action.label, action.detail));
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
                'Registra una nota al paso. La sincronización real con Supabase se conectará en el siguiente incremento.'),
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
              'La app nativa se encargará de capturar permisos reales del dispositivo, guardar en cola local y sincronizar con Supabase para que la PWA lo vea sin pasos manuales.',
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
              for (final item in queue.take(5))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(item.synced
                      ? Icons.cloud_done_outlined
                      : Icons.pending_actions_outlined),
                  title: Text(item.title),
                  subtitle: Text(item.detail),
                  trailing: Text(item.synced ? 'Listo' : 'Pendiente'),
                ),
          ],
        ),
      ),
    );
  }
}

class NativeCaptureAction {
  const NativeCaptureAction(this.icon, this.label, this.detail);

  final IconData icon;
  final String label;
  final String detail;
}

class CaptureQueueItem {
  const CaptureQueueItem({
    required this.title,
    required this.detail,
    required this.synced,
  });

  factory CaptureQueueItem.text(String text) => CaptureQueueItem(
        title: 'Texto',
        detail: text,
        synced: true,
      );

  factory CaptureQueueItem.pending(String title, String detail) =>
      CaptureQueueItem(
        title: title,
        detail: detail,
        synced: false,
      );

  final String title;
  final String detail;
  final bool synced;
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
