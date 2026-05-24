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
    setState(() => _syncState = SyncState.synced);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Nota guardada para sincronización.')),
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
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text('Registra una nota al paso. La sincronización real con Supabase se conectará en el siguiente incremento.'),
            const SizedBox(height: 20),
            TextField(
              controller: _noteController,
              minLines: 5,
              maxLines: 8,
              decoration: const InputDecoration(
                labelText: 'Nota',
                hintText: 'Ejemplo: V, toma nota que estoy llegando al museo...',
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
            const CaptureActionGrid(),
          ],
        ),
      ),
    );
  }
}

class CaptureActionGrid extends StatelessWidget {
  const CaptureActionGrid({super.key});

  @override
  Widget build(BuildContext context) {
    final actions = [
      (Icons.mic_none, 'Audio'),
      (Icons.photo_camera_outlined, 'Foto'),
      (Icons.videocam_outlined, 'Video'),
      (Icons.event_available_outlined, 'Agenda'),
    ];

    return GridView.count(
      crossAxisCount: 2,
      childAspectRatio: 2.5,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      children: [
        for (final action in actions)
          OutlinedButton.icon(
            onPressed: () {},
            icon: Icon(action.$1),
            label: Text(action.$2),
          ),
      ],
    );
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
        child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

enum SyncState { ready, syncing, synced, needsAttention }
