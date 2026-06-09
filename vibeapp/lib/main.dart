import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:health/health.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

const String vibeappBuildLabel = 'Vibeapp 561';
const String vibeappReleaseLabel = '20260608-vibeapp-darkmode-561';

/// Notificador global del idioma de la app. Es la unica fuente de verdad para
/// el idioma activo: al cambiarlo se reconstruye todo el arbol (incluido el
/// `locale` de [MaterialApp]) sin necesidad de Provider/InheritedWidget.
final ValueNotifier<AppLanguage> appLanguageNotifier =
    ValueNotifier<AppLanguage>(AppLanguage.spanish);

/// Modo de tema activo (sistema / claro / oscuro). [VibeApp] lo escucha y, junto
/// con el brillo del sistema, fija `VibeTokens.dark` antes de construir el tema.
final ValueNotifier<ThemeMode> themeModeNotifier =
    ValueNotifier<ThemeMode>(ThemeMode.system);

/// Acceso global al catalogo de cadenas del idioma activo. Como [VibeApp]
/// envuelve [MaterialApp] en un ValueListenableBuilder sobre
/// [appLanguageNotifier], todo el arbol se reconstruye al cambiar el idioma, de
/// modo que los widgets sin estado pueden leer `tr` directamente en su build sin
/// necesidad de recibir AppStrings por constructor.
AppStrings get tr => AppStrings(appLanguageNotifier.value);

/// Clave de IA opcional inyectada en tiempo de compilacion con
/// `--dart-define=CLAUDE_API_KEY=...`. No se escribe en el codigo fuente ni en
/// los handoffs; sirve para precargar la clave en el build sin que el usuario la
/// pegue en el dispositivo. Si esta vacia, se usa la clave que el usuario guarde
/// en Ajustes.
const String kBuildClaudeKey =
    String.fromEnvironment('CLAUDE_API_KEY', defaultValue: '');

/// Token personal de la Oura Cloud API v2, inyectado en el build con
/// --dart-define=OURA_TOKEN=...  (puente; igual patron que la clave de Claude).
/// Da datos del anillo Oura (sueno, readiness, HRV) que NO llegan por HealthKit.
const String kBuildOuraToken =
    String.fromEnvironment('OURA_TOKEN', defaultValue: '');

/// Clave para la API de transcripcion (OpenAI Whisper por defecto), inyectada
/// con --dart-define=TRANSCRIBE_KEY=...  o pegada en Ajustes. Transcribe notas
/// de audio; luego V puede resumirlas con Claude. NO toca el backend de Vibe.
const String kBuildTranscribeKey =
    String.fromEnvironment('TRANSCRIBE_KEY', defaultValue: '');

/// Almacen seguro (Keychain en iOS / Keystore en Android). Persiste el login y
/// los ajustes incluso si se reinstala la app. NO toca el backend ni los
/// payloads: solo cambia DONDE se guarda el token localmente. Tolerante a fallos.
class VibeSecureStore {
  static const sessionKey = 'vibeapp-session';
  static const settingsKey = 'vibeapp-assistant-settings';

  const VibeSecureStore();

  FlutterSecureStorage get _s => const FlutterSecureStorage();

  Future<String?> read(String key) async {
    try {
      return await _s.read(key: key);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(String key, String value) async {
    try {
      await _s.write(key: key, value: value);
    } catch (_) {}
  }

  Future<void> delete(String key) async {
    try {
      await _s.delete(key: key);
    } catch (_) {}
  }
}

const VibeSecureStore kSecureStore = VibeSecureStore();

void main() {
  runApp(const VibeApp());
}

class VibeApp extends StatefulWidget {
  const VibeApp({super.key});

  @override
  State<VibeApp> createState() => _VibeAppState();
}

class _VibeAppState extends State<VibeApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() {
    // El sistema cambio de claro/oscuro: si estamos en modo "sistema", rebuild.
    if (themeModeNotifier.value == ThemeMode.system && mounted) {
      setState(() {});
    }
  }

  bool _resolveDark(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.dark:
        return true;
      case ThemeMode.light:
        return false;
      case ThemeMode.system:
        return WidgetsBinding.instance.platformDispatcher.platformBrightness ==
            Brightness.dark;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeModeNotifier,
      builder: (context, mode, __) {
        // Fija el brillo global ANTES de construir el tema y el arbol.
        VibeTokens.dark = _resolveDark(mode);
        return ValueListenableBuilder<AppLanguage>(
          valueListenable: appLanguageNotifier,
          builder: (context, language, _) {
            return MaterialApp(
              debugShowCheckedModeBanner: false,
              title: 'Vibeapp',
              theme: VibeTokens.buildTheme(),
              locale: language.toLocale(),
              supportedLocales: const [
                Locale('es'),
                Locale('en'),
                Locale('fr'),
              ],
              localizationsDelegates: const [
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: const QuickCaptureScreen(),
            );
          },
        );
      },
    );
  }
}

// ===================================================================
// ===== DESIGN TOKENS ================================================
// ===================================================================

/// Tokens de diseno centralizados (color, espaciado, radio, sombra,
/// tipografia). Antes estaban dispersos en literales inline por todo el
/// archivo; ahora viven en un solo lugar para una UI consistente.
abstract final class VibeTokens {
  // Brillo activo. Lo fija [VibeApp] segun el modo (sistema/claro/oscuro) antes
  // de construir el tema. Los colores neutros (ink/surface/panel/...) se
  // resuelven en funcion de esto; los de marca son fijos.
  static bool _dark = false;
  static bool get isDark => _dark;
  static set dark(bool v) => _dark = v;

  static const Color seed = Color(0xFF0D7C66);
  static const Color brand = Color(0xFF0D7C66);
  static const Color brandDark = Color(0xFF0A5C4C);
  static const Color accent = Color(0xFFFFD84D);
  static const Color accentInk = Color(0xFF6B5200);
  static const Color danger = Color(0xFFD65A31);
  static const Color positive = Color(0xFF0D7C66);

  // Neutros theme-aware (claro / oscuro).
  static Color get ink =>
      _dark ? const Color(0xFFE8EDEB) : const Color(0xFF14201D);
  static Color get surface =>
      _dark ? const Color(0xFF0E1513) : const Color(0xFFF6F8F7);
  static Color get panel =>
      _dark ? const Color(0xFF18211E) : Colors.white;
  static Color get panelGrey =>
      _dark ? const Color(0xFF222C29) : const Color(0xFFEFF2F1);
  static Color get border =>
      _dark ? const Color(0xFF2C3633) : const Color(0xFFE0E5E3);
  static Color get muted =>
      _dark ? const Color(0xFF9AA8A3) : const Color(0xFF6A7B76);

  static const double space2 = 2;
  static const double space4 = 4;
  static const double space8 = 8;
  static const double space12 = 12;
  static const double space16 = 16;
  static const double space20 = 20;
  static const double space24 = 24;
  static const double space32 = 32;

  static const double rSm = 16;
  static const double rMd = 22;
  static const double rLg = 28;
  static const double rPill = 999;

  static List<BoxShadow> get softShadow => const [
        BoxShadow(
          color: Color(0x14000000),
          blurRadius: 18,
          offset: Offset(0, 8),
        ),
      ];

  static ThemeData buildTheme() {
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: _dark ? Brightness.dark : Brightness.light,
    ).copyWith(
      surface: panel,
      surfaceContainerLowest: panel,
      surfaceContainerLow: surface,
      onSurface: ink,
    );
    final base = ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      scaffoldBackgroundColor: surface,
      visualDensity: VisualDensity.standard,
      splashFactory: InkSparkle.splashFactory,
    );
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(rMd),
    );
    return base.copyWith(
      textTheme: base.textTheme.copyWith(
        headlineSmall: base.textTheme.headlineSmall
            ?.copyWith(fontWeight: FontWeight.w800, color: ink),
        titleLarge: base.textTheme.titleLarge
            ?.copyWith(fontWeight: FontWeight.w800, color: ink),
        titleMedium: base.textTheme.titleMedium
            ?.copyWith(fontWeight: FontWeight.w700, color: ink),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.35),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: panel,
        foregroundColor: ink,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: ink,
          fontSize: 18,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: panel,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rLg),
          side: BorderSide(color: border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          shape: shape,
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          shape: shape,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: brand,
          side: BorderSide(color: border),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          shape: shape,
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: brand),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rSm),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rSm),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rSm),
          borderSide: const BorderSide(color: brand, width: 1.6),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: panelGrey,
        side: BorderSide.none,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rPill),
        ),
        labelStyle: TextStyle(
            fontWeight: FontWeight.w600, color: ink, fontSize: 12.5),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(rSm)),
          ),
          backgroundColor: WidgetStateProperty.resolveWith((states) =>
              states.contains(WidgetState.selected) ? brand : panel),
          foregroundColor: WidgetStateProperty.resolveWith((states) =>
              states.contains(WidgetState.selected) ? Colors.white : ink),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: ink,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rSm),
        ),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1),
    );
  }
}

// ===================================================================
// ===== L10N (localizacion ES/EN/FR de toda la interfaz) ============
// ===================================================================

/// Idioma activo de toda la aplicacion. El selector ES/EN/FR cambia este
/// valor y, con el, la interfaz completa.
enum AppLanguage {
  spanish('es', 'Español', 'Español'),
  english('en', 'English', 'Inglés'),
  french('fr', 'Français', 'Francés');

  const AppLanguage(this.code, this.nativeName, this.spanishName);

  final String code;
  final String nativeName;
  final String spanishName;

  Locale toLocale() => Locale(code);

  /// Locale del reconocedor de voz, derivado del idioma de la app.
  VibeVoiceLanguage get voiceLanguage => switch (this) {
        AppLanguage.spanish => VibeVoiceLanguage.spanish,
        AppLanguage.english => VibeVoiceLanguage.english,
        AppLanguage.french => VibeVoiceLanguage.french,
      };

  static AppLanguage fromCode(String? code) {
    return AppLanguage.values.firstWhere(
      (l) => l.code == code,
      orElse: () => AppLanguage.spanish,
    );
  }
}

/// Catalogo de cadenas de la interfaz. Un getter por clave para que el
/// analizador detecte omisiones; las cadenas parametrizadas son metodos.
/// Copy revisado gramaticalmente en los tres idiomas (con acentos correctos).
class AppStrings {
  const AppStrings(this.lang);
  final AppLanguage lang;

  String _s(String es, String en, String fr) => switch (lang) {
        AppLanguage.spanish => es,
        AppLanguage.english => en,
        AppLanguage.french => fr,
      };

  // --- Navegacion (pestanas) ---
  String get homeTab => _s('Inicio', 'Home', 'Accueil');
  String get captureTab => _s('Capturar', 'Capture', 'Capturer');
  String get savedTab => _s('Guardados', 'Saved', 'Enregistres');
  String get assetsTab => _s('Archivos', 'Files', 'Fichiers');
  String get agendaTab => _s('Agenda', 'Agenda', 'Agenda');
  String get statusTab => _s('Estado', 'Status', 'Etat');
  String get accountTab => _s('Cuenta', 'Account', 'Compte');

  // --- Encabezados de seccion ---
  String get captureTitle => _s('Capturar', 'Capture', 'Capturer');
  String get captureSubtitle => _s(
        'Guarda lo importante ahora; podrás sincronizarlo después.',
        'Save what matters now; you can sync it later.',
        'Enregistrez l\'essentiel maintenant; vous pourrez synchroniser plus tard.',
      );
  String get statusTitle => _s('Estado y sincronización', 'Status and sync',
      'État et synchronisation');
  String get statusSubtitle => _s(
        'Revisa la cola, reintenta envíos y limpia pruebas locales.',
        'Check the queue, retry uploads and clear local tests.',
        'Vérifiez la file, relancez les envois et nettoyez les tests locaux.',
      );
  String get accountTitle => _s('Cuenta y ajustes', 'Account and settings',
      'Compte et paramètres');
  String get accountSubtitle => _s(
        'Gestiona tu sesión, el asistente V y las preferencias.',
        'Manage your session, the V assistant and your preferences.',
        'Gérez votre session, l\'assistant V et vos préférences.',
      );

  // --- Acciones comunes ---
  String get save => _s('Guardar', 'Save', 'Enregistrer');
  String get saveAndContinue => _s('Guardar y continuar', 'Save and continue',
      'Enregistrer et continuer');
  String get retry => _s('Reintentar', 'Retry', 'Réessayer');
  String get cancel => _s('Cancelar', 'Cancel', 'Annuler');
  String get close => _s('Cerrar', 'Close', 'Fermer');
  String get done => _s('Listo', 'Done', 'Terminé');
  String get freeLabel => _s('Libre', 'Free', 'Libre');
  String get openLabel => _s('Abierta', 'Open', 'Ouverte');

  // --- Home header ---
  String get appTagline => _s(
        'Captura lo importante ahora. Vibe lo organiza después.',
        'Capture what matters now. Vibe organizes it later.',
        'Capturez l\'essentiel maintenant. Vibe l\'organise ensuite.',
      );
  String experienceOpen(String title) => _s(
        'Experiencia abierta: $title',
        'Open experience: $title',
        'Expérience ouverte: $title',
      );
  String get headerSignInPrompt => _s(
        'Entra para guardar en todos tus dispositivos',
        'Sign in to save across all your devices',
        'Connectez-vous pour enregistrer sur tous vos appareils',
      );
  String headerPending(int n) => _s(
        '$n captura(s) pendiente(s) por guardar',
        '$n capture(s) pending to save',
        '$n capture(s) en attente d\'enregistrement',
      );
  String get headerSyncing =>
      _s('Guardando tus cambios...', 'Saving your changes...',
          'Enregistrement de vos modifications...');
  String get headerAttention => _s(
        'Revisa la conexión o vuelve a intentar',
        'Check the connection or try again',
        'Vérifiez la connexion ou réessayez',
      );
  String get headerAllSynced => _s('Todo guardado y sincronizado',
      'Everything saved and synced', 'Tout est enregistré et synchronisé');
  String get pendingMetric => _s('Pendientes', 'Pending', 'En attente');
  String get sessionMetric => _s('Sesión', 'Session', 'Session');

  // --- Home: segmentos y panel de acciones ---
  String get quickActionsTitle =>
      _s('Acciones rápidas', 'Quick actions', 'Actions rapides');
  String get newNote => _s('Nueva nota', 'New note', 'Nouvelle note');
  String get recordAudio => _s('Grabar audio', 'Record audio',
      'Enregistrer audio');
  String get stopAudio => _s('Detener audio', 'Stop audio', 'Arreter audio');
  String get takePhoto => _s('Tomar foto', 'Take photo', 'Prendre photo');
  String get newEvent => _s('Nuevo evento', 'New event', 'Nouvel événement');
  String get viewFiles => _s('Ver archivos', 'View files', 'Voir fichiers');
  String get viewSaved => _s('Ver guardados', 'View saved', 'Voir enregistrés');
  String get viewAction => _s('Ver', 'View', 'Voir');

  // --- Home: tarjeta de flujo ---
  String get flowTitle => _s('Flujo simple', 'Simple flow', 'Flux simple');
  String get flowUpToDate => _s('Al dia', 'Up to date', 'A jour');
  String get flowReview => _s('Revisar', 'Review', 'À vérifier');
  String get flowDescIdle => _s(
        'Captura una nota, audio, foto, vídeo, lugar o agenda. Vibe guarda primero en el teléfono y luego sincroniza.',
        'Capture a note, audio, photo, video, place or event. Vibe saves to the phone first, then syncs.',
        'Capturez une note, un audio, une photo, une vidéo, un lieu ou un événement. Vibe enregistre d\'abord sur le téléphone, puis synchronise.',
      );
  String flowDescOpen(String title) => _s(
        'La experiencia "$title" esta abierta. Todo lo que agregues quedara vinculado a esa experiencia.',
        'The experience "$title" is open. Everything you add will be linked to that experience.',
        'L\'expérience "$title" est ouverte. Tout ce que vous ajoutez y sera lié.',
      );
  String get flowStep1Title => _s('1. Captura', '1. Capture', '1. Capturer');
  String get flowStep1Detail =>
      _s('Nota, audio o medio', 'Note, audio or media', 'Note, audio ou media');
  String get flowStep2Title => _s('2. Guarda', '2. Save', '2. Enregistrer');
  String get flowStep2Connected =>
      _s('Cuenta activa', 'Account active', 'Compte actif');
  String get flowStep2Missing =>
      _s('Falta entrar', 'Sign in needed', 'Connexion requise');
  String get flowStep3Title => _s('3. Revisa', '3. Review', '3. Verifier');
  String get flowStep3Clear =>
      _s('Sin pendientes', 'Nothing pending', 'Rien en attente');
  String flowStep3Pending(int n) =>
      _s('$n pendiente(s)', '$n pending', '$n en attente');

  // --- Home: panel "que quieres hacer" ---
  String get whatToDoNow => _s('Que quieres hacer ahora?',
      'What would you like to do?', 'Que voulez-vous faire?');
  String get actWrite => _s('Escribir', 'Write', 'Ecrire');
  String get actWriteDetail =>
      _s('Nota o comando corto', 'Note or short command', 'Note ou commande');
  String get actStop => _s('Detener', 'Stop', 'Arreter');
  String get actStopDetail =>
      _s('Guardar grabación', 'Save recording', 'Enregistrer la prise');
  String get actAudio => _s('Audio', 'Audio', 'Audio');
  String get actAudioDetail =>
      _s('Grabar una nota', 'Record a note', 'Enregistrer une note');
  String get actPhoto => _s('Foto', 'Photo', 'Photo');
  String get actPhotoDetail =>
      _s('Cámara del teléfono', 'Phone camera', 'Appareil du téléphone');
  String get actAgenda => _s('Agenda', 'Agenda', 'Agenda');
  String get actAgendaDetail =>
      _s('Crear recordatorio', 'Create reminder', 'Creer un rappel');
  String get actFiles => _s('Archivos', 'Files', 'Fichiers');
  String get actFilesDetail =>
      _s('Medios y biometría', 'Media and biometrics', 'Médias et biométrie');
  String get actSaved => _s('Guardados', 'Saved', 'Enregistres');
  String get actSavedDetail => _s('Ver capturas recientes',
      'See recent captures', 'Voir les captures recentes');
  String get segForYou => _s('Para ti', 'For you', 'Pour vous');
  String get segGroups => _s('Grupos', 'Groups', 'Groupes');
  String get segRecent => _s('Recientes', 'Recent', 'Recents');

  // --- Compositor de nota rapida ---
  String get quickNoteTitle => _s('Nota rápida', 'Quick note', 'Note rapide');
  String get quickNoteReady => _s(
        'Vibe listo. Toca confirmar y luego dicta o escribe la accion.',
        'Vibe ready. Tap confirm, then dictate or type the action.',
        'Vibe pret. Touchez confirmer, puis dictez ou ecrivez l\'action.',
      );
  String get noteFieldLabel => _s('Cuenta lo que esta pasando',
      'Tell what is happening', 'Dites ce qui se passe');
  String get noteFieldHint => _s(
        'Ejemplo: V, toma nota que estoy llegando al museo...',
        'Example: V, take a note that I am arriving at the museum...',
        'Exemple: V, prends note que j\'arrive au musee...',
      );
  String get activateV => _s('Activar V', 'Activate V', 'Activer V');
  String get saveCapture =>
      _s('Guardar captura', 'Save capture', 'Enregistrer la capture');

  // --- Panel Guardados ---
  String get savedSubtitle => _s(
        'Tus notas, experiencias y capturas recientes en este teléfono.',
        'Your notes, experiences and recent captures on this phone.',
        'Vos notes, expériences et captures récentes sur ce téléphone.',
      );
  String get capturesMetric => _s('Capturas', 'Captures', 'Captures');
  String get sessionsMetric => _s('Sesiones', 'Sessions', 'Sessions');
  String get emptySavedTitle => _s('Aun no hay guardados',
      'Nothing saved yet', 'Rien d\'enregistre');
  String get emptySavedDetail => _s(
        'Escribe una nota, graba audio, toma una foto o abre una experiencia.',
        'Write a note, record audio, take a photo or open an experience.',
        'Écrivez une note, enregistrez un audio, prenez une photo ou ouvrez une expérience.',
      );

  // --- Panel Archivos ---
  String get assetsSubtitle => _s(
        'Fotos, vídeos, audios, documentos y biometría vinculados a tus experiencias.',
        'Photos, videos, audio, documents and biometrics linked to your experiences.',
        'Photos, vidéos, audios, documents et biométrie liés à vos expériences.',
      );
  String get noAssetsChip => _s('Sin activos', 'No assets', 'Aucun element');
  String get emptyAssetsTitle =>
      _s('Sin archivos todavia', 'No files yet', 'Aucun fichier');
  String get emptyAssetsDetail => _s(
        'Usa Foto, Video, Audio o Biometria para agregar evidencia.',
        'Use Photo, Video, Audio or Biometrics to add evidence.',
        'Utilisez Photo, Video, Audio ou Biometrie pour ajouter une preuve.',
      );
  String get assetsGuideTitle => _s('Que hace Vibe con tus archivos',
      'What Vibe does with your files', 'Ce que Vibe fait de vos fichiers');
  String get assetsGuideBody => _s(
        'Fotos, vídeos, audios y documentos se guardan como evidencia privada. Los CSV/JSON biométricos se leen por fecha y hora para explicar energía, sueño, actividad o recuperación.',
        'Photos, videos, audio and documents are stored as private evidence. Biometric CSV/JSON files are read by date and time to explain energy, sleep, activity or recovery.',
        'Photos, vidéos, audios et documents sont stockés comme preuves privées. Les CSV/JSON biométriques sont lus par date et heure pour expliquer énergie, sommeil, activité ou récupération.',
      );
  String assetsActiveChip(int n) =>
      _s('$n activo(s)', '$n asset(s)', '$n element(s)');
  String get chipImageVideo =>
      _s('Imagen/vídeo: evidencia', 'Image/video: evidence', 'Image/vidéo: preuve');
  String get chipAudio =>
      _s('Audio: transcripcion', 'Audio: transcription', 'Audio: transcription');
  String get chipDocument =>
      _s('Documento: texto', 'Document: text', 'Document: texte');
  String get chipBiometric =>
      _s('Biometria: contexto', 'Biometrics: context', 'Biometrie: contexte');

  // --- Panel Agenda ---
  String get agendaSubtitle => _s(
        'Eventos creados por comando de voz, nota rápida o experiencia abierta.',
        'Events created by voice command, quick note or open experience.',
        'Événements créés par commande vocale, note rapide ou expérience ouverte.',
      );
  String get agendaMetric => _s('Agenda', 'Agenda', 'Agenda');
  String get eventsMetric => _s('Eventos', 'Events', 'Evenements');
  String get emptyAgendaTitle =>
      _s('Sin eventos aún', 'No events yet', 'Aucun événement');
  String get emptyAgendaDetail => _s(
        'Di algo como: V, agenda cena hoy a las 8 pm.',
        'Say something like: V, schedule dinner today at 8 pm.',
        'Dites par exemple: V, planifie le diner aujourd\'hui a 20h.',
      );

  // --- Grilla de captura ---
  String get capAudioRecording => _s(
        'Grabando. Pulsa para detener y guardar.',
        'Recording. Tap to stop and save.',
        'Enregistrement. Touchez pour arrêter et enregistrer.',
      );
  String get capAudioDetail => _s(
        'Graba una nota hablada o un momento de la experiencia.',
        'Record a spoken note or a moment of the experience.',
        'Enregistrez une note vocale ou un moment de l\'expérience.',
      );
  String get capPhotoDetail => _s(
        'Toma una foto y guardala con fecha y contexto.',
        'Take a photo and save it with date and context.',
        'Prenez une photo et enregistrez-la avec date et contexte.',
      );
  String get capVideo => _s('Vídeo', 'Video', 'Vidéo');
  String get capVideoDetail => _s(
        'Graba un vídeo corto para documentar el momento.',
        'Record a short video to document the moment.',
        'Enregistrez une courte vidéo pour documenter le moment.',
      );
  String get capAgendaDetail => _s(
        'Crea una cita o recordatorio confirmado.',
        'Create a confirmed appointment or reminder.',
        'Creez un rendez-vous ou un rappel confirme.',
      );
  String get capBiometricDetail => _s(
        'Importa un archivo de salud o actividad.',
        'Import a health or activity file.',
        'Importez un fichier de santé ou d\'activité.',
      );
  String get biometricsLabel =>
      _s('Biometria', 'Biometrics', 'Biometrie');
  String get capPlace => _s('Lugar', 'Place', 'Lieu');
  String get capPlaceDetail => _s(
        'Guarda el lugar actual cuando lo autorices.',
        'Save the current place when you allow it.',
        'Enregistre le lieu actuel lorsque vous l\'autorisez.',
      );

  // --- Estado: ajustes avanzados ---
  String get advancedTitle => _s('Configuración y fuentes avanzadas',
      'Advanced settings and sources', 'Parametres et sources avances');
  String get advancedSubtitle => _s(
        'Backend, sesiones externas, Health Connect y contrato técnico.',
        'Backend, external sessions, Health Connect and technical contract.',
        'Backend, sessions externes, Health Connect et contrat technique.',
      );
  String get nativeContractTitle =>
      _s('Contrato nativo', 'Native contract', 'Contrat natif');
  String get nativeContractBody => _s(
        'La app nativa captura permisos reales del dispositivo, guarda en cola local y sincroniza con Supabase a través del backend de Vibe.',
        'The native app captures real device permissions, stores them in a local queue and syncs with Supabase through the Vibe backend.',
        'L\'application native capture les autorisations réelles de l\'appareil, les stocke dans une file locale et synchronise avec Supabase via le backend de Vibe.',
      );

  // --- Cuenta: tarjeta de informacion ---
  String get notSyncedYet =>
      _s('Aún no sincronizado', 'Not synced yet', 'Pas encore synchronise');
  String get allSavedShort =>
      _s('Todo guardado', 'All saved', 'Tout est enregistre');
  String get diagDestination =>
      _s('Destino Vibe', 'Vibe destination', 'Destination Vibe');
  String get diagLastSave =>
      _s('Ultimo guardado', 'Last save', 'Dernier enregistrement');
  String get noActiveSession => _s('Sin sesión activa', 'No active session',
      'Aucune session active');
  String get notDefined => _s('No definido', 'Not set', 'Non defini');

  // --- Cuenta: tarjeta de sesion/sync ---
  String get retryQueueTitle =>
      _s('Reintentar guardado', 'Retry save', 'Réessayer l\'enregistrement');
  String get retryQueueBody => _s(
        'Vibe intentará guardar ahora las capturas pendientes. Si no hay conexión, las conserva para intentarlo después.',
        'Vibe will try to save the pending captures now. If there is no connection, it keeps them to try later.',
        'Vibe va essayer d\'enregistrer les captures en attente. Sans connexion, elles sont conservees pour plus tard.',
      );
  String get signInBlurb => _s(
        'Entra con tu cuenta Vibe para guardar tus capturas y verlas en tus otros dispositivos.',
        'Sign in with your Vibe account to save your captures and see them on your other devices.',
        'Connectez-vous avec votre compte Vibe pour enregistrer vos captures et les voir sur vos autres appareils.',
      );
  String get apiFieldLabel => _s('API de Vibe', 'Vibe API', 'API Vibe');
  String get emailFieldLabel => _s('Correo', 'Email', 'E-mail');
  String get passwordFieldLabel =>
      _s('Clave', 'Password', 'Mot de passe');
  String get passwordHelper => _s(
        'Puedes verla con el icono. Vibeapp no guarda tu clave.',
        'You can reveal it with the icon. Vibeapp does not store your password.',
        'Vous pouvez l\'afficher avec l\'icone. Vibeapp ne conserve pas votre mot de passe.',
      );
  String get hidePassword =>
      _s('Ocultar clave', 'Hide password', 'Masquer le mot de passe');
  String get showPassword =>
      _s('Mostrar clave', 'Show password', 'Afficher le mot de passe');
  String get signingIn => _s('Entrando...', 'Signing in...', 'Connexion...');
  String get signInReady => _s(
        'Listo. Tus capturas se sincronizarán.',
        'Ready. Your captures will sync.',
        'Pret. Vos captures vont se synchroniser.',
      );
  String activeSessionLine(String email) =>
      _s('Sesion activa: $email', 'Active session: $email',
          'Session active: $email');
  String get verifying => _s('Verificando...', 'Checking...', 'Verification...');
  String get verifyVibe => _s('Verificar Vibe', 'Check Vibe', 'Verifier Vibe');
  String get signInAndSync => _s('Entrar y sincronizar', 'Sign in and sync',
      'Se connecter et synchroniser');

  // --- Asistente V ---
  String get assistantSettingsTitle =>
      _s('Asistente V', 'V assistant', 'Assistant V');
  String get assistantSettingsSubtitle => _s(
        'Configura idioma, voz, respuestas con IA y activación.',
        'Configure language, voice, AI answers and activation.',
        'Configurez la langue, la voix, les reponses IA et l\'activation.',
      );
  String get languageLabel => _s('Idioma de la app', 'App language',
      'Langue de l\'application');
  String get voiceLabel => _s('Voz del asistente', 'Assistant voice',
      'Voix de l\'assistant');
  String get voiceFemale => _s('Mujer', 'Female', 'Femme');
  String get voiceMale => _s('Hombre', 'Male', 'Homme');
  String get testVoice => _s('Probar voz', 'Test voice', 'Tester la voix');
  String get testVoicePhrase => _s(
        'Hola, soy V. Estoy lista para ayudarte.',
        'Hi, I am V. I am ready to help you.',
        'Bonjour, je suis V. Je suis prete a vous aider.',
      );
  String get claudeKeyLabel =>
      _s('Clave de IA (Claude)', 'AI key (Claude)', 'Cle IA (Claude)');
  String get claudeKeyHint => _s(
        'Pega tu clave de Anthropic para que V responda preguntas.',
        'Paste your Anthropic key so V can answer questions.',
        'Collez votre clé Anthropic pour que V réponde aux questions.',
      );
  String get claudeKeySaved =>
      _s('Clave guardada.', 'Key saved.', 'Cle enregistree.');
  String get aiStatusActive => _s('IA activa: V responde preguntas.',
      'AI active: V answers questions.', 'IA active: V répond aux questions.');
  String get aiStatusNoKey => _s(
        'IA sin clave: pega tu clave de Anthropic y pulsa Guardar.',
        'AI has no key: paste your Anthropic key and tap Save.',
        'IA sans clé: collez votre clé Anthropic et appuyez sur Enregistrer.',
      );
  String get aiTestButton => _s('Probar IA', 'Test AI', 'Tester l\'IA');
  String get aiTestOk => _s('IA OK:', 'AI OK:', 'IA OK:');
  String get aiTestFail => _s('Fallo IA:', 'AI failed:', 'Echec IA:');
  String get aiTestNoKey => _s('Falta la clave de IA.', 'AI key is missing.',
      'Cle IA manquante.');

  // --- Salud / wearables ---
  String get healthTitle => _s('Salud', 'Health', 'Santé');
  String get healthSubtitle => _s(
        'Lectura en vivo de Apple Salud / Health Connect y, con token, del anillo Oura. Se sincroniza al servidor una vez al día.',
        'Live reading from Apple Health / Health Connect and, with a token, the Oura ring. Synced to the server once a day.',
        'Lecture en direct d\'Apple Santé / Health Connect et, avec un jeton, de l\'anneau Oura. Synchronisé au serveur une fois par jour.',
      );
  String get healthConnectBtn =>
      _s('Conectar salud', 'Connect health', 'Connecter la santé');
  String get healthRefresh => _s('Actualizar', 'Refresh', 'Actualiser');
  String get healthConnected =>
      _s('Salud conectada.', 'Health connected.', 'Santé connectée.');
  String get healthDenied => _s(
        'No se concedió el permiso de salud. Actívalo en Ajustes del sistema.',
        'Health permission was denied. Enable it in system Settings.',
        'Permission de santé refusée. Activez-la dans les Réglages du système.',
      );
  String get healthNoData => _s(
        'Aún no hay datos de salud para hoy.',
        'No health data for today yet.',
        'Pas encore de données de santé pour aujourd\'hui.',
      );
  String get healthStepsLabel => _s('Pasos', 'Steps', 'Pas');
  String get healthHeartLabel => _s('Ritmo', 'Heart rate', 'Rythme');
  String get healthEnergyLabel => _s('Energía', 'Energy', 'Énergie');
  String get healthSleepLabel => _s('Sueño', 'Sleep', 'Sommeil');
  String get healthReadinessLabel =>
      _s('Preparación', 'Readiness', 'Préparation');
  String get healthSleepScoreLabel =>
      _s('Sueño (puntaje)', 'Sleep score', 'Score sommeil');
  String get healthHrvLabel => _s('HRV', 'HRV', 'VFC');
  String get healthRestingLabel =>
      _s('Reposo', 'Resting HR', 'Repos');
  String get ouraSectionLabel => _s('Anillo Oura', 'Oura ring', 'Anneau Oura');
  String get ouraTokenLabel =>
      _s('Token de Oura', 'Oura token', 'Jeton Oura');
  String get ouraTokenHint => _s(
        'Pega tu token personal de la Oura Cloud API para traer sueño, preparación y HRV del anillo.',
        'Paste your personal Oura Cloud API token to bring sleep, readiness and HRV from the ring.',
        'Collez votre jeton personnel de l\'API Oura Cloud pour récupérer sommeil, préparation et VFC de l\'anneau.',
      );
  String get ouraTokenSaved => _s('Token de Oura guardado.',
      'Oura token saved.', 'Jeton Oura enregistré.');
  String get improveNoteBtn =>
      _s('Mejorar con IA', 'Improve with AI', 'Améliorer avec l\'IA');
  String get improvingNote =>
      _s('Mejorando…', 'Improving…', 'Amélioration…');
  String get improveNoteNoText => _s('Escribe o dicta una nota primero.',
      'Write or dictate a note first.', 'Écrivez ou dictez une note d\'abord.');
  String get improveNoteDone => _s('Nota mejorada.', 'Note improved.',
      'Note améliorée.');
  // --- Tema (claro / oscuro) ---
  String get themeLabel => _s('Tema', 'Theme', 'Thème');
  String get themeSystem => _s('Sistema', 'System', 'Système');
  String get themeLight => _s('Claro', 'Light', 'Clair');
  String get themeDark => _s('Oscuro', 'Dark', 'Sombre');
  // --- Transcripción de notas de voz ---
  String get transcribeTitle => _s('Transcripción de voz',
      'Voice transcription', 'Transcription vocale');
  String get transcribeSubtitle => _s(
        'Al grabar una nota de audio, la convierte a texto automáticamente. Pega tu clave de la API de transcripción (OpenAI Whisper).',
        'When you record an audio note, it converts it to text automatically. Paste your transcription API key (OpenAI Whisper).',
        'En enregistrant une note audio, la convertit en texte. Collez votre clé d\'API de transcription (OpenAI Whisper).',
      );
  String get transcribeKeyLabel =>
      _s('Clave de transcripción', 'Transcription key', 'Clé de transcription');
  String get transcribeKeySaved => _s('Clave de transcripción guardada.',
      'Transcription key saved.', 'Clé de transcription enregistrée.');
  String get transcribeDone =>
      _s('Audio transcrito a texto.', 'Audio transcribed.', 'Audio transcrit.');
  String get transcribeFail => _s('No se pudo transcribir:',
      'Could not transcribe:', 'Transcription impossible:');
  // --- Conexion CLIO (MCP) ---
  String get clioTitle => _s('Conexión con CLIO (beta)', 'CLIO connection (beta)',
      'Connexion CLIO (beta)');
  String get clioSubtitle => _s(
        'Conecta V al servidor MCP de CLIO para usar sus herramientas y, más adelante, las gafas. Pide a tu hijo la URL del MCP y un token.',
        'Connect V to CLIO\'s MCP server to use its tools and, later, the glasses. Ask for the MCP URL and a token.',
        'Connectez V au serveur MCP de CLIO pour ses outils et, plus tard, les lunettes. Demandez l\'URL MCP et un jeton.',
      );
  String get clioUrlLabel =>
      _s('URL del servidor MCP', 'MCP server URL', 'URL du serveur MCP');
  String get clioTokenLabel => _s('Token de CLIO', 'CLIO token', 'Jeton CLIO');
  String get clioTestBtn =>
      _s('Probar conexión', 'Test connection', 'Tester la connexion');
  String get clioSaved => _s('Conexión CLIO guardada.', 'CLIO connection saved.',
      'Connexion CLIO enregistrée.');
  String get clioNeedsConfig => _s('Falta la URL del MCP o el token de CLIO.',
      'Missing MCP URL or CLIO token.', 'URL MCP ou jeton CLIO manquant.');
  String clioTestOk(int n) => _s('Conectado. $n herramientas disponibles.',
      'Connected. $n tools available.', 'Connecté. $n outils disponibles.');
  String get clioTestFail =>
      _s('No se pudo conectar:', 'Could not connect:', 'Connexion impossible:');
  // --- Gafas inteligentes (Meta / Oakley) ---
  String get glassesTitle =>
      _s('Gafas inteligentes', 'Smart glasses', 'Lunettes intelligentes');
  String get glassesSubtitle => _s(
        'Ray-Ban Meta y Oakley vía el plugin nativo (Meta Device Access Toolkit). Pendiente de instalar el plugin de gafas para activar cámara y audio manos libres.',
        'Ray-Ban Meta and Oakley via the native plugin (Meta Device Access Toolkit). Waiting for the glasses plugin to enable hands-free camera and audio.',
        'Ray-Ban Meta et Oakley via le plugin natif (Meta Device Access Toolkit). En attente du plugin lunettes pour activer caméra et audio mains libres.',
      );
  String get glassesConnectBtn =>
      _s('Conectar gafas', 'Connect glasses', 'Connecter les lunettes');
  String get glassesConnected =>
      _s('Gafas conectadas.', 'Glasses connected.', 'Lunettes connectées.');
  String get glassesUnavailable => _s(
        'Gafas no disponibles: falta instalar el plugin nativo.',
        'Glasses unavailable: the native plugin is not installed yet.',
        'Lunettes indisponibles : le plugin natif n\'est pas encore installé.',
      );
  String glassesStatusLabel(GlassesStatus s) {
    switch (s) {
      case GlassesStatus.connected:
        return _s('Conectadas', 'Connected', 'Connectées');
      case GlassesStatus.connecting:
        return _s('Conectando…', 'Connecting…', 'Connexion…');
      case GlassesStatus.disconnected:
        return _s('Desconectadas', 'Disconnected', 'Déconnectées');
      case GlassesStatus.unavailable:
        return _s('Pendiente del plugin', 'Awaiting plugin', 'En attente du plugin');
    }
  }
  String healthSpoken(HealthSummary s) {
    final parts = <String>[];
    if (s.steps != null) {
      parts.add(_s('${s.steps} pasos', '${s.steps} steps', '${s.steps} pas'));
    }
    if (s.heartRate != null) {
      final hr = s.heartRate!.round();
      parts.add(_s('ritmo $hr', 'heart rate $hr', 'rythme $hr'));
    }
    if (s.activeEnergyKcal != null) {
      final kcal = s.activeEnergyKcal!.round();
      parts.add(_s('$kcal calorías activas', '$kcal active calories',
          '$kcal calories actives'));
    }
    if (s.sleepHours != null) {
      final h = s.sleepHours!.toStringAsFixed(1);
      parts.add(_s('$h horas de sueño', '$h hours of sleep',
          '$h heures de sommeil'));
    }
    if (s.readinessScore != null) {
      parts.add(_s('preparación ${s.readinessScore}',
          'readiness ${s.readinessScore}', 'préparation ${s.readinessScore}'));
    }
    if (s.sleepScore != null) {
      parts.add(_s('puntaje de sueño ${s.sleepScore}',
          'sleep score ${s.sleepScore}', 'score de sommeil ${s.sleepScore}'));
    }
    if (parts.isEmpty) return healthNoData;
    final body = parts.join(', ');
    return _s('Hoy: $body.', 'Today: $body.', 'Aujourd\'hui: $body.');
  }

  /// Resumen hablado del dia: saludo por hora + salud + capturas pendientes +
  /// sesion abierta. Cada bloque solo aparece si hay dato.
  String dailyBriefingSpoken({
    HealthSummary? health,
    required int pending,
    String? sessionTitle,
  }) {
    final hour = DateTime.now().hour;
    final greet = hour < 12
        ? _s('Buenos días.', 'Good morning.', 'Bonjour.')
        : hour < 19
            ? _s('Buenas tardes.', 'Good afternoon.', 'Bon après-midi.')
            : _s('Buenas noches.', 'Good evening.', 'Bonsoir.');
    final parts = <String>[greet];

    final h = health;
    if (h != null && h.hasAny) {
      final hp = <String>[];
      if (h.steps != null) {
        hp.add(_s('${h.steps} pasos', '${h.steps} steps', '${h.steps} pas'));
      }
      if (h.sleepHours != null) {
        final hs = h.sleepHours!.toStringAsFixed(1);
        hp.add(_s('$hs horas de sueño', '$hs hours of sleep',
            '$hs heures de sommeil'));
      }
      if (h.readinessScore != null) {
        hp.add(_s('preparación ${h.readinessScore}',
            'readiness ${h.readinessScore}', 'préparation ${h.readinessScore}'));
      }
      if (hp.isNotEmpty) {
        final body = hp.join(', ');
        parts.add(_s('Tu salud de hoy: $body.', 'Your health today: $body.',
            'Votre santé aujourd\'hui: $body.'));
      }
    }

    if (pending > 0) {
      parts.add(_s(
        'Tienes $pending captura${pending == 1 ? '' : 's'} pendiente${pending == 1 ? '' : 's'} de sincronizar.',
        'You have $pending capture${pending == 1 ? '' : 's'} pending to sync.',
        'Vous avez $pending capture${pending == 1 ? '' : 's'} en attente de synchronisation.',
      ));
    } else {
      parts.add(_s('No tienes capturas pendientes.',
          'You have no pending captures.', 'Aucune capture en attente.'));
    }

    if (sessionTitle != null && sessionTitle.trim().isNotEmpty) {
      parts.add(_s(
        'Tienes una experiencia abierta: $sessionTitle.',
        'You have an open experience: $sessionTitle.',
        'Vous avez une expérience ouverte: $sessionTitle.',
      ));
    }

    parts.add(_s('¿En qué te ayudo?', 'How can I help?', 'Comment puis-je aider?'));
    return parts.join(' ');
  }

  /// Resumen hablado de las capturas en cola (local): conteo por tipo + notas
  /// recientes de hoy.
  String capturesSpoken({
    required int notes,
    required int photos,
    required int videos,
    required int audios,
    required int others,
    required List<String> recentNotes,
  }) {
    final total = notes + photos + videos + audios + others;
    if (total == 0) {
      return _s('No tienes capturas pendientes.',
          'You have no pending captures.', 'Aucune capture en attente.');
    }
    final counts = <String>[];
    void add(int n, String es1, String esN, String en1, String enN, String fr1,
        String frN) {
      if (n <= 0) return;
      counts.add(_s('$n ${n == 1 ? es1 : esN}', '$n ${n == 1 ? en1 : enN}',
          '$n ${n == 1 ? fr1 : frN}'));
    }

    add(notes, 'nota', 'notas', 'note', 'notes', 'note', 'notes');
    add(photos, 'foto', 'fotos', 'photo', 'photos', 'photo', 'photos');
    add(videos, 'vídeo', 'vídeos', 'video', 'videos', 'vidéo', 'vidéos');
    add(audios, 'audio', 'audios', 'audio', 'audios', 'audio', 'audios');
    add(others, 'captura más', 'capturas más', 'other capture', 'other captures',
        'autre capture', 'autres captures');
    final body = counts.join(', ');
    final head = _s('Tienes $total captura${total == 1 ? '' : 's'}: $body.',
        'You have $total capture${total == 1 ? '' : 's'}: $body.',
        'Vous avez $total capture${total == 1 ? '' : 's'}: $body.');
    if (recentNotes.isEmpty) return head;
    final list = recentNotes.map((n) => '"$n"').join('; ');
    final tail = _s('Hoy anotaste: $list.', 'Today you noted: $list.',
        'Aujourd\'hui vous avez noté: $list.');
    return '$head $tail';
  }

  String get wakeLabel => _s('Escucha persistente', 'Persistent listening',
      'Ecoute persistante');
  String get wakeHint => _s(
        'V sigue atenta tras cada comando hasta que digas "desactivar V".',
        'V stays attentive after each command until you say "stop V".',
        'V reste attentive apres chaque commande jusqu\'a "desactiver V".',
      );
  String get saveAssistantSettings =>
      _s('Guardar ajustes', 'Save settings', 'Enregistrer les paramètres');
  String get assistantSettingsSaved => _s('Ajustes del asistente guardados.',
      'Assistant settings saved.', 'Paramètres de l\'assistant enregistrés.');

  // Estados de voz de V (app-wide)
  String get vListening => _s('V escuchando', 'V listening', 'V écoute');
  String get vActive => _s('V activo', 'V active', 'V actif');
  String get vInactive => _s('V inactivo', 'V inactive', 'V inactif');

  // --- Mensajes transitorios de V y acciones ---
  String get vDeactivated => _s('V desactivado.', 'V turned off.', 'V desactive.');
  String get vDeactivatedByCommand => _s('V desactivado por comando.',
      'V turned off by command.', 'V desactive par commande.');
  String get vOnlineStatus => _s(
        'Vibe en linea. Ahora dicta o escribe: toma nota, agenda o inicia experiencia.',
        'Vibe online. Now dictate or type: take a note, schedule, or start an experience.',
        'Vibe en ligne. Dictez ou écrivez: prendre note, planifier ou démarrer une expérience.',
      );
  String get vOnlineWaiting => _s('Vibe en linea. Esperando tu instruccion.',
      'Vibe online. Waiting for your instruction.',
      'Vibe en ligne. En attente de votre instruction.');
  String get vRecovering => _s('V recuperando escucha...',
      'V recovering listening...', 'V reprend l\'écoute...');
  String vResumed(String label) => _s('$label listo. V vuelve a escuchar.',
      '$label done. V is listening again.',
      '$label terminé. V écoute de nouveau.');
  String vPaused(String label) => _s(
        'V pausa para $label. Al terminar vuelve a escuchar.',
        'V paused for $label. It will listen again when done.',
        'V en pause pour $label. Elle écoutera de nouveau ensuite.',
      );
  String vVoiceError(String detail) => _s('V por voz error: $detail',
      'V voice error: $detail', 'Erreur vocale de V: $detail');
  String get vRunningQuickNote => _s('V ejecutando nota rápida.',
      'V running quick note.', 'V exécute une note rapide.');
  String get vOpeningAgenda =>
      _s('V abriendo agenda.', 'V opening agenda.', 'V ouvre l\'agenda.');
  String get vOpeningPhoto =>
      _s('V abriendo foto.', 'V opening photo.', 'V ouvre la photo.');
  String get vOpeningVideo =>
      _s('V abriendo vídeo.', 'V opening video.', 'V ouvre la vidéo.');
  String get vOpeningBiometrics => _s('V abriendo biometría.',
      'V opening biometrics.', 'V ouvre la biométrie.');
  String vNavigatedTo(String label) => _s('V navego a $label.',
      'V navigated to $label.', 'V est alle a $label.');
  String get vStartingExperience => _s('V iniciando experiencia.',
      'V starting experience.', 'V démarre une expérience.');

  // --- Confirmaciones de fin de accion (cierre por voz+texto) ---
  String get confNote => _s('Nota creada.', 'Note created.', 'Note créée.');
  String get confEvent =>
      _s('Evento creado.', 'Event created.', 'Événement créé.');
  String get confPhoto => _s('Foto guardada.', 'Photo saved.', 'Photo enregistrée.');
  String get confVideo => _s('Vídeo guardado.', 'Video saved.', 'Vidéo enregistrée.');
  String get confAudioSaved =>
      _s('Audio guardado.', 'Audio saved.', 'Audio enregistré.');
  String get confAudioRecording => _s('Grabando audio. Di "audio" para detener.',
      'Recording audio. Say "audio" to stop.',
      'Enregistrement. Dites "audio" pour arrêter.');
  String get confBiometric => _s('Biometría importada.', 'Biometrics imported.',
      'Biométrie importée.');
  String get confLocation => _s('Ubicación guardada.', 'Location saved.',
      'Position enregistrée.');
  String get confSynced => _s('Sincronización lista.', 'Sync done.',
      'Synchronisation terminée.');
  String get confBackend => _s('Backend verificado.', 'Backend checked.',
      'Backend vérifié.');
  String get confCleaned =>
      _s('Limpieza lista.', 'Cleanup done.', 'Nettoyage terminé.');
  String get confOpeningManual => _s('Abriendo el manual.',
      'Opening the manual.', 'Ouverture du manuel.');
  String get helpSpoken => _s(
        'Puedo abrir secciones (inicio, capturar, guardados, agenda, estado, cuenta), tomar fotos, vídeo, audio y notas, guardar tu ubicación, contarte tu salud y pasos, darte un resumen del día, sincronizar, abrir el manual y responder tus preguntas. Recuerdo el hilo de la conversación, así que puedes encadenar peticiones. Solo dime qué necesitas.',
        'I can open sections (home, capture, saved, agenda, status, account), take photos, video, audio and notes, save your location, tell you your health and steps, give you a daily briefing, sync, open the manual and answer your questions. I remember the conversation, so you can chain requests. Just tell me what you need.',
        'Je peux ouvrir des sections (accueil, capture, enregistrés, agenda, état, compte), prendre photos, vidéo, audio et notes, enregistrer votre position, vous donner votre santé et vos pas, un résumé de la journée, synchroniser, ouvrir le manuel et répondre à vos questions. Je me souviens de la conversation, vous pouvez enchaîner les demandes. Dites-moi ce qu\'il vous faut.',
      );
  String get confCanceled => _s('Acción cancelada.', 'Action canceled.',
      'Action annulée.');
  String confNavigated(String section) =>
      _s('Listo, $section.', 'Done, $section.', 'Voilà, $section.');
  String get vSavingAudio =>
      _s('V guardando audio.', 'V saving audio.', 'V enregistre l\'audio.');
  String get vRecordingAudio => _s('V grabando audio. Toca otra vez para detener.',
      'V recording audio. Tap again to stop.',
      'V enregistre l\'audio. Touchez de nouveau pour arreter.');
  String get experienceFromV =>
      _s('Experiencia desde V', 'Experience from V', 'Experience depuis V');

  // --- Auth / backend / acciones (SnackBars) ---
  String get sessionRemembered => _s(
        'Sesión recordada. Tus capturas se sincronizarán.',
        'Session remembered. Your captures will sync.',
        'Session mémorisée. Vos captures vont se synchroniser.',
      );
  String get signInFailed => _s('No se pudo entrar. Revisa la conexión.',
      'Could not sign in. Check the connection.',
      'Connexion impossible. Vérifiez la connexion.');
  String get enterEmailPassword =>
      _s('Ingresa correo y clave.', 'Enter email and password.',
          'Saisissez e-mail et mot de passe.');
  String get enterEmailPasswordToSync => _s(
        'Ingresa correo y clave para sincronizar.',
        'Enter email and password to sync.',
        'Saisissez e-mail et mot de passe pour synchroniser.',
      );
  String get reviewingPending => _s('Listo. Revisando guardados pendientes.',
      'Done. Reviewing pending saves.',
      'Terminé. Vérification des enregistrements en attente.');
  String get defineUrlFirst => _s('Define la URL de Vibe antes de verificar.',
      'Set the Vibe URL before checking.',
      'Définissez l\'URL Vibe avant de vérifier.');
  String get writeUrlFirst => _s('Primero escribe la URL de Vibe.',
      'First type the Vibe URL.', 'Saisissez d\'abord l\'URL Vibe.');
  String get backendCheckFailed => _s(
        'No se pudo verificar Vibe. Revisa conexión y URL.',
        'Could not check Vibe. Check connection and URL.',
        'Vérification de Vibe impossible. Vérifiez la connexion et l\'URL.',
      );
  String experienceActive(String title) => _s('Experiencia activa: $title',
      'Experience active: $title', 'Experience active: $title');
  String get signInFailedDetailed => _s(
        'No se pudo entrar. Revisa correo, clave o conexión.',
        'Could not sign in. Check email, password or connection.',
        'Connexion impossible. Vérifiez e-mail, mot de passe ou connexion.',
      );
  String backendReady(String mode, String persistence, String storage) => _s(
        'Backend listo: $mode - $persistence - $storage.',
        'Backend ready: $mode - $persistence - $storage.',
        'Backend pret: $mode - $persistence - $storage.',
      );
  String get backendNeedsSupabase => _s(
        'Backend responde, pero falta confirmar Supabase/Storage.',
        'Backend responds, but Supabase/Storage is not confirmed.',
        'Le backend répond, mais Supabase/Storage n\'est pas confirmé.',
      );
  String get backendVerifiedOk => _s('Conexión verificada. Vibe está listo.',
      'Connection verified. Vibe is ready.',
      'Connexion vérifiée. Vibe est prêt.');
  String get backendVerifiedPartial => _s(
        'Vibe responde, pero falta revisar Supabase o Storage.',
        'Vibe responds, but Supabase or Storage needs review.',
        'Vibe répond, mais Supabase ou Storage doit être vérifié.',
      );
  String backendCheckErrorDetail(String detail) => _s(
        'No se pudo verificar Vibe: $detail',
        'Could not check Vibe: $detail',
        'Vérification de Vibe impossible: $detail',
      );
  String agendaSaved(String title) => _s('Agenda guardada: $title.',
      'Event saved: $title.', 'Événement enregistré: $title.');
  String get allowLocation => _s(
        'Autoriza ubicación para guardar el lugar real.',
        'Allow location to save the real place.',
        'Autorisez la localisation pour enregistrer le lieu réel.',
      );
  String get noBiometricFile => _s('No se eligio archivo biometrico.',
      'No biometric file selected.', 'Aucun fichier biometrique choisi.');
  String get cannotReadFile => _s('No se pudo leer el archivo seleccionado.',
      'Could not read the selected file.',
      'Impossible de lire le fichier selectionne.');
  String get openingFilePicker => _s('Abriendo selector de archivos...',
      'Opening file picker...', 'Ouverture du selecteur de fichiers...');
  String get localResetDone => _s('Reset local de pruebas completado.',
      'Local test reset complete.', 'Reinitialisation locale des tests terminee.');
  String get healthConnectPrepared => _s(
        'Contexto Health Connect preparado. Se sincronizará como biometría transversal.',
        'Health Connect context prepared. It will sync as cross-cutting biometrics.',
        'Contexte Health Connect préparé. Il se synchronisera comme biométrie transversale.',
      );
  String get allowMicForAudio => _s(
        'Autoriza el micrófono para grabar audio.',
        'Allow the microphone to record audio.',
        'Autorisez le micro pour enregistrer l\'audio.',
      );
  String get recordingAudioTapAudio => _s(
        'Grabando audio. Pulsa Audio para detener.',
        'Recording audio. Tap Audio to stop.',
        'Enregistrement audio. Touchez Audio pour arreter.',
      );
  String get noSyncedToClean => _s(
        'No hay capturas sincronizadas para limpiar.',
        'No synced captures to clear.',
        'Aucune capture synchronisee a nettoyer.',
      );
  String get syncedCleared => _s('Capturas sincronizadas limpiadas.',
      'Synced captures cleared.', 'Captures synchronisees nettoyees.');
  String get noLocalTests => _s(
        'No hay pruebas locales pendientes para borrar.',
        'No pending local tests to delete.',
        'Aucun test local en attente à supprimer.',
      );
  String get localTestsDeleted => _s('Pruebas locales borradas.',
      'Local tests deleted.', 'Tests locaux supprimés.');
  String get continueLabel => _s('Continuar', 'Continue', 'Continuer');
  String get deleteLocalTitle => _s('Borrar pruebas locales',
      'Delete local tests', 'Supprimer les tests locaux');
  String deleteLocalMessage(int n) => _s(
        'Se quitarán $n captura(s), nota(s), evento(s) o archivo(s) que aún no figuran como sincronizados. Esto limpia la cola de este dispositivo, pero no borra nada que ya exista en Vibe PWA/backend.',
        'This will remove $n capture(s), note(s), event(s) or file(s) not yet synced. It clears this device\'s queue but deletes nothing already in Vibe PWA/backend.',
        'Cela retirera $n capture(s), note(s), événement(s) ou fichier(s) non encore synchronisés. La file de cet appareil est nettoyée, mais rien n\'est supprimé dans Vibe PWA/backend.',
      );
  String get deleteLocalConfirm =>
      _s('Borrar local', 'Delete local', 'Supprimer local');
  String get clearSyncedTitle => _s('Limpiar capturas sincronizadas',
      'Clear synced captures', 'Nettoyer les captures synchronisees');
  String clearSyncedMessage(int n) => _s(
        'Se quitarán $n captura(s) ya enviadas de la cola local. No se borrarán de Vibe PWA.',
        'This removes $n already-sent capture(s) from the local queue. They are not deleted from Vibe PWA.',
        'Cela retire $n capture(s) déjà envoyée(s) de la file locale. Elles ne sont pas supprimées de Vibe PWA.',
      );
  String get clearLabel => _s('Limpiar', 'Clear', 'Nettoyer');
  String get resetLocalTitle => _s('Reset local de pruebas',
      'Local test reset', 'Reinitialisation locale');
  String get resetLocalMessage => _s(
        'Se borrará la cola local completa, la experiencia activa y el borrador de captura en este dispositivo. La sesión/login se conserva. No borra Vibe PWA/backend.',
        'This clears the whole local queue, the active experience and the capture draft on this device. The session/login is kept. It does not delete Vibe PWA/backend.',
        'Cela efface toute la file locale, l\'expérience active et le brouillon de capture sur cet appareil. La session reste. Cela ne supprime pas Vibe PWA/backend.',
      );
  String get resetLocalConfirm =>
      _s('Reset local', 'Local reset', 'Reset local');

  // --- Hoja: crear evento de agenda ---
  String get createAgendaEventTitle => _s('Crear evento de agenda',
      'Create agenda event', 'Créer un événement');
  String get agendaSheetBlurb => _s(
        'El evento se guarda en Vibe para verlo desde la PWA y otros dispositivos.',
        'The event is saved in Vibe to view it from the PWA and other devices.',
        'L\'événement est enregistré dans Vibe pour le voir depuis la PWA et d\'autres appareils.',
      );
  String get titleField => _s('Titulo', 'Title', 'Titre');
  String get titleHint => _s('Cena, reunion, visita, recordatorio...',
      'Dinner, meeting, visit, reminder...',
      'Diner, reunion, visite, rappel...');
  String get durationField => _s('Duracion', 'Duration', 'Duree');
  String get placeField => _s('Lugar', 'Place', 'Lieu');
  String get optionalHint => _s('Opcional', 'Optional', 'Optionnel');
  String get notesField => _s('Notas', 'Notes', 'Notes');
  String get notesHint => _s('Detalles utiles para recordar o preparar.',
      'Useful details to remember or prepare.',
      'Détails utiles à retenir ou préparer.');
  String minutesOption(int n) => _s('$n minutos', '$n minutes', '$n minutes');
  String hoursOption(int n) =>
      _s('$n hora${n == 1 ? '' : 's'}', '$n hour${n == 1 ? '' : 's'}',
          '$n heure${n == 1 ? '' : 's'}');
  String get addTitleError => _s('Agrega un titulo para guardar el evento.',
      'Add a title to save the event.',
      'Ajoutez un titre pour enregistrer l\'événement.');

  // --- Hoja: importar biometria (solo archivos historicos / Oura / Samsung) ---
  String get importBiometricsTitle => _s('Importar biometría (archivos)',
      'Import biometrics (files)', 'Importer la biométrie (fichiers)');
  String get biometricSheetBlurb => _s(
        'Apple Health ya se lee en vivo en la tarjeta Salud. Usa esto solo para importar archivos exportados (CSV/JSON/ZIP) de Oura, Samsung Health, Health Connect o respaldos históricos.',
        'Apple Health is now read live in the Health card. Use this only to import exported files (CSV/JSON/ZIP) from Oura, Samsung Health, Health Connect or historical backups.',
        'Apple Health est désormais lu en direct dans la carte Santé. Utilisez ceci uniquement pour importer des fichiers exportés (CSV/JSON/ZIP) d\'Oura, Samsung Health, Health Connect ou des sauvegardes historiques.',
      );
  String get biometricAppleDetail => _s(
        'Apple Health: ya no hace falta importar; se lee en vivo en la tarjeta Salud.',
        'Apple Health: no longer needs importing; it is read live in the Health card.',
        'Apple Health: plus besoin d\'importer; lu en direct dans la carte Santé.',
      );
  String get biometricOuraDetail => _s(
        'Sirven pasos, sueno, pulso, HRV, actividad y energia.',
        'Steps, sleep, heart rate, HRV, activity and energy all work.',
        'Pas, sommeil, pouls, VFC, activité et énergie sont pris en charge.',
      );
  String get biometricPrivacyTitle => _s('Privacidad', 'Privacy', 'Confidentialite');
  String get biometricPrivacyDetail => _s(
        'Se guarda como contexto transversal, no como diagnostico medico.',
        'It is stored as cross-cutting context, not as a medical diagnosis.',
        'Conserve comme contexte transversal, pas comme diagnostic medical.',
      );
  String get chooseFile => _s('Elegir archivo', 'Choose file', 'Choisir un fichier');
  String importBiometricError(String detail) => _s(
        'No se pudo importar biometría: $detail',
        'Could not import biometrics: $detail',
        'Impossible d\'importer la biométrie: $detail',
      );

  // --- Errores de audio ---
  String audioStartError(String detail) => _s('No se pudo iniciar audio: $detail',
      'Could not start audio: $detail', 'Impossible de démarrer l\'audio: $detail');
  String audioSaveError(String detail) => _s('No se pudo guardar el audio: $detail',
      'Could not save audio: $detail',
      'Impossible d\'enregistrer l\'audio: $detail');

  // --- Hoja: importar sesion externa ---
  String get importExternalTitle => _s('Importar sesión externa',
      'Import external session', 'Importer une session externe');
  String get externalSheetBlurb => _s(
        'Usa este flujo para traer material de Meta/Oakley, Oura, Apple Health, Samsung Health, Health Connect o una carpeta del teléfono. Vibeapp lo agrupa como una experiencia y lo envía a Vibe.',
        'Use this flow to bring material from Meta/Oakley, Oura, Apple Health, Samsung Health, Health Connect or a phone folder. Vibeapp groups it as an experience and sends it to Vibe.',
        'Utilisez ce flux pour importer du contenu de Meta/Oakley, Oura, Apple Health, Samsung Health, Health Connect ou un dossier du téléphone. Vibeapp le regroupe comme une expérience et l\'envoie à Vibe.',
      );
  String get sourceField => _s('Origen', 'Source', 'Source');
  String get experienceTitleField => _s('Titulo de la experiencia',
      'Experience title', 'Titre de l\'experience');
  String get experienceTitleHint => _s('Ejemplo: Paseo con lentes Meta',
      'Example: Walk with Meta glasses', 'Exemple: Balade avec lunettes Meta');
  String get contextField => _s('Contexto', 'Context', 'Contexte');
  String get contextHint => _s(
        'Lugar, personas, intencion o detalle que ayude a interpretar los archivos.',
        'Place, people, intent or detail that helps interpret the files.',
        'Lieu, personnes, intention ou detail aidant a interpreter les fichiers.',
      );
  String get chooseFiles => _s('Elegir archivos', 'Choose files', 'Choisir des fichiers');

  // --- Hojas foto/video ---
  String get takePhotoSheet => _s('Tomar foto', 'Take photo', 'Prendre une photo');
  String get chooseImage => _s('Elegir imagen', 'Choose image', 'Choisir une image');
  String get recordVideoSheet => _s('Grabar vídeo', 'Record video', 'Enregistrer une vidéo');
  String get chooseVideo => _s('Elegir vídeo', 'Choose video', 'Choisir une vidéo');
  String get addPhotoTitle => _s('Agregar foto', 'Add photo', 'Ajouter une photo');
  String get photoSheetBlurb => _s(
        'Puedes tomar una foto nueva o elegir una imagen existente. Vibeapp la sube a Storage privado y la vincula a la experiencia.',
        'You can take a new photo or choose an existing image. Vibeapp uploads it to private Storage and links it to the experience.',
        'Vous pouvez prendre une nouvelle photo ou choisir une image. Vibeapp l\'envoie vers le Storage prive et la lie a l\'experience.',
      );
  String get addVideoTitle => _s('Agregar vídeo', 'Add video', 'Ajouter une vidéo');
  String get prepareHealthConnect => _s('Preparar prueba Health Connect',
      'Prepare Health Connect test', 'Preparer le test Health Connect');
  String get startExperience =>
      _s('Iniciar experiencia', 'Start experience', 'Demarrer l\'experience');
  String get clearReady => _s('Limpiar listos', 'Clear ready', 'Nettoyer les prets');
  String get videoSheetBlurb => _s(
        'Puedes grabar un vídeo nuevo o elegir uno existente. Vibeapp lo sube a Storage privado y lo vincula a la experiencia.',
        'You can record a new video or choose an existing one. Vibeapp uploads it to private Storage and links it to the experience.',
        'Vous pouvez enregistrer une nouvelle vidéo ou en choisir une. Vibeapp l\'envoie vers le Storage privé et la lie à l\'expérience.',
      );
  String get closeExperienceLabel => _s('Cerrar experiencia',
      'Close experience', 'Fermer l\'experience');
  String get vThinking =>
      _s('V está pensando...', 'V is thinking...', 'V réfléchit...');
  String vAnswering(String q) => _s(
        'V respondiendo a: $q',
        'V answering: $q',
        'V répond a: $q',
      );
  String get vNoKey => _s(
        'Para responder preguntas, agrega tu clave de IA en Cuenta > Asistente V.',
        'To answer questions, add your AI key in Account > V assistant.',
        'Pour répondre, ajoutez votre clé IA dans Compte > Assistant V.',
      );
  String get vAiError => _s(
        'No pude consultar a la IA. Revisa la clave o tu conexión.',
        'I could not reach the AI. Check the key or your connection.',
        'Impossible de joindre l\'IA. Vérifiez la clé ou votre connexion.',
      );
  String vClarify(String transcript) => _s(
        'No estoy segura de lo que necesitas con "$transcript". '
            '?Quieres que ejecute un comando, guarde una nota o responda una pregunta?',
        'I am not sure what you need with "$transcript". '
            'Do you want me to run a command, save a note, or answer a question?',
        'Je ne suis pas sure de ce que vous voulez avec "$transcript". '
            'Une commande, une note ou une reponse a une question?',
      );
  String get micPermissionNeeded => _s(
        'V necesita permiso de micrófono y reconocimiento de voz. '
            'Activalos en Ajustes del sistema.',
        'V needs microphone and speech recognition permission. '
            'Enable them in system Settings.',
        'V a besoin du micro et de la reconnaissance vocale. '
            'Activez-les dans les Réglages du système.',
      );

  // --- Manual de usuario ---
  String get manualButton =>
      _s('Manual de uso', 'User manual', 'Mode d\'emploi');
  // --- Onboarding (primer uso) ---
  String get onbSkip => _s('Saltar', 'Skip', 'Passer');
  String get onbNext => _s('Siguiente', 'Next', 'Suivant');
  String get onbStart => _s('Empezar', 'Get started', 'Commencer');
  String get onbWelcomeTitle =>
      _s('Bienvenido a Vibe', 'Welcome to Vibe', 'Bienvenue sur Vibe');
  String get onbWelcomeBody => _s(
        'Captura tus experiencias —notas, fotos, audio, ubicación y salud— y deja que V te ayude por voz.',
        'Capture your experiences —notes, photos, audio, location and health— and let V help you by voice.',
        'Capturez vos expériences —notes, photos, audio, position et santé— et laissez V vous aider par la voix.',
      );
  String get onbVTitle => _s('Habla con V', 'Talk to V', 'Parlez à V');
  String get onbVBody => _s(
        'Toca el micrófono y pide lo que quieras: "toma una foto", "qué anoté hoy", "resumen del día". V recuerda la conversación.',
        'Tap the mic and ask for anything: "take a photo", "what did I note today", "daily briefing". V remembers the conversation.',
        'Touchez le micro et demandez : "prends une photo", "qu\'ai-je noté", "résumé du jour". V se souvient de la conversation.',
      );
  String get onbCaptureTitle =>
      _s('Captura en un toque', 'Capture in one tap', 'Capturez en un geste');
  String get onbCaptureBody => _s(
        'Nota, foto, vídeo, audio, ubicación. Todo se guarda en tu dispositivo y se sincroniza con tu cuenta.',
        'Note, photo, video, audio, location. Everything is saved on your device and synced to your account.',
        'Note, photo, vidéo, audio, position. Tout est enregistré sur votre appareil et synchronisé.',
      );
  String get onbHealthTitle =>
      _s('Salud y wearables', 'Health and wearables', 'Santé et wearables');
  String get onbHealthBody => _s(
        'Conecta Apple Salud y tu anillo Oura para ver pasos, sueño y preparación, y pregúntaselo a V.',
        'Connect Apple Health and your Oura ring to see steps, sleep and readiness, and ask V about them.',
        'Connectez Apple Santé et votre anneau Oura pour voir pas, sommeil et préparation, et demandez à V.',
      );
  String get manualTitle =>
      _s('Manual de uso de Vibeapp', 'Vibeapp user manual',
          'Mode d\'emploi de Vibeapp');
  String get manualIntro => _s(
        'Vibeapp captura tus experiencias y las sincroniza con tu cuenta. '
            'Esta guía explica cada sección y cómo sacar el máximo a V.',
        'Vibeapp captures your experiences and syncs them with your account. '
            'This guide explains each section and how to get the most from V.',
        'Vibeapp capture vos expériences et les synchronise avec votre compte. '
            'Ce guide explique chaque section et comment tirer le meilleur de V.',
      );
  String get manualSectionsTitle =>
      _s('Las secciones', 'The sections', 'Les sections');
  String get manualSectionsBody => _s(
        'Inicio: resumen y acceso rápido. Capturar: nota, foto, vídeo, audio, '
            'ubicación y biometría. Guardados: tus experiencias. Archivos: tus '
            'medios. Agenda: tus eventos. Estado: la cola de sincronización. '
            'Cuenta: tu sesión y los ajustes del asistente.',
        'Home: summary and quick access. Capture: note, photo, video, audio, '
            'location and biometrics. Saved: your experiences. Files: your '
            'media. Agenda: your events. Status: the sync queue. Account: your '
            'session and the assistant settings.',
        'Accueil: résumé et accès rapide. Capturer: note, photo, vidéo, audio, '
            'position et biométrie. Enregistrés: vos expériences. Fichiers: vos '
            'médias. Agenda: vos événements. État: la file de synchronisation. '
            'Compte: votre session et les paramètres de l\'assistant.',
      );
  String get manualAssistantTitle =>
      _s('Asistente V', 'V assistant', 'Assistant V');
  String get manualAssistantBody => _s(
        'Toca "Hablar con V" o el micrófono y habla con naturalidad. V entiende '
            'variaciones: "saca una foto", "abre la cámara" o "tómale una foto" '
            'hacen lo mismo. Puedes navegar ("ve a la agenda"), capturar ("toma '
            'nota de..."), preguntar por tu salud ("cuántos pasos llevo"), pedir '
            'ayuda ("qué puedes hacer"), abrir el manual ("abre el manual") o '
            'hacer preguntas generales si configuraste la clave de IA. Si la '
            'escucha persistente está activada, V empieza a escuchar sola al '
            'abrir la app. Para detenerla, di "desactivar V".',
        'Tap "Talk to V" or the microphone and speak naturally. V understands '
            'variations: "take a photo", "open the camera" or "snap a picture" '
            'all do the same. You can navigate ("go to the agenda"), capture '
            '("take a note about..."), or ask general questions if you set the '
            'AI key. To stop it, say "stop V".',
        'Touchez "Parler avec V" ou le micro et parlez naturellement. V comprend '
            'les variantes: "prends une photo", "ouvre l\'appareil" font la même '
            'chose. Vous pouvez naviguer ("va à l\'agenda"), capturer ("prends '
            'note de..."), ou poser des questions si la clé IA est configurée. '
            'Pour l\'arrêter, dites "désactiver V".',
      );
  String get manualVoiceTitle =>
      _s('Voz e idioma', 'Voice and language', 'Voix et langue');
  String get manualVoiceBody => _s(
        'En Cuenta > Asistente V eliges el idioma (cambia toda la app), la voz '
            '(hombre o mujer) y pegas tu clave de IA. Usa "Probar voz" para '
            'escuchar el resultado.',
        'In Account > V assistant you pick the language (changes the whole app), '
            'the voice (male or female) and paste your AI key. Use "Test voice" '
            'to hear the result.',
        'Dans Compte > Assistant V, vous choisissez la langue (change toute '
            'l\'application), la voix (homme ou femme) et collez votre clé IA. '
            'Utilisez "Tester la voix" pour écouter le résultat.',
      );
  String get manualHealthTitle =>
      _s('Salud y wearables', 'Health and wearables', 'Santé et wearables');
  String get manualHealthBody => _s(
        'En Cuenta > Salud toca "Conectar salud" y acepta el permiso de Apple Salud (en iOS) una sola vez. Verás tus pasos, ritmo, energía y sueño de hoy. Si pegas tu token de Oura, se añaden preparación, puntaje de sueño, HRV y ritmo en reposo del anillo. Los datos se leen en vivo, se cargan solos al abrir y se envían una vez al día a tu cuenta para actualizar VibePWA. Pregúntale a V "cuántos pasos llevo" o "cómo dormí".',
        'In Account > Health tap "Connect health" and grant the Apple Health permission (on iOS) once. You will see today\'s steps, heart rate, energy and sleep. If you paste your Oura token, the ring adds readiness, sleep score, HRV and resting heart rate. Data is read live, loads on open and is sent once a day to your account to update VibePWA. Ask V "how many steps" or "how did I sleep".',
        'Dans Compte > Santé, touchez "Connecter la santé" et accordez l\'autorisation Apple Santé (sur iOS) une fois. Vous verrez pas, rythme, énergie et sommeil du jour. Avec votre jeton Oura, l\'anneau ajoute préparation, score de sommeil, VFC et rythme au repos. Les données sont lues en direct, chargées à l\'ouverture et envoyées une fois par jour à votre compte pour mettre à jour VibePWA. Demandez à V "combien de pas" ou "comment ai-je dormi".',
      );
  String get manualPermissionsTitle =>
      _s('Permisos', 'Permissions', 'Autorisations');
  String get manualPermissionsBody => _s(
        'V usa micrófono y reconocimiento de voz. La cámara, la galería y la '
            'ubicación solo se usan cuando lo pides. Puedes revisarlos en los '
            'Ajustes del sistema.',
        'V uses the microphone and speech recognition. The camera, library and '
            'location are only used when you ask. You can review them in system '
            'Settings.',
        'V utilise le micro et la reconnaissance vocale. L\'appareil photo, la '
            'galerie et la position ne sont utilisés que sur demande. Vérifiez-les '
            'dans les Réglages du système.',
      );
  String get manualSyncTitle =>
      _s('Sincronización y cuenta', 'Sync and account',
          'Synchronisation et compte');
  String get manualSyncBody => _s(
        'Entra con tu cuenta para sincronizar. Lo que capturas se guarda primero '
            'en el dispositivo y se envía cuando hay sesión y conexión. En Estado '
            'puedes reintentar o limpiar pruebas locales.',
        'Sign in to sync. What you capture is saved on the device first and sent '
            'when there is a session and connection. In Status you can retry or '
            'clear local tests.',
        'Connectez-vous pour synchroniser. Vos captures sont d\'abord '
            'enregistrées sur l\'appareil puis envoyées quand une session et une '
            'connexion existent. Dans État vous pouvez relancer ou nettoyer.',
      );
  String get manualTroubleTitle => _s('Solución de problemas', 'Troubleshooting',
      'Dépannage');
  String get manualTroubleBody => _s(
        'Si V no escucha, revisa los permisos y vuelve a tocar el micrófono. '
            'Si no responde preguntas, confirma la clave de IA. Si algo no '
            'sincroniza, verifica el backend y tu sesión en Estado y Cuenta.',
        'If V does not hear you, check permissions and tap the microphone again. '
            'If it does not answer questions, confirm the AI key. If something '
            'does not sync, check the backend and your session in Status and '
            'Account.',
        'Si V ne vous entend pas, vérifiez les autorisations et touchez de '
            'nouveau le micro. Si elle ne répond pas, confirmez la clé IA. Si la '
            'synchronisation échoue, vérifiez le backend et la session.',
      );
}

// ===================================================================
// ===== ASSISTANT (motor de intencion, IA, voz) =====================
// ===================================================================

/// Intenciones reconocibles por V.
enum VibeIntent {
  deactivate,
  navHome,
  navCapture,
  navSaved,
  navAssets,
  navAgenda,
  navStatus,
  navAccount,
  photo,
  video,
  audio,
  biometrics,
  location,
  sync,
  verifyBackend,
  clearSynced,
  clearLocalTests,
  resetLocal,
  importExternal,
  healthConnect,
  health,
  openManual,
  help,
  dailyBriefing,
  queryCaptures,
  takeNote,
  askQuestion,
  unknown,
}

class IntentMatch {
  const IntentMatch(this.intent, this.score, {this.slotText = ''});
  final VibeIntent intent;
  final double score;
  final String slotText;
}

/// Motor de intencion tolerante: en lugar de exigir frases exactas, puntua el
/// transcrito contra un vocabulario multilingue (solape de palabras + subcadena
/// + parecido difuso) y, bajo umbral, devuelve [VibeIntent.unknown] para que V
/// pida aclaracion en vez de fallar en silencio.
class IntentEngine {
  IntentEngine();

  static const double threshold = 0.52;

  // Vocabulario por intencion (en los tres idiomas, sin acentos).
  static const Map<VibeIntent, List<String>> _vocab = {
    VibeIntent.deactivate: [
      'desactivar v', 'apagar v', 'detener v', 'cancelar v', 'salir de v',
      'turn off v', 'stop v', 'disable v', 'cancel v',
      'arreter v', 'desactiver v', 'eteindre v',
    ],
    VibeIntent.navHome: ['inicio', 'ir a inicio', 'home', 'go home', 'accueil'],
    VibeIntent.navCapture: [
      'capturar', 'ir a captura', 'nueva captura', 'capture', 'capturer'
    ],
    VibeIntent.navSaved: [
      'guardados', 'biblioteca', 'mis experiencias', 'library', 'saved',
      'enregistres', 'bibliotheque'
    ],
    VibeIntent.navAssets: [
      'archivos', 'medios', 'assets', 'files', 'media', 'fichiers'
    ],
    VibeIntent.navAgenda: [
      've a la agenda', 'ver agenda', 'mi agenda', 'agenda', 'calendario',
      'calendar', 'schedule'
    ],
    VibeIntent.navStatus: [
      'estado', 'sincronizacion', 'status', 'sync status', 'etat'
    ],
    VibeIntent.navAccount: [
      'cuenta', 'ajustes', 'configuracion', 'account', 'settings',
      'login', 'compte', 'parametres'
    ],
    VibeIntent.photo: [
      'foto', 'una foto', 'saca una foto', 'tomar foto', 'abre la camara',
      'abrir camara', 'photo', 'take a photo', 'picture', 'snap', 'camera',
      'prendre photo', 'prends une photo', 'appareil photo'
    ],
    VibeIntent.video: [
      'video', 'graba video', 'graba un video', 'filma', 'record video',
      'take a video', 'filmer', 'enregistrer video'
    ],
    VibeIntent.audio: [
      'audio', 'graba audio', 'nota de voz', 'memo de voz', 'record audio',
      'voice note', 'memo vocal', 'enregistrer audio'
    ],
    VibeIntent.biometrics: [
      'importar biometria', 'importar archivo biometrico', 'archivo biometrico',
      'importar csv', 'import biometrics', 'import biometric file',
      'importer biometrie', 'fichier biometrique'
    ],
    VibeIntent.location: [
      'ubicacion', 'mi ubicacion', 'lugar', 'donde estoy', 'location',
      'where am i', 'position', 'localisation', 'ou suis je'
    ],
    VibeIntent.sync: [
      'sincronizar', 'sincroniza', 'sube', 'envia', 'sync', 'retry sync',
      'reintentar', 'reenviar', 'synchroniser'
    ],
    VibeIntent.verifyBackend: [
      'verificar backend', 'verifica backend', 'estado del servidor',
      'backend', 'health check', 'api health', 'verifier backend'
    ],
    VibeIntent.clearSynced: [
      'limpiar sincronizadas', 'limpia sincronizadas', 'clear synced',
      'clear completed', 'nettoyer synchronisees'
    ],
    VibeIntent.clearLocalTests: [
      'borrar pruebas locales', 'limpiar pruebas locales', 'borrar basura local',
      'clear local tests', 'delete local tests', 'supprimer tests locaux'
    ],
    VibeIntent.resetLocal: [
      'reset local', 'reiniciar pruebas', 'reset pruebas', 'reset local tests',
      'reinitialiser tests'
    ],
    VibeIntent.importExternal: [
      'importar externo', 'importar sesion', 'external import', 'import session',
      'meta', 'oakley', 'importer session'
    ],
    VibeIntent.healthConnect: [
      'health connect', 'samsung health', 'preparar health connect',
      'preparer health connect'
    ],
    VibeIntent.health: [
      'mi salud', 'resumen de salud', 'cuantos pasos', 'mis pasos', 'pasos de hoy',
      'ritmo cardiaco', 'pulso', 'frecuencia cardiaca', 'cuanto dormi', 'mi sueno',
      'calorias', 'energia activa',
      'my health', 'health summary', 'how many steps', 'my steps', 'heart rate',
      'how did i sleep', 'my sleep', 'calories', 'active energy',
      'ma sante', 'mes pas', 'rythme cardiaque', 'mon sommeil'
    ],
    VibeIntent.openManual: [
      'abre el manual', 'abrir manual', 'manual de usuario', 'muestra el manual',
      'open manual', 'user manual', 'show manual', 'ouvrir le manuel',
      'manuel utilisateur'
    ],
    VibeIntent.help: [
      'ayuda', 'que puedes hacer', 'que sabes hacer', 'comandos', 'que comandos',
      'help', 'what can you do', 'commands', 'aide', 'que peux tu faire',
      'commandes'
    ],
    VibeIntent.dailyBriefing: [
      'resumen del dia', 'mi resumen', 'briefing', 'como va mi dia',
      'que tengo hoy', 'resumen diario', 'ponme al dia',
      'daily summary', 'my day', 'brief me', 'how is my day', 'whats up today',
      'resume du jour', 'mon resume', 'ma journee'
    ],
    VibeIntent.queryCaptures: [
      'que anote', 'que anote hoy', 'que capture', 'que capture hoy',
      'cuantas notas llevo', 'cuantas capturas', 'mis capturas', 'mis notas',
      'que he guardado', 'que tengo guardado',
      'what did i note', 'what did i capture', 'how many notes', 'my captures',
      'my notes', 'what did i save',
      'qu\'ai je note', 'mes captures', 'mes notes', 'combien de notes'
    ],
    VibeIntent.takeNote: [
      'toma nota', 'tomar nota', 'anota', 'nota que', 'guarda esto', 'apunta',
      'take note', 'note that', 'save this', 'write down',
      'prends note', 'note que', 'enregistre ceci'
    ],
  };

  /// Clasifica un transcrito ya normalizado (minusculas, sin acentos).
  IntentMatch classify(String normalized, AppLanguage lang) {
    final text = normalized.trim();
    if (text.isEmpty) return const IntentMatch(VibeIntent.unknown, 0);

    // 1) Desactivacion siempre tiene prioridad.
    if (_scoreFor(text, VibeIntent.deactivate) >= 0.6) {
      return const IntentMatch(VibeIntent.deactivate, 1);
    }

    // 2) Mejor comando por puntuacion.
    VibeIntent best = VibeIntent.unknown;
    double bestScore = 0;
    for (final intent in _vocab.keys) {
      if (intent == VibeIntent.deactivate || intent == VibeIntent.takeNote) {
        continue;
      }
      final s = _scoreFor(text, intent);
      if (s > bestScore) {
        bestScore = s;
        best = intent;
      }
    }

    // 3) Nota explicita.
    final noteScore = _scoreFor(text, VibeIntent.takeNote);
    if (noteScore >= threshold && noteScore >= bestScore) {
      return IntentMatch(VibeIntent.takeNote, noteScore, slotText: text);
    }

    if (bestScore >= threshold) {
      return IntentMatch(best, bestScore);
    }

    // 4) Pregunta a la IA (interrogativa).
    if (_looksLikeQuestion(text, lang)) {
      return IntentMatch(VibeIntent.askQuestion, 0.6, slotText: text);
    }

    return IntentMatch(VibeIntent.unknown, bestScore, slotText: text);
  }

  double _scoreFor(String text, VibeIntent intent) {
    final phrases = _vocab[intent] ?? const [];
    double best = 0;
    for (final phrase in phrases) {
      final s = _phraseScore(text, phrase);
      if (s > best) best = s;
    }
    return best;
  }

  double _phraseScore(String text, String phrase) {
    if (text.contains(phrase)) return 1;
    final textTokens = text.split(RegExp(r'\s+')).where((t) => t.isNotEmpty);
    final phraseTokens =
        phrase.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();
    if (phraseTokens.isEmpty) return 0;
    int hits = 0;
    for (final pt in phraseTokens) {
      for (final tt in textTokens) {
        if (tt == pt ||
            (pt.length >= 4 && tt.contains(pt)) ||
            (pt.length >= 4 && _similar(tt, pt))) {
          hits++;
          break;
        }
      }
    }
    return hits / phraseTokens.length;
  }

  bool _similar(String a, String b) {
    final d = _levenshtein(a, b);
    final maxLen = a.length > b.length ? a.length : b.length;
    if (maxLen == 0) return false;
    return (1 - d / maxLen) >= 0.8;
  }

  int _levenshtein(String a, String b) {
    final m = a.length, n = b.length;
    if (m == 0) return n;
    if (n == 0) return m;
    final prev = List<int>.generate(n + 1, (i) => i);
    final curr = List<int>.filled(n + 1, 0);
    for (int i = 1; i <= m; i++) {
      curr[0] = i;
      for (int j = 1; j <= n; j++) {
        final cost = a[i - 1] == b[j - 1] ? 0 : 1;
        final del = prev[j] + 1;
        final ins = curr[j - 1] + 1;
        final sub = prev[j - 1] + cost;
        curr[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
      }
      for (int j = 0; j <= n; j++) {
        prev[j] = curr[j];
      }
    }
    return prev[n];
  }

  bool _looksLikeQuestion(String text, AppLanguage lang) {
    if (text.endsWith('?')) return true;
    const starters = [
      'que', 'qué', 'como', 'cómo', 'cuando', 'cuándo', 'cuanto', 'cuánto',
      'por que', 'porque', 'quien', 'quién', 'donde', 'dónde', 'cual', 'cuál',
      'what', 'how', 'why', 'who', 'where', 'when', 'which', 'is', 'are', 'can',
      'do', 'does', 'should', 'tell me', 'explain',
      'quoi', 'comment', 'pourquoi', 'qui', 'ou', 'quand', 'combien',
      'quel', 'quelle', 'est ce que',
    ];
    for (final s in starters) {
      if (text == s || text.startsWith('$s ')) return true;
    }
    return false;
  }
}

/// Cliente de IA INDEPENDIENTE del backend de Vibe. Usa su propio [HttpClient]
/// contra la API publica de Anthropic. Nunca lee el token de sesion ni llama a
/// ExperienceSyncClient/VibeAuthClient.
class ClaudeAssistantClient {
  ClaudeAssistantClient(
    this.apiKey, {
    this.model = 'claude-haiku-4-5',
    this.baseUrl = 'https://api.anthropic.com',
    this.maxTokens = 600,
  });

  final String apiKey;
  final String model;
  final String baseUrl;
  final int maxTokens;

  bool get isConfigured => apiKey.trim().isNotEmpty;

  String _langName(AppLanguage lang) => switch (lang) {
        AppLanguage.spanish => 'espanol',
        AppLanguage.english => 'English',
        AppLanguage.french => 'francais',
      };

  String _nowIso() {
    final now = DateTime.now();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${now.year}-${two(now.month)}-${two(now.day)} '
        '${two(now.hour)}:${two(now.minute)}';
  }

  /// POST generico a /v1/messages. Devuelve el texto de la respuesta.
  /// [history] es el contexto de conversacion previo (lista de {role, text} con
  /// roles 'user'/'assistant' alternados), para que V recuerde el hilo.
  Future<String> _post(String system, String userText,
      {int? maxTok, List<Map<String, String>> history = const []}) async {
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 10);
    try {
      final uri = Uri.parse('$baseUrl/v1/messages');
      final request = await client.postUrl(uri);
      request.headers.set('content-type', 'application/json');
      request.headers.set('x-api-key', apiKey.trim());
      request.headers.set('anthropic-version', '2023-06-01');
      final messages = <Map<String, dynamic>>[
        for (final h in history)
          {'role': h['role'], 'content': h['text'] ?? ''},
        {'role': 'user', 'content': userText},
      ];
      final payload = <String, dynamic>{
        'model': model,
        'max_tokens': maxTok ?? maxTokens,
        'system': system,
        'messages': messages,
      };
      request.add(utf8.encode(jsonEncode(payload)));
      final response =
          await request.close().timeout(const Duration(seconds: 30));
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        String detail = body;
        try {
          final err = jsonDecode(body);
          if (err is Map &&
              err['error'] is Map &&
              err['error']['message'] is String) {
            detail = err['error']['message'] as String;
          }
        } catch (_) {}
        throw HttpException('${response.statusCode}: $detail');
      }
      final decoded = jsonDecode(body);
      final content = decoded is Map ? decoded['content'] : null;
      if (content is List && content.isNotEmpty) {
        final first = content.first;
        if (first is Map && first['text'] is String) {
          return (first['text'] as String).trim();
        }
      }
      throw const HttpException('Respuesta de IA sin texto.');
    } finally {
      client.close(force: true);
    }
  }

  /// Q&A libre. [history] da contexto de los turnos previos de la sesion.
  Future<String> ask(String question,
      {required AppLanguage lang,
      List<Map<String, String>> history = const []}) {
    final system = 'Eres V, un asistente de voz dentro de la app Vibeapp. '
        'Responde de forma breve, clara y util. Responde siempre en '
        '${_langName(lang)}. Evita listas largas; habla como en una conversacion. '
        'Tienes memoria de los turnos previos de esta sesion: usa ese contexto '
        'para resolver referencias como "y eso", "lo anterior" o "y manana". '
        'La fecha y hora local actual del usuario es ${_nowIso()} '
        '(usala para preguntas de fecha, hora o dia de la semana).';
    return _post(system, question, history: history);
  }

  /// Tool-calling: dada una frase, la IA elige UNA accion de la app o responde.
  /// Devuelve {action, note, answer}. `action` es uno de los nombres de
  /// VibeIntent o "answer".
  Future<Map<String, dynamic>> routeIntent(String utterance,
      {required AppLanguage lang,
      List<Map<String, String>> history = const []}) async {
    const actions =
        'photo, video, audio, biometrics, location, takeNote, sync, '
        'verifyBackend, navHome, navCapture, navSaved, navAssets, navAgenda, '
        'navStatus, navAccount, deactivate, clearSynced, clearLocalTests, '
        'resetLocal, importExternal, healthConnect, health, openManual, '
        'help, dailyBriefing, queryCaptures, answer';
    final system =
        'Eres el enrutador de intenciones de V, el asistente de la app Vibeapp. '
        'Dada la frase del usuario, elige UNA accion de esta lista: $actions. '
        'Usa "takeNote" si el usuario quiere guardar/anotar algo (pon el texto en '
        '"note"). Usa "answer" si es una pregunta o charla general (pon la '
        'respuesta, en ${_langName(lang)} y breve, en "answer"). '
        'La fecha y hora local es ${_nowIso()}. '
        'Responde SOLO con un objeto JSON valido, sin texto extra, con las '
        'claves: action, note, answer. Si no aplican note/answer, usa "". '
        'Tienes memoria de los turnos previos: usa ese contexto para resolver '
        'referencias (p.ej. "y mis pasos", "ponle de titulo lo anterior").';
    final raw = await _post(system, utterance, maxTok: 700, history: history);
    return _extractJson(raw);
  }

  /// Mejora una nota dictada: corrige ortografia/puntuacion, la estructura
  /// brevemente y agrega un titulo corto en la primera linea. Devuelve el texto
  /// mejorado listo para reemplazar la nota.
  Future<String> improveNote(String text, {required AppLanguage lang}) {
    final system =
        'Eres un editor de notas dentro de Vibeapp. Mejora la nota del usuario: '
        'corrige ortografia y puntuacion, ordena las ideas de forma breve y '
        'clara, y agrega en la PRIMERA linea un titulo corto (sin la palabra '
        '"titulo"). Conserva el sentido y los datos; no inventes. Responde en '
        '${_langName(lang)} y devuelve SOLO la nota mejorada, sin comentarios.';
    return _post(system, text, maxTok: 800);
  }

  Map<String, dynamic> _extractJson(String raw) {
    final start = raw.indexOf('{');
    final end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        final obj = jsonDecode(raw.substring(start, end + 1));
        if (obj is Map<String, dynamic>) return obj;
      } catch (_) {}
    }
    // Si no vino JSON, lo tratamos como respuesta libre.
    return {'action': 'answer', 'note': '', 'answer': raw};
  }
}

/// Cliente MCP (Model Context Protocol) hacia CLIO — BORRADOR. Subsistema
/// independiente del backend de Vibe: su propio HttpClient + Bearer token contra
/// el servidor MCP de CLIO (p.ej. https://mcp.clioapp.io). Habla JSON-RPC sobre
/// HTTP (Streamable HTTP); tolera respuesta JSON o SSE. Cuando Miguel facilite
/// el endpoint + token reales, se afina el handshake. NO toca el backend de Vibe.
class VibeClioClient {
  VibeClioClient(this.baseUrl, this.token);

  final String baseUrl; // URL del servidor MCP de CLIO
  final String token; // Bearer token / access token

  bool get isConfigured =>
      baseUrl.trim().isNotEmpty && token.trim().isNotEmpty;

  /// POST JSON-RPC al endpoint MCP. Devuelve el `result` decodificado.
  Future<dynamic> _rpc(String method, [Map<String, dynamic>? params]) async {
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 10);
    try {
      final request = await client.postUrl(Uri.parse(baseUrl.trim()));
      request.headers.set('content-type', 'application/json');
      request.headers.set('accept', 'application/json, text/event-stream');
      request.headers.set('authorization', 'Bearer ${token.trim()}');
      final payload = <String, dynamic>{
        'jsonrpc': '2.0',
        'id': 1,
        'method': method,
        if (params != null) 'params': params,
      };
      request.add(utf8.encode(jsonEncode(payload)));
      final response =
          await request.close().timeout(const Duration(seconds: 25));
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('${response.statusCode}: $body');
      }
      // La respuesta puede venir como JSON puro o como SSE (event-stream).
      final jsonText = _extractJsonRpc(body);
      final decoded = jsonDecode(jsonText);
      if (decoded is Map && decoded['error'] != null) {
        throw HttpException('MCP error: ${jsonEncode(decoded['error'])}');
      }
      return decoded is Map ? decoded['result'] : decoded;
    } finally {
      client.close(force: true);
    }
  }

  /// Extrae el primer objeto JSON-RPC de una respuesta JSON o SSE.
  String _extractJsonRpc(String body) {
    final trimmed = body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
    // SSE: lineas "data: {...}"
    for (final line in const LineSplitter().convert(body)) {
      final l = line.trim();
      if (l.startsWith('data:')) {
        final d = l.substring(5).trim();
        if (d.startsWith('{')) return d;
      }
    }
    return trimmed;
  }

  /// Lista las herramientas que expone el MCP de CLIO. Devuelve sus nombres.
  Future<List<String>> listTools() async {
    final result = await _rpc('tools/list');
    final tools = (result is Map ? result['tools'] : null);
    if (tools is List) {
      return tools
          .map((t) => t is Map ? '${t['name']}' : '$t')
          .where((s) => s.isNotEmpty)
          .toList();
    }
    return const [];
  }

  /// Invoca una herramienta del MCP de CLIO.
  Future<dynamic> callTool(String name, Map<String, dynamic> args) {
    return _rpc('tools/call', {'name': name, 'arguments': args});
  }
}

/// Cliente de transcripcion de audio (OpenAI Whisper por defecto). Subsistema
/// independiente del backend de Vibe: su propio HttpClient + Bearer key. Sube el
/// archivo de audio como multipart/form-data y devuelve el texto. Configurable
/// por si se usa otro proveedor compatible (mismo formato).
class VibeTranscriber {
  VibeTranscriber(
    this.apiKey, {
    this.baseUrl = 'https://api.openai.com',
    this.model = 'whisper-1',
  });

  final String apiKey;
  final String baseUrl;
  final String model;

  bool get isConfigured => apiKey.trim().isNotEmpty;

  Future<String> transcribe(String filePath) async {
    final file = File(filePath);
    if (!await file.exists()) {
      throw const FileSystemException('Audio no encontrado para transcribir.');
    }
    final bytes = await file.readAsBytes();
    final name = file.uri.pathSegments.isNotEmpty
        ? file.uri.pathSegments.last
        : 'audio.m4a';
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 15);
    try {
      final request = await client
          .postUrl(Uri.parse('$baseUrl/v1/audio/transcriptions'));
      final boundary =
          '----vibe${DateTime.now().microsecondsSinceEpoch}';
      request.headers
          .set('content-type', 'multipart/form-data; boundary=$boundary');
      request.headers.set('authorization', 'Bearer ${apiKey.trim()}');
      final pre = StringBuffer()
        ..write('--$boundary\r\n')
        ..write('Content-Disposition: form-data; name="model"\r\n\r\n')
        ..write('$model\r\n')
        ..write('--$boundary\r\n')
        ..write(
            'Content-Disposition: form-data; name="file"; filename="$name"\r\n')
        ..write('Content-Type: application/octet-stream\r\n\r\n');
      request.add(utf8.encode(pre.toString()));
      request.add(bytes);
      request.add(utf8.encode('\r\n--$boundary--\r\n'));
      final response =
          await request.close().timeout(const Duration(seconds: 90));
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('${response.statusCode}: $body');
      }
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['text'] is String) {
        return (decoded['text'] as String).trim();
      }
      throw const HttpException('Respuesta de transcripcion sin texto.');
    } finally {
      client.close(force: true);
    }
  }
}

/// Estado de la conexion con las gafas inteligentes.
enum GlassesStatus { unavailable, disconnected, connecting, connected }

/// Andamiaje para gafas inteligentes (Ray-Ban Meta / Oakley) — A LA ESPERA del
/// plugin nativo. Habla con un plugin Flutter con puente al Meta Wearables
/// Device Access Toolkit a traves de [MethodChannel]/[EventChannel]. Mientras el
/// lado NATIVO no este implementado, las llamadas lanzan MissingPluginException
/// y se reportan como `unavailable` (la UI lo muestra como "pendiente del
/// plugin"). Cuando llegue el plugin de CLIO (o uno propio sobre Meta DAT), solo
/// hay que implementar el lado nativo con estos mismos nombres de canal/metodos.
class VibeGlasses {
  static const MethodChannel _channel = MethodChannel('vibeapp/glasses');
  static const EventChannel _events = EventChannel('vibeapp/glasses/events');

  /// Stream de eventos de las gafas (estado, frames, audio). Vacio hasta que el
  /// plugin nativo lo alimente.
  Stream<dynamic> get events => _events.receiveBroadcastStream();

  Future<bool> isAvailable() async {
    try {
      final r = await _channel.invokeMethod<bool>('isAvailable');
      return r ?? false;
    } catch (_) {
      return false; // sin plugin nativo todavia
    }
  }

  /// Intenta conectar con las gafas. Devuelve el estado resultante.
  Future<GlassesStatus> connect() async {
    try {
      final r = await _channel.invokeMethod<String>('connect');
      return _statusFromString(r);
    } on MissingPluginException {
      return GlassesStatus.unavailable;
    } catch (_) {
      return GlassesStatus.disconnected;
    }
  }

  Future<void> disconnect() async {
    try {
      await _channel.invokeMethod('disconnect');
    } catch (_) {}
  }

  Future<GlassesStatus> status() async {
    try {
      final r = await _channel.invokeMethod<String>('status');
      return _statusFromString(r);
    } catch (_) {
      return GlassesStatus.unavailable;
    }
  }

  /// Toma una foto con la camara de las gafas. Devuelve la ruta del archivo, o
  /// null si no esta disponible.
  Future<String?> capturePhoto() async {
    try {
      return await _channel.invokeMethod<String>('capturePhoto');
    } catch (_) {
      return null;
    }
  }

  Future<bool> startCameraStream() async {
    try {
      final r = await _channel.invokeMethod<bool>('startCameraStream');
      return r ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<void> stopCameraStream() async {
    try {
      await _channel.invokeMethod('stopCameraStream');
    } catch (_) {}
  }

  GlassesStatus _statusFromString(String? s) {
    switch (s) {
      case 'connected':
        return GlassesStatus.connected;
      case 'connecting':
        return GlassesStatus.connecting;
      case 'disconnected':
        return GlassesStatus.disconnected;
      default:
        return GlassesStatus.unavailable;
    }
  }
}

/// Genero de voz seleccionable para las respuestas habladas de V.
enum VoiceGender { female, male }

/// Resumen de salud del dia (HealthKit en iOS, Health Connect en Android).
/// Los campos *Oura* (readiness, sleepScore, hrv, restingHeartRate) provienen
/// del anillo Oura via su API v2 y son complementarios a los de HealthKit.
class HealthSummary {
  const HealthSummary({
    this.steps,
    this.heartRate,
    this.activeEnergyKcal,
    this.sleepHours,
    this.readinessScore,
    this.sleepScore,
    this.hrv,
    this.restingHeartRate,
  });
  final int? steps;
  final double? heartRate;
  final double? activeEnergyKcal;
  final double? sleepHours;
  final int? readinessScore;
  final int? sleepScore;
  final double? hrv;
  final double? restingHeartRate;

  bool get hasAny =>
      steps != null ||
      heartRate != null ||
      activeEnergyKcal != null ||
      sleepHours != null ||
      hasOura;

  bool get hasOura =>
      readinessScore != null ||
      sleepScore != null ||
      hrv != null ||
      restingHeartRate != null;

  /// Combina este resumen (HealthKit) con los datos del anillo Oura.
  /// El sueno de Oura tiene prioridad si HealthKit no lo trae.
  HealthSummary mergeOura(HealthSummary o) => HealthSummary(
        steps: steps,
        heartRate: heartRate,
        activeEnergyKcal: activeEnergyKcal,
        sleepHours: sleepHours ?? o.sleepHours,
        readinessScore: o.readinessScore,
        sleepScore: o.sleepScore,
        hrv: o.hrv,
        restingHeartRate: o.restingHeartRate,
      );
}

/// Cliente independiente de la Oura Cloud API v2 (anillo Oura). Usa su propio
/// HttpClient con Bearer token; NO toca el backend de Vibe. Solo lectura.
/// Datos: readiness, sleep score, horas de sueno, HRV, ritmo en reposo.
class VibeOura {
  VibeOura(this.token, {this.baseUrl = 'https://api.ouraring.com'});

  final String token;
  final String baseUrl;

  bool get isConfigured => token.trim().isNotEmpty;

  String _date(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)}';
  }

  /// GET a una coleccion de Oura entre [start] y [end]; devuelve la lista `data`.
  Future<List<dynamic>> _get(
      String collection, DateTime start, DateTime end) async {
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 10);
    try {
      final uri = Uri.parse(
          '$baseUrl/v2/usercollection/$collection'
          '?start_date=${_date(start)}&end_date=${_date(end)}');
      final request = await client.getUrl(uri);
      request.headers.set('Authorization', 'Bearer ${token.trim()}');
      final response =
          await request.close().timeout(const Duration(seconds: 20));
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('${response.statusCode}: $body');
      }
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['data'] is List) {
        return decoded['data'] as List<dynamic>;
      }
      return const [];
    } finally {
      client.close(force: true);
    }
  }

  num? _lastNum(List<dynamic> data, String key) {
    for (final item in data.reversed) {
      if (item is Map && item[key] is num) return item[key] as num;
    }
    return null;
  }

  /// Resumen de la noche/dia mas reciente. Campos null si no hay dato/permiso.
  Future<HealthSummary> todaySummary() async {
    final now = DateTime.now();
    // El sueno de "anoche" se reporta con la fecha de hoy; pedimos una ventana
    // de 2 dias y tomamos el registro mas reciente de cada coleccion.
    final start = now.subtract(const Duration(days: 1));
    int? readiness;
    int? sleepScore;
    double? sleepHours;
    double? hrv;
    double? restingHr;
    try {
      final r = await _get('daily_readiness', start, now);
      final rs = _lastNum(r, 'score');
      if (rs != null) readiness = rs.round();
    } catch (_) {}
    try {
      final ds = await _get('daily_sleep', start, now);
      final ss = _lastNum(ds, 'score');
      if (ss != null) sleepScore = ss.round();
    } catch (_) {}
    try {
      final sleep = await _get('sleep', start, now);
      final secs = _lastNum(sleep, 'total_sleep_duration');
      if (secs != null && secs > 0) sleepHours = secs / 3600.0;
      final h = _lastNum(sleep, 'average_hrv');
      if (h != null) hrv = h.toDouble();
      final rhr = _lastNum(sleep, 'average_heart_rate');
      if (rhr != null) restingHr = rhr.toDouble();
    } catch (_) {}
    return HealthSummary(
      sleepHours: sleepHours,
      readinessScore: readiness,
      sleepScore: sleepScore,
      hrv: hrv,
      restingHeartRate: restingHr,
    );
  }
}

/// Lectura nativa de salud/wearables via el paquete `health`. INDEPENDIENTE del
/// backend de Vibe. Solo lectura (READ). En iOS usa HealthKit; en Android,
/// Health Connect. Las gafas Meta/Oakley NO van por aqui (van por CLIO).
class VibeHealth {
  final Health _health = Health();
  bool _configured = false;

  static const List<HealthDataType> _types = [
    HealthDataType.STEPS,
    HealthDataType.HEART_RATE,
    HealthDataType.ACTIVE_ENERGY_BURNED,
    HealthDataType.SLEEP_ASLEEP,
  ];

  Future<void> _ensureConfigured() async {
    if (_configured) return;
    await _health.configure();
    _configured = true;
  }

  /// Pide permiso de lectura. Devuelve true si se concedio.
  Future<bool> requestPermissions() async {
    await _ensureConfigured();
    try {
      return await _health.requestAuthorization(
        _types,
        permissions: _types.map((_) => HealthDataAccess.READ).toList(),
      );
    } catch (_) {
      return false;
    }
  }

  /// Resumen de hoy. Devuelve campos null si no hay datos/permiso.
  Future<HealthSummary> todaySummary() async {
    await _ensureConfigured();
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day);
    int? steps;
    try {
      steps = await _health.getTotalStepsInInterval(start, now);
    } catch (_) {}
    double? heartRate;
    double? energy;
    double? sleepHours;
    try {
      final points = await _health.getHealthDataFromTypes(
        types: const [
          HealthDataType.HEART_RATE,
          HealthDataType.ACTIVE_ENERGY_BURNED,
          HealthDataType.SLEEP_ASLEEP,
        ],
        startTime: start,
        endTime: now,
      );
      final hr = <num>[];
      num energySum = 0;
      num sleepMin = 0;
      for (final p in points) {
        final v = p.value;
        if (v is! NumericHealthValue) continue;
        final n = v.numericValue;
        switch (p.type) {
          case HealthDataType.HEART_RATE:
            hr.add(n);
            break;
          case HealthDataType.ACTIVE_ENERGY_BURNED:
            energySum += n;
            break;
          case HealthDataType.SLEEP_ASLEEP:
            sleepMin += n;
            break;
          default:
            break;
        }
      }
      if (hr.isNotEmpty) {
        heartRate = hr.reduce((a, b) => a + b) / hr.length;
      }
      if (energySum > 0) energy = energySum.toDouble();
      if (sleepMin > 0) sleepHours = sleepMin / 60.0;
    } catch (_) {}
    return HealthSummary(
      steps: steps,
      heartRate: heartRate,
      activeEnergyKcal: energy,
      sleepHours: sleepHours,
    );
  }
}

/// Envoltura sobre flutter_tts: selecciona voz por idioma y genero, con
/// fallback por tono cuando la plataforma no expone voces por genero.
class VibeTts {
  final FlutterTts _tts = FlutterTts();
  bool _ready = false;

  Future<void> _ensureReady() async {
    if (_ready) return;
    await _tts.awaitSpeakCompletion(true);
    // iOS: configurar la sesion de audio en modo reproduccion para que V hable
    // aunque el interruptor de silencio este activado o haya otra app de audio.
    try {
      await _tts.setSharedInstance(true);
      await _tts.setIosAudioCategory(
        IosTextToSpeechAudioCategory.playback,
        [
          IosTextToSpeechAudioCategoryOptions.defaultToSpeaker,
          IosTextToSpeechAudioCategoryOptions.duckOthers,
          IosTextToSpeechAudioCategoryOptions.mixWithOthers,
        ],
        IosTextToSpeechAudioMode.voicePrompt,
      );
    } catch (_) {
      // En otras plataformas estos metodos no aplican.
    }
    _ready = true;
  }

  Future<void> speak(
    String text, {
    required AppLanguage lang,
    required VoiceGender gender,
  }) async {
    if (text.trim().isEmpty) return;
    await _ensureReady();
    final localeId = switch (lang) {
      AppLanguage.spanish => 'es-ES',
      AppLanguage.english => 'en-US',
      AppLanguage.french => 'fr-FR',
    };
    await _tts.setLanguage(localeId);
    final picked = await _pickVoice(localeId, gender);
    if (picked != null) {
      try {
        await _tts.setVoice({'name': picked, 'locale': localeId});
      } catch (_) {
        // Si la voz no se puede fijar, seguimos con el idioma + tono.
      }
    }
    // Fallback expresivo: tono mas alto para mujer, mas grave para hombre.
    await _tts.setPitch(gender == VoiceGender.female ? 1.1 : 0.85);
    await _tts.setSpeechRate(0.5);
    await _tts.speak(text);
  }

  Future<String?> _pickVoice(String localeId, VoiceGender gender) async {
    try {
      final voices = await _tts.getVoices;
      if (voices is! List) return null;
      final localePrefix = localeId.split('-').first.toLowerCase();
      final matches = <Map>[];
      for (final v in voices) {
        if (v is Map) {
          final loc = (v['locale'] ?? '').toString().toLowerCase();
          if (loc.startsWith(localePrefix)) matches.add(v);
        }
      }
      if (matches.isEmpty) return null;
      const femaleHints = ['female', 'mujer', 'femme', 'samantha', 'monica',
        'paulina', 'amelie', 'aurelie', 'marie', 'sandy', 'karen'];
      const maleHints = ['male', 'hombre', 'homme', 'jorge', 'diego', 'thomas',
        'daniel', 'fred', 'aaron', 'nicolas', 'carlos'];
      final hints = gender == VoiceGender.female ? femaleHints : maleHints;
      for (final v in matches) {
        final name = (v['name'] ?? '').toString().toLowerCase();
        final g = (v['gender'] ?? '').toString().toLowerCase();
        if (hints.any((h) => name.contains(h) || g.contains(h))) {
          return (v['name'] ?? '').toString();
        }
      }
      // Sin coincidencia por genero: primera voz del idioma.
      return (matches.first['name'] ?? '').toString();
    } catch (_) {
      return null;
    }
  }

  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (_) {}
  }
}

/// Preferencias del asistente persistidas en disco con el MISMO patron de
/// archivo JSON que [PersistedVibeSession] (no toca el backend).
class PersistedAssistantSettings {
  PersistedAssistantSettings({
    required this.language,
    required this.voiceGender,
    required this.wakeEnabled,
    required this.claudeApiKey,
    required this.ouraToken,
    required this.healthEnabled,
    required this.lastHealthSyncDay,
    required this.clioMcpUrl,
    required this.clioToken,
    required this.onboardingDone,
    required this.transcribeKey,
    required this.themeMode,
  });

  final AppLanguage language;
  final VoiceGender voiceGender;
  final bool wakeEnabled;
  final String claudeApiKey;
  final String ouraToken;
  final bool healthEnabled;

  /// Ultimo dia (yyyy-mm-dd) en que se envio el resumen de salud al servidor.
  /// Evita duplicar la evidencia biometrica diaria en cada apertura/refresco.
  final String lastHealthSyncDay;

  /// Conexion a CLIO via MCP (borrador): URL del servidor MCP y token. Local.
  final String clioMcpUrl;
  final String clioToken;

  /// Si el usuario ya vio el onboarding de bienvenida.
  final bool onboardingDone;

  /// Clave de la API de transcripcion (Whisper). Local.
  final String transcribeKey;

  /// Modo de tema: 'system' | 'light' | 'dark'.
  final String themeMode;

  Map<String, dynamic> toJson() => {
        'version': 1,
        'language': language.code,
        'voiceGender': voiceGender.name,
        'wakeEnabled': wakeEnabled,
        'claudeApiKey': claudeApiKey,
        'ouraToken': ouraToken,
        'healthEnabled': healthEnabled,
        'lastHealthSyncDay': lastHealthSyncDay,
        'clioMcpUrl': clioMcpUrl,
        'clioToken': clioToken,
        'onboardingDone': onboardingDone,
        'transcribeKey': transcribeKey,
        'themeMode': themeMode,
      };

  static PersistedAssistantSettings fromJson(Map<String, dynamic> json) {
    return PersistedAssistantSettings(
      language: AppLanguage.fromCode(json['language'] as String?),
      voiceGender: (json['voiceGender'] as String?) == 'male'
          ? VoiceGender.male
          : VoiceGender.female,
      wakeEnabled: json['wakeEnabled'] as bool? ?? true,
      claudeApiKey: json['claudeApiKey'] as String? ?? '',
      ouraToken: json['ouraToken'] as String? ?? '',
      healthEnabled: json['healthEnabled'] as bool? ?? false,
      lastHealthSyncDay: json['lastHealthSyncDay'] as String? ?? '',
      clioMcpUrl: json['clioMcpUrl'] as String? ?? '',
      clioToken: json['clioToken'] as String? ?? '',
      onboardingDone: json['onboardingDone'] as bool? ?? false,
      transcribeKey: json['transcribeKey'] as String? ?? '',
      themeMode: json['themeMode'] as String? ?? 'system',
    );
  }
}

// ===================================================================
// ===== UI COMPONENTS reutilizables =================================
// ===================================================================

/// Boton tipo panel: icono + etiqueta completa (sin siglas) + sublabel
/// opcional, con estados activo/prominente. Unifica el lenguaje visual de los
/// botones de accion en toda la app.
class VibePanelButton extends StatelessWidget {
  const VibePanelButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.sublabel,
    this.active = false,
    this.prominent = false,
    this.color,
  });

  final IconData icon;
  final String label;
  final String? sublabel;
  final VoidCallback? onPressed;
  final bool active;
  final bool prominent;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final base = color ?? VibeTokens.brand;
    final bg = prominent
        ? base
        : active
            ? base.withValues(alpha: 0.12)
            : VibeTokens.panel;
    final fg = prominent ? Colors.white : VibeTokens.ink;
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(VibeTokens.rMd),
      child: InkWell(
        borderRadius: BorderRadius.circular(VibeTokens.rMd),
        onTap: onPressed,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: VibeTokens.space16,
            vertical: VibeTokens.space12,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(VibeTokens.rMd),
            border: Border.all(
              color: prominent ? base : VibeTokens.border,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: prominent
                      ? Colors.white.withValues(alpha: 0.2)
                      : base.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(VibeTokens.rSm),
                ),
                child: Icon(icon,
                    color: prominent ? Colors.white : base, size: 22),
              ),
              const SizedBox(width: VibeTokens.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: fg,
                      ),
                    ),
                    if (sublabel != null && sublabel!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        sublabel!,
                        style: TextStyle(
                          fontSize: 12.5,
                          color: prominent
                              ? Colors.white.withValues(alpha: 0.85)
                              : VibeTokens.muted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(Icons.chevron_right,
                  color: prominent
                      ? Colors.white.withValues(alpha: 0.85)
                      : VibeTokens.muted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pantalla del manual de usuario. Texto totalmente localizado a traves de
/// [AppStrings]; se abre con Navigator.push desde la pestana Cuenta.
/// Onboarding de bienvenida (primer uso): 4 paginas con PageView. Localizado.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({required this.strings, required this.onDone, super.key});
  final AppStrings strings;
  final VoidCallback onDone;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final pages = <(IconData, String, String)>[
      (Icons.auto_awesome, s.onbWelcomeTitle, s.onbWelcomeBody),
      (Icons.mic_none_outlined, s.onbVTitle, s.onbVBody),
      (Icons.bolt_outlined, s.onbCaptureTitle, s.onbCaptureBody),
      (Icons.favorite_border, s.onbHealthTitle, s.onbHealthBody),
    ];
    final isLast = _page >= pages.length - 1;
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [VibeTokens.brand, VibeTokens.brandDark],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.topRight,
                child: TextButton(
                  onPressed: widget.onDone,
                  child: Text(s.onbSkip,
                      style: const TextStyle(color: Colors.white70)),
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  itemCount: pages.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (_, i) {
                    final p = pages[i];
                    return Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(p.$1, size: 84, color: Colors.white),
                          const SizedBox(height: 28),
                          Text(p.$2,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900)),
                          const SizedBox(height: 14),
                          Text(p.$3,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 15,
                                  height: 1.4)),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  pages.length,
                  (i) => Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _page
                          ? Colors.white
                          : Colors.white.withValues(alpha: 0.4),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(24),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: VibeTokens.brandDark,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    onPressed: () {
                      if (isLast) {
                        widget.onDone();
                      } else {
                        _controller.nextPage(
                          duration: const Duration(milliseconds: 280),
                          curve: Curves.easeOut,
                        );
                      }
                    },
                    child: Text(isLast ? s.onbStart : s.onbNext,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class UserManualScreen extends StatelessWidget {
  const UserManualScreen({super.key, required this.strings});

  final AppStrings strings;

  @override
  Widget build(BuildContext context) {
    final sections = <(IconData, String, String)>[
      (Icons.grid_view_outlined, strings.manualSectionsTitle,
          strings.manualSectionsBody),
      (Icons.assistant_outlined, strings.manualAssistantTitle,
          strings.manualAssistantBody),
      (Icons.record_voice_over_outlined, strings.manualVoiceTitle,
          strings.manualVoiceBody),
      (Icons.favorite_border, strings.manualHealthTitle,
          strings.manualHealthBody),
      (Icons.shield_outlined, strings.manualPermissionsTitle,
          strings.manualPermissionsBody),
      (Icons.cloud_sync_outlined, strings.manualSyncTitle,
          strings.manualSyncBody),
      (Icons.help_outline, strings.manualTroubleTitle,
          strings.manualTroubleBody),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(strings.manualTitle)),
      body: ListView(
        padding: const EdgeInsets.all(VibeTokens.space16),
        children: [
          // Tarjeta de intro con acento de marca.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(VibeTokens.space20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [VibeTokens.brand, VibeTokens.brandDark],
              ),
              borderRadius: BorderRadius.circular(VibeTokens.rLg),
              boxShadow: [
                BoxShadow(
                  color: VibeTokens.brand.withValues(alpha: 0.30),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.menu_book_outlined,
                    color: Colors.white, size: 28),
                const SizedBox(height: VibeTokens.space12),
                Text(
                  strings.manualIntro,
                  style: const TextStyle(
                      fontSize: 14.5, height: 1.4, color: Colors.white),
                ),
              ],
            ),
          ),
          const SizedBox(height: VibeTokens.space20),
          for (final s in sections) ...[
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: VibeTokens.space12),
              padding: const EdgeInsets.all(VibeTokens.space16),
              decoration: BoxDecoration(
                color: VibeTokens.panel,
                borderRadius: BorderRadius.circular(VibeTokens.rLg),
                border: Border.all(color: VibeTokens.border),
                boxShadow: VibeTokens.softShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: VibeTokens.brand.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(VibeTokens.rSm),
                        ),
                        child: Icon(s.$1, color: VibeTokens.brand, size: 20),
                      ),
                      const SizedBox(width: VibeTokens.space12),
                      Expanded(
                        child: Text(
                          s.$2,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            color: VibeTokens.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: VibeTokens.space12),
                  Text(
                    s.$3,
                    style: TextStyle(
                        fontSize: 14, height: 1.45, color: VibeTokens.muted),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
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
  final SpeechToText _speechToText = SpeechToText();
  final TextEditingController _noteController = TextEditingController();
  final TextEditingController _apiUrlController = TextEditingController(
      text: 'https://experience-hub-web-production.up.railway.app');
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _sessionTitleController = TextEditingController();
  final List<CaptureQueueItem> _queue = [];
  Timer? _retryTimer;
  Timer? _vibeWatchdogTimer;
  SyncState _syncState = SyncState.ready;
  String _accessToken = '';
  String _signedInEmail = '';
  ActiveExperienceSession? _activeSession;
  bool _isRecordingAudio = false;
  String _audioRecordingPath = '';
  // Niveles en vivo para el waveform de grabacion (sin dependencias nuevas:
  // se leen del stream de amplitud del paquete `record`).
  final List<double> _audioLevels = [];
  StreamSubscription<Amplitude>? _amplitudeSub;
  bool _autoRetryRunning = false;
  bool _isCheckingBackend = false;
  bool _backendHealthOk = false;
  bool _isSigningIn = false;
  int _selectedHomeTab = 0;
  DateTime? _lastSyncAt;
  String _backendHealthMessage =
      'Verifica el backend antes de sincronizar en produccion.';
  String _authStatusMessage = 'Entra con tu cuenta para sincronizar.';
  String _vibeCommandStatusMessage = '';
  String _vibeVoiceTranscript = '';
  bool _vibeCommandOnline = false;
  bool _speechReady = false;
  bool _isListeningForVibe = false;
  bool _vibeVoiceArmed = false;
  bool _vibePausedForExternalAction = false;
  bool _vibeRecoveryRunning = false;
  int _vibeBenignErrorStreak = 0;
  DateTime? _lastVibeVoiceActivityAt;
  VibeVoiceLanguage _vibeVoiceLanguage = VibeVoiceLanguage.spanish;
  bool _authStatusOk = false;

  // --- Asistente V: idioma, voz, IA, persistencia ---
  AppLanguage _appLanguage = AppLanguage.spanish;
  ThemeMode _themeMode = ThemeMode.system;
  VoiceGender _voiceGender = VoiceGender.female;
  bool _wakeEnabled = true;
  String _claudeApiKey = '';
  bool _vibeAnswering = false;
  bool _improvingNote = false;
  // Memoria de conversacion de V (turnos {role,text}) para dar contexto multi-turno
  // a la IA. Se limpia al desactivar V. NO se persiste ni toca el backend.
  final List<Map<String, String>> _vibeHistory = [];
  bool _claudeKeyVisible = false;
  bool _vibeTestingAi = false;
  String _vibeAiTestResult = '';
  final VibeTts _tts = VibeTts();
  final IntentEngine _intentEngine = IntentEngine();
  final VibeHealth _health = VibeHealth();
  HealthSummary? _healthSummary;
  bool _healthBusy = false;
  String _ouraToken = '';
  VibeOura? _oura;
  bool _healthEnabled = false;
  String _lastHealthSyncDay = '';
  ClaudeAssistantClient? _claude;
  final TextEditingController _claudeKeyController = TextEditingController();
  final TextEditingController _ouraTokenController = TextEditingController();
  bool _ouraTokenVisible = false;
  // Conexion CLIO (MCP) — borrador.
  String _clioMcpUrl = '';
  String _clioToken = '';
  VibeClioClient? _clio;
  final TextEditingController _clioUrlController = TextEditingController();
  final TextEditingController _clioTokenController = TextEditingController();
  bool _clioTokenVisible = false;
  bool _clioTesting = false;
  String _clioTestResult = '';
  // Gafas inteligentes (andamiaje, a la espera del plugin nativo).
  final VibeGlasses _glasses = VibeGlasses();
  GlassesStatus _glassesStatus = GlassesStatus.unavailable;
  bool _glassesBusy = false;
  bool _onboardingDone = false;
  // Transcripcion de notas de voz (Whisper). Guardado a la espera de clave.
  String _transcribeKey = '';
  VibeTranscriber? _transcriber;
  final TextEditingController _transcribeKeyController = TextEditingController();
  bool _transcribeKeyVisible = false;
  bool _transcribing = false;

  /// Catalogo de cadenas para el idioma activo.
  AppStrings get _t => AppStrings(_appLanguage);

  @override
  void initState() {
    super.initState();
    _noteController.addListener(_handleNoteChanged);
    unawaited(_loadPersistedQueue());
    unawaited(_loadPersistedSession());
    unawaited(_loadAssistantSettings());
    _retryTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => unawaited(_autoRetryDueQueue()),
    );
    _vibeWatchdogTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => unawaited(_vibeVoiceWatchdog()),
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
    _claudeKeyController.dispose();
    _ouraTokenController.dispose();
    _clioUrlController.dispose();
    _clioTokenController.dispose();
    _transcribeKeyController.dispose();
    _retryTimer?.cancel();
    _vibeWatchdogTimer?.cancel();
    unawaited(_amplitudeSub?.cancel());
    unawaited(_audioRecorder.dispose());
    unawaited(_speechToText.cancel());
    unawaited(_tts.stop());
    super.dispose();
  }

  // ===== Persistencia de ajustes del asistente (patron de archivo JSON) =====

  Future<File> _assistantSettingsFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/vibeapp-assistant-settings.json');
  }

  Future<void> _loadAssistantSettings() async {
    PersistedAssistantSettings? settings;
    try {
      // Keychain primero (sobrevive reinstalaciones); migra desde archivo si hace falta.
      String? raw = await kSecureStore.read(VibeSecureStore.settingsKey);
      if (raw == null || raw.isEmpty) {
        final file = await _assistantSettingsFile();
        if (await file.exists()) {
          raw = await file.readAsString();
          if (raw.isNotEmpty) {
            await kSecureStore.write(VibeSecureStore.settingsKey, raw);
          }
        }
      }
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) {
          settings = PersistedAssistantSettings.fromJson(decoded);
        }
      }
    } catch (_) {
      // Ajustes corruptos: se usan valores por defecto.
    }
    // La clave/token guardados por el usuario tienen prioridad; si no hay, se usa
    // el valor inyectado en el build (kBuildClaudeKey / kBuildOuraToken).
    final savedKey = settings?.claudeApiKey.trim() ?? '';
    final effectiveKey = savedKey.isNotEmpty ? savedKey : kBuildClaudeKey.trim();
    final savedOura = settings?.ouraToken.trim() ?? '';
    final effectiveOura =
        savedOura.isNotEmpty ? savedOura : kBuildOuraToken.trim();
    final savedTr = settings?.transcribeKey.trim() ?? '';
    final effectiveTr =
        savedTr.isNotEmpty ? savedTr : kBuildTranscribeKey.trim();
    if (!mounted) return;
    setState(() {
      if (settings != null) {
        _appLanguage = settings.language;
        _voiceGender = settings.voiceGender;
        _wakeEnabled = settings.wakeEnabled;
        _vibeVoiceLanguage = settings.language.voiceLanguage;
        _healthEnabled = settings.healthEnabled;
        _lastHealthSyncDay = settings.lastHealthSyncDay;
      }
      _claudeApiKey = effectiveKey;
      _claudeKeyController.text = effectiveKey;
      _claude =
          effectiveKey.isEmpty ? null : ClaudeAssistantClient(effectiveKey);
      _ouraToken = effectiveOura;
      _ouraTokenController.text = effectiveOura;
      _oura = effectiveOura.isEmpty ? null : VibeOura(effectiveOura);
      _clioMcpUrl = settings?.clioMcpUrl ?? '';
      _clioToken = settings?.clioToken ?? '';
      _clioUrlController.text = _clioMcpUrl;
      _clioTokenController.text = _clioToken;
      _clio = (_clioMcpUrl.isEmpty || _clioToken.isEmpty)
          ? null
          : VibeClioClient(_clioMcpUrl, _clioToken);
      _onboardingDone = settings?.onboardingDone ?? false;
      _transcribeKey = effectiveTr;
      _transcribeKeyController.text = effectiveTr;
      _transcriber =
          effectiveTr.isEmpty ? null : VibeTranscriber(effectiveTr);
      _themeMode = _themeModeFromString(settings?.themeMode ?? 'system');
    });
    if (settings != null) {
      appLanguageNotifier.value = settings.language;
    }
    themeModeNotifier.value = _themeMode;
    // Primer uso: muestra el onboarding de bienvenida una sola vez.
    if (!_onboardingDone) {
      unawaited(_maybeShowOnboarding());
    }
    // Auto-carga silenciosa: si el usuario ya conecto salud, el permiso de
    // Apple Health/Health Connect persiste a nivel del sistema, asi que leemos
    // los datos de hoy al abrir sin volver a pedir permiso ni tocar botones.
    if (_healthEnabled) {
      unawaited(_refreshHealth(silent: true));
    }
    // Auto-armar V al abrir si la escucha persistente esta activada: manos libres
    // dentro de la sesion, sin tener que tocar el microfono.
    if (_wakeEnabled) {
      unawaited(_autoArmVibeOnLaunch());
    }
  }

  /// Arranca la escucha de V automaticamente al abrir (si hay escucha
  /// persistente). Espera un momento a que el arbol/plugins esten listos.
  Future<void> _autoArmVibeOnLaunch() async {
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted ||
        !_wakeEnabled ||
        _vibeVoiceArmed ||
        _isListeningForVibe ||
        _vibePausedForExternalAction) {
      return;
    }
    // Auto-arme inteligente: solo arranca sola si el permiso de microfono YA
    // fue concedido. Asi no disparamos el dialogo de permiso al abrir; en el
    // primer uso el usuario toca el microfono y lo concede una vez.
    bool granted = false;
    try {
      granted = await _speechToText.hasPermission;
    } catch (_) {
      granted = false;
    }
    if (!granted || !mounted || !_wakeEnabled || _vibeVoiceArmed) return;
    await _startVibeVoiceCommand(resetUi: false);
  }

  /// Muestra el onboarding de bienvenida en el primer uso y marca el flag.
  Future<void> _maybeShowOnboarding() async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (!mounted || _onboardingDone) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => OnboardingScreen(
          strings: _t,
          onDone: () => Navigator.of(context).maybePop(),
        ),
      ),
    );
    if (!mounted) return;
    setState(() => _onboardingDone = true);
    await _saveAssistantSettings();
  }

  Future<void> _saveAssistantSettings() async {
    try {
      final settings = PersistedAssistantSettings(
        language: _appLanguage,
        voiceGender: _voiceGender,
        wakeEnabled: _wakeEnabled,
        claudeApiKey: _claudeApiKey,
        ouraToken: _ouraToken,
        healthEnabled: _healthEnabled,
        lastHealthSyncDay: _lastHealthSyncDay,
        clioMcpUrl: _clioMcpUrl,
        clioToken: _clioToken,
        onboardingDone: _onboardingDone,
        transcribeKey: _transcribeKey,
        themeMode: _themeModeToString(_themeMode),
      );
      final raw = jsonEncode(settings.toJson());
      await kSecureStore.write(VibeSecureStore.settingsKey, raw);
      final file = await _assistantSettingsFile();
      await file.writeAsString(raw);
    } catch (_) {
      // Silencioso: no es critico para el flujo de captura.
    }
  }

  void _applyAppLanguage(AppLanguage language) {
    setState(() {
      _appLanguage = language;
      _vibeVoiceLanguage = language.voiceLanguage;
    });
    appLanguageNotifier.value = language;
    unawaited(_saveAssistantSettings());
  }

  String _themeModeToString(ThemeMode m) => switch (m) {
        ThemeMode.dark => 'dark',
        ThemeMode.light => 'light',
        ThemeMode.system => 'system',
      };

  ThemeMode _themeModeFromString(String s) => switch (s) {
        'dark' => ThemeMode.dark,
        'light' => ThemeMode.light,
        _ => ThemeMode.system,
      };

  void _applyThemeMode(ThemeMode mode) {
    setState(() => _themeMode = mode);
    themeModeNotifier.value = mode; // reconstruye el arbol con el nuevo brillo
    unawaited(_saveAssistantSettings());
  }

  void _applyVoiceGender(VoiceGender gender) {
    setState(() => _voiceGender = gender);
    unawaited(_saveAssistantSettings());
  }

  void _applyWakeEnabled(bool enabled) {
    setState(() => _wakeEnabled = enabled);
    unawaited(_saveAssistantSettings());
  }

  Future<void> _saveClaudeKey() async {
    final key = _claudeKeyController.text.trim();
    setState(() {
      _claudeApiKey = key;
      _claude = key.isEmpty ? null : ClaudeAssistantClient(key);
    });
    await _saveAssistantSettings();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t.claudeKeySaved)),
    );
  }

  Future<void> _testAssistantVoice() async {
    await _tts.speak(_t.testVoicePhrase,
        lang: _appLanguage, gender: _voiceGender);
  }

  // ===== Salud / wearables (HealthKit / Health Connect / Oura) =====

  /// Guarda el token de Oura (igual patron que la clave de Claude) y recrea el
  /// cliente. El anillo Oura aporta sueno/readiness/HRV que no da HealthKit.
  Future<void> _saveOuraToken() async {
    final token = _ouraTokenController.text.trim();
    setState(() {
      _ouraToken = token;
      _oura = token.isEmpty ? null : VibeOura(token);
    });
    await _saveAssistantSettings();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t.ouraTokenSaved)),
    );
    if (token.isNotEmpty) await _refreshHealth();
  }

  /// Guarda la clave de transcripcion (Whisper) y recrea el cliente.
  Future<void> _saveTranscribeKey() async {
    final key = _transcribeKeyController.text.trim();
    setState(() {
      _transcribeKey = key;
      _transcriber = key.isEmpty ? null : VibeTranscriber(key);
    });
    await _saveAssistantSettings();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t.transcribeKeySaved)),
    );
  }

  /// Transcribe un archivo de audio (si hay clave) y vuelca el texto en la nota.
  Future<void> _transcribeAudio(String path) async {
    final t = _transcriber;
    if (t == null || !t.isConfigured) return; // sin clave: no-op
    if (mounted) setState(() => _transcribing = true);
    try {
      final text = await t.transcribe(path);
      if (!mounted) return;
      setState(() {
        if (text.isNotEmpty) {
          final existing = _noteController.text.trim();
          _noteController.text =
              existing.isEmpty ? text : '$existing\n$text';
        }
        _transcribing = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.transcribeDone)),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _transcribing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content:
                Text('${_t.transcribeFail} ${shorten(error.toString(), 140)}')),
      );
    }
  }

  /// Guarda la conexion CLIO (URL del MCP + token) y recrea el cliente.
  Future<void> _saveClioConnection() async {
    final url = _clioUrlController.text.trim();
    final token = _clioTokenController.text.trim();
    setState(() {
      _clioMcpUrl = url;
      _clioToken = token;
      _clio = (url.isEmpty || token.isEmpty) ? null : VibeClioClient(url, token);
    });
    await _saveAssistantSettings();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t.clioSaved)),
    );
  }

  /// Prueba la conexion al MCP de CLIO: lista las herramientas y muestra cuantas
  /// hay (o el error exacto). Sirve para validar URL+token cuando lleguen.
  Future<void> _testClioConnection() async {
    final url = _clioUrlController.text.trim();
    final token = _clioTokenController.text.trim();
    if (url.isEmpty || token.isEmpty) {
      setState(() => _clioTestResult = _t.clioNeedsConfig);
      return;
    }
    setState(() {
      _clioTesting = true;
      _clioTestResult = '';
    });
    final client = VibeClioClient(url, token);
    String result;
    try {
      final tools = await client.listTools();
      result = _t.clioTestOk(tools.length);
    } catch (error) {
      result = '${_t.clioTestFail} ${shorten(error.toString(), 200)}';
    }
    if (!mounted) return;
    setState(() {
      _clioTesting = false;
      _clioTestResult = result;
    });
  }

  /// Intenta conectar las gafas (andamiaje). Hasta que exista el plugin nativo,
  /// reporta "no disponible" y guia a instalar el plugin.
  Future<void> _connectGlasses() async {
    setState(() => _glassesBusy = true);
    final status = await _glasses.connect();
    if (!mounted) return;
    setState(() {
      _glassesStatus = status;
      _glassesBusy = false;
    });
    final msg = status == GlassesStatus.connected
        ? _t.glassesConnected
        : _t.glassesUnavailable;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  /// Lee HealthKit (iOS) / Health Connect (Android) y, si hay token, fusiona los
  /// datos del anillo Oura. Devuelve un resumen combinado del dia.
  Future<HealthSummary> _readCombinedHealth() async {
    var summary = await _health.todaySummary();
    final oura = _oura;
    if (oura != null && oura.isConfigured) {
      try {
        summary = summary.mergeOura(await oura.todaySummary());
      } catch (_) {
        // Oura caido/sin red: conservamos lo de HealthKit.
      }
    }
    return summary;
  }

  Future<void> _connectHealth() async {
    setState(() => _healthBusy = true);
    final granted = await _health.requestPermissions();
    if (!mounted) return;
    if (!granted) {
      setState(() => _healthBusy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.healthDenied)),
      );
      return;
    }
    final summary = await _readCombinedHealth();
    if (!mounted) return;
    setState(() {
      _healthSummary = summary;
      _healthEnabled = true;
      _healthBusy = false;
    });
    await _saveAssistantSettings();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t.healthConnected)),
    );
    // Envia el resumen del dia al servidor (para que VibePWA se actualice),
    // reutilizando el contrato biometrico existente. Dedup: una vez por dia.
    await _maybeSyncHealthToServer(summary);
  }

  /// [silent]=true para la auto-carga al abrir (sin SnackBars ni spinner ruidoso).
  Future<void> _refreshHealth({bool silent = false}) async {
    if (!silent) setState(() => _healthBusy = true);
    HealthSummary summary;
    try {
      summary = await _readCombinedHealth();
    } catch (_) {
      if (!silent && mounted) setState(() => _healthBusy = false);
      return;
    }
    if (!mounted) return;
    setState(() {
      _healthSummary = summary;
      if (!silent) _healthBusy = false;
    });
    await _maybeSyncHealthToServer(summary);
  }

  /// V dice el resumen de salud de hoy (por voz + pantalla). Pide permiso si hace falta.
  Future<void> _vibeSpeakHealthSummary() async {
    HealthSummary summary;
    try {
      final granted = await _health.requestPermissions();
      if (!granted) {
        await _vibeConfirmAndResume(_t.healthDenied);
        return;
      }
      summary = await _readCombinedHealth();
    } catch (_) {
      await _vibeConfirmAndResume(_t.healthDenied);
      return;
    }
    if (mounted) {
      setState(() {
        _healthSummary = summary;
        _healthEnabled = true;
      });
    }
    await _maybeSyncHealthToServer(summary);
    await _vibeConfirmAndResume(_t.healthSpoken(summary));
  }

  /// Briefing por voz: junta salud (si esta conectada), capturas pendientes y
  /// estado de sesion en un resumen hablado. No fuerza permisos ni red.
  Future<void> _vibeDailyBriefing() async {
    HealthSummary? health = _healthSummary;
    if (_healthEnabled) {
      try {
        health = await _readCombinedHealth();
        if (mounted) setState(() => _healthSummary = health);
        await _maybeSyncHealthToServer(health);
      } catch (_) {
        // Si falla la lectura, seguimos con lo que haya en cache.
      }
    }
    final pending = CaptureQueueSummary.fromItems(_queue).pending;
    final sessionTitle = _activeSession?.title;
    await _vibeConfirmAndResume(
      _t.dailyBriefingSpoken(
        health: health,
        pending: pending,
        sessionTitle: sessionTitle,
      ),
    );
  }

  /// V responde sobre tus capturas leyendo la cola LOCAL (solo lectura, sin
  /// backend): conteo por tipo + tus notas de hoy.
  Future<void> _vibeAnswerCaptures() async {
    final now = DateTime.now();
    bool isToday(DateTime d) {
      final l = d.toLocal();
      return l.year == now.year && l.month == now.month && l.day == now.day;
    }

    int notes = 0, photos = 0, videos = 0, audios = 0, others = 0;
    final recent = <String>[];
    for (final it in _queue) {
      switch (it.sourceType) {
        case 'text':
          notes++;
          if (isToday(it.createdAt) &&
              recent.length < 3 &&
              it.detail.trim().isNotEmpty) {
            final d = it.detail.trim();
            recent.add(d.length > 80 ? '${d.substring(0, 80)}…' : d);
          }
          break;
        case 'image':
          photos++;
          break;
        case 'video':
          videos++;
          break;
        case 'audio':
          audios++;
          break;
        default:
          others++;
      }
    }
    await _vibeConfirmAndResume(_t.capturesSpoken(
      notes: notes,
      photos: photos,
      videos: videos,
      audios: audios,
      others: others,
      recentNotes: recent,
    ));
  }

  String _today() {
    final n = DateTime.now();
    String two(int x) => x.toString().padLeft(2, '0');
    return '${n.year}-${two(n.month)}-${two(n.day)}';
  }

  /// Construye un CSV biometrico desde el resumen en vivo y lo envia al servidor
  /// por LA MISMA tuberia que el import de archivos (sin tocar el backend), para
  /// que VibePWA reciba los metadatos. Solo una vez por dia (dedup por fecha).
  Future<void> _maybeSyncHealthToServer(HealthSummary s) async {
    if (!s.hasAny) return;
    final today = _today();
    if (_lastHealthSyncDay == today) return; // ya enviado hoy
    try {
      final nowIso = DateTime.now().toUtc().toIso8601String();
      final rows = <String>['date,metric,value,unit,source'];
      void add(String metric, String value, String unit, String src) =>
          rows.add('$nowIso,$metric,$value,$unit,$src');
      if (s.steps != null) add('steps', '${s.steps}', 'count', 'Apple Health');
      if (s.heartRate != null) {
        add('heart_rate', s.heartRate!.toStringAsFixed(0), 'bpm', 'Apple Health');
      }
      if (s.activeEnergyKcal != null) {
        add('active_energy', s.activeEnergyKcal!.toStringAsFixed(0), 'kcal',
            'Apple Health');
      }
      if (s.sleepHours != null) {
        add('sleep', s.sleepHours!.toStringAsFixed(2), 'hours',
            s.hasOura ? 'Oura' : 'Apple Health');
      }
      if (s.readinessScore != null) {
        add('readiness', '${s.readinessScore}', 'score', 'Oura');
      }
      if (s.sleepScore != null) {
        add('sleep_score', '${s.sleepScore}', 'score', 'Oura');
      }
      if (s.hrv != null) {
        add('hrv', s.hrv!.toStringAsFixed(0), 'ms', 'Oura');
      }
      if (s.restingHeartRate != null) {
        add('resting_heart_rate', s.restingHeartRate!.toStringAsFixed(0), 'bpm',
            'Oura');
      }
      if (rows.length <= 1) return;
      final csv = rows.join('\n');
      final dir = await getTemporaryDirectory();
      final fileName = 'vibeapp-health-$today.csv';
      final file = File(
        '${dir.path}${Platform.pathSeparator}'
        'vibeapp-health-${DateTime.now().microsecondsSinceEpoch}.csv',
      );
      await file.writeAsString(csv, flush: true);
      final summary = BiometricImportSummary.fromRawText(
        csv,
        fileName: fileName,
        size: csv.length,
      );
      final attachment = NativeAttachmentDraft.fromFilePath(
        file.path,
        sourceType: 'biometric',
        previewText: summary.summaryText,
        analysisText: summary.analysisText,
        metadataExtras: {
          'payloadType': 'biometric',
          'extractedText': csv,
          'extractionMethod': 'vibeapp-health-live-read',
          'extractionStatus': 'automatic',
          'liveSource': s.hasOura ? 'apple_health+oura' : 'apple_health',
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
        _lastHealthSyncDay = today;
      });
      await _saveAssistantSettings();
      await _syncPendingQueue(showSnackBar: false);
    } catch (_) {
      // El envio de metadatos no debe romper la lectura/visualizacion local.
    }
  }

  /// Prueba real de la IA: hace una llamada minima y muestra el resultado o el
  /// error exacto (clave invalida, sin saldo, sin conexion, modelo, ...).
  /// Mejora la nota actual con la IA (titulo + limpieza) y reemplaza el texto.
  /// Solo lectura/escritura local del campo de nota; no toca el backend.
  Future<void> _improveNote() async {
    final text = _noteController.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.improveNoteNoText)),
      );
      return;
    }
    final client = _claude;
    if (client == null || !client.isConfigured) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.vNoKey)),
      );
      return;
    }
    setState(() => _improvingNote = true);
    try {
      final improved = await client.improveNote(text, lang: _appLanguage);
      if (!mounted) return;
      setState(() {
        if (improved.trim().isNotEmpty) _noteController.text = improved.trim();
        _improvingNote = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.improveNoteDone)),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _improvingNote = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('${_t.vAiError} (${shorten(error.toString(), 120)})')),
      );
    }
  }

  Future<void> _testClaudeConnection() async {
    final client = _claude;
    setState(() {
      _vibeTestingAi = true;
      _vibeAiTestResult = '';
    });
    if (client == null || !client.isConfigured) {
      setState(() {
        _vibeTestingAi = false;
        _vibeAiTestResult = _t.aiTestNoKey;
      });
      return;
    }
    String result;
    try {
      final reply = await client.ask('Responde solo: OK', lang: _appLanguage);
      result = '${_t.aiTestOk} ${shorten(reply, 60)}';
    } catch (error) {
      result = '${_t.aiTestFail} ${shorten(error.toString(), 220)}';
    }
    if (!mounted) return;
    setState(() {
      _vibeTestingAi = false;
      _vibeAiTestResult = result;
    });
  }

  /// Tarjeta de ajustes del asistente V en la pestana Cuenta: idioma global,
  /// voz (hombre/mujer), clave de IA y escucha persistente.
  Widget _buildHealthCard() {
    final s = _healthSummary;
    Widget metric(String label, String value) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value,
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                      color: VibeTokens.ink)),
              Text(label,
                  style:
                      TextStyle(fontSize: 12, color: VibeTokens.muted)),
            ],
          ),
        );
    return Container(
      padding: const EdgeInsets.all(VibeTokens.space16),
      decoration: BoxDecoration(
        color: VibeTokens.panel,
        borderRadius: BorderRadius.circular(VibeTokens.rLg),
        border: Border.all(color: VibeTokens.border),
        boxShadow: VibeTokens.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: VibeTokens.danger.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(VibeTokens.rSm),
                ),
                child: const Icon(Icons.favorite_border, color: VibeTokens.danger),
              ),
              const SizedBox(width: VibeTokens.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_t.healthTitle,
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            color: VibeTokens.ink)),
                    const SizedBox(height: 2),
                    Text(_t.healthSubtitle,
                        style: TextStyle(
                            fontSize: 12.5, color: VibeTokens.muted)),
                  ],
                ),
              ),
              if (_healthBusy)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
          const SizedBox(height: VibeTokens.space16),
          if (s != null && s.hasAny)
            Row(
              children: [
                metric(_t.healthStepsLabel, '${s.steps ?? '-'}'),
                metric(_t.healthHeartLabel,
                    s.heartRate != null ? '${s.heartRate!.round()}' : '-'),
                metric(_t.healthEnergyLabel,
                    s.activeEnergyKcal != null
                        ? '${s.activeEnergyKcal!.round()}'
                        : '-'),
                metric(_t.healthSleepLabel,
                    s.sleepHours != null
                        ? '${s.sleepHours!.toStringAsFixed(1)} h'
                        : '-'),
              ],
            )
          else
            Text(_t.healthNoData,
                style: TextStyle(fontSize: 13, color: VibeTokens.muted)),
          if (s != null && s.hasOura) ...[
            const SizedBox(height: VibeTokens.space12),
            Row(
              children: [
                Text(_t.ouraSectionLabel,
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: VibeTokens.brand)),
              ],
            ),
            const SizedBox(height: VibeTokens.space8),
            Row(
              children: [
                metric(_t.healthReadinessLabel,
                    s.readinessScore != null ? '${s.readinessScore}' : '-'),
                metric(_t.healthSleepScoreLabel,
                    s.sleepScore != null ? '${s.sleepScore}' : '-'),
                metric(_t.healthHrvLabel,
                    s.hrv != null ? '${s.hrv!.round()}' : '-'),
                metric(_t.healthRestingLabel,
                    s.restingHeartRate != null
                        ? '${s.restingHeartRate!.round()}'
                        : '-'),
              ],
            ),
          ],
          const SizedBox(height: VibeTokens.space12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _healthBusy ? null : _connectHealth,
                  icon: const Icon(Icons.health_and_safety_outlined),
                  label: Text(_t.healthConnectBtn),
                ),
              ),
              const SizedBox(width: VibeTokens.space8),
              OutlinedButton.icon(
                onPressed: _healthBusy ? null : () => _refreshHealth(),
                icon: const Icon(Icons.refresh),
                label: Text(_t.healthRefresh),
              ),
            ],
          ),
          const SizedBox(height: VibeTokens.space12),
          const Divider(height: 1),
          const SizedBox(height: VibeTokens.space12),
          Text(_t.ouraTokenLabel,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: VibeTokens.ink)),
          const SizedBox(height: 4),
          Text(_t.ouraTokenHint,
              style: TextStyle(fontSize: 12, color: VibeTokens.muted)),
          const SizedBox(height: VibeTokens.space8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _ouraTokenController,
                  obscureText: !_ouraTokenVisible,
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: _t.ouraTokenLabel,
                    suffixIcon: IconButton(
                      icon: Icon(_ouraTokenVisible
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined),
                      onPressed: () => setState(
                          () => _ouraTokenVisible = !_ouraTokenVisible),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: VibeTokens.space8),
              FilledButton(
                onPressed: _healthBusy ? null : _saveOuraToken,
                child: Text(_t.save),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTranscribeCard() {
    return Container(
      padding: const EdgeInsets.all(VibeTokens.space16),
      decoration: BoxDecoration(
        color: VibeTokens.panel,
        borderRadius: BorderRadius.circular(VibeTokens.rLg),
        border: Border.all(color: VibeTokens.border),
        boxShadow: VibeTokens.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: VibeTokens.brand.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(VibeTokens.rSm),
                ),
                child: const Icon(Icons.transcribe_outlined,
                    color: VibeTokens.brand),
              ),
              const SizedBox(width: VibeTokens.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_t.transcribeTitle,
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            color: VibeTokens.ink)),
                    const SizedBox(height: 2),
                    Text(_t.transcribeSubtitle,
                        style: TextStyle(
                            fontSize: 12.5, color: VibeTokens.muted)),
                  ],
                ),
              ),
              if (_transcriber != null)
                const Icon(Icons.check_circle,
                    color: Color(0xFF2E9E5B), size: 20),
            ],
          ),
          const SizedBox(height: VibeTokens.space12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _transcribeKeyController,
                  obscureText: !_transcribeKeyVisible,
                  decoration: InputDecoration(
                    isDense: true,
                    labelText: _t.transcribeKeyLabel,
                    suffixIcon: IconButton(
                      icon: Icon(_transcribeKeyVisible
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined),
                      onPressed: () => setState(
                          () => _transcribeKeyVisible = !_transcribeKeyVisible),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: VibeTokens.space8),
              FilledButton(
                onPressed: _transcribing ? null : _saveTranscribeKey,
                child: Text(_t.save),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildGlassesCard() {
    final connected = _glassesStatus == GlassesStatus.connected;
    return Container(
      padding: const EdgeInsets.all(VibeTokens.space16),
      decoration: BoxDecoration(
        color: VibeTokens.panel,
        borderRadius: BorderRadius.circular(VibeTokens.rLg),
        border: Border.all(color: VibeTokens.border),
        boxShadow: VibeTokens.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: VibeTokens.ink.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(VibeTokens.rSm),
                ),
                child: Icon(Icons.visibility_outlined,
                    color: VibeTokens.ink),
              ),
              const SizedBox(width: VibeTokens.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_t.glassesTitle,
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            color: VibeTokens.ink)),
                    const SizedBox(height: 2),
                    Text(_t.glassesSubtitle,
                        style: TextStyle(
                            fontSize: 12.5, color: VibeTokens.muted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: VibeTokens.space12),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: connected
                      ? const Color(0xFF2E9E5B).withValues(alpha: 0.14)
                      : VibeTokens.ink.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(VibeTokens.rPill),
                ),
                child: Text(_t.glassesStatusLabel(_glassesStatus),
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: connected
                            ? const Color(0xFF2E9E5B)
                            : VibeTokens.muted)),
              ),
              const Spacer(),
              FilledButton.icon(
                onPressed: _glassesBusy ? null : _connectGlasses,
                icon: _glassesBusy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.bluetooth_searching),
                label: Text(_t.glassesConnectBtn),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildClioCard() {
    return Container(
      padding: const EdgeInsets.all(VibeTokens.space16),
      decoration: BoxDecoration(
        color: VibeTokens.panel,
        borderRadius: BorderRadius.circular(VibeTokens.rLg),
        border: Border.all(color: VibeTokens.border),
        boxShadow: VibeTokens.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: VibeTokens.brand.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(VibeTokens.rSm),
                ),
                child: const Icon(Icons.hub_outlined, color: VibeTokens.brand),
              ),
              const SizedBox(width: VibeTokens.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_t.clioTitle,
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            color: VibeTokens.ink)),
                    const SizedBox(height: 2),
                    Text(_t.clioSubtitle,
                        style: TextStyle(
                            fontSize: 12.5, color: VibeTokens.muted)),
                  ],
                ),
              ),
              if (_clio != null)
                const Icon(Icons.check_circle,
                    color: Color(0xFF2E9E5B), size: 20),
            ],
          ),
          const SizedBox(height: VibeTokens.space12),
          TextField(
            controller: _clioUrlController,
            decoration: InputDecoration(
              isDense: true,
              labelText: _t.clioUrlLabel,
              hintText: 'https://mcp.clioapp.io/mcp',
            ),
          ),
          const SizedBox(height: VibeTokens.space8),
          TextField(
            controller: _clioTokenController,
            obscureText: !_clioTokenVisible,
            decoration: InputDecoration(
              isDense: true,
              labelText: _t.clioTokenLabel,
              suffixIcon: IconButton(
                icon: Icon(_clioTokenVisible
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined),
                onPressed: () =>
                    setState(() => _clioTokenVisible = !_clioTokenVisible),
              ),
            ),
          ),
          const SizedBox(height: VibeTokens.space12),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: _clioTesting ? null : _saveClioConnection,
                  child: Text(_t.save),
                ),
              ),
              const SizedBox(width: VibeTokens.space8),
              OutlinedButton.icon(
                onPressed: _clioTesting ? null : _testClioConnection,
                icon: _clioTesting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.cable_outlined),
                label: Text(_t.clioTestBtn),
              ),
            ],
          ),
          if (_clioTestResult.isNotEmpty) ...[
            const SizedBox(height: VibeTokens.space8),
            Text(_clioTestResult,
                style: TextStyle(fontSize: 12.5, color: VibeTokens.muted)),
          ],
        ],
      ),
    );
  }

  Widget _buildAssistantSettingsCard() {
    return Container(
      padding: const EdgeInsets.all(VibeTokens.space16),
      decoration: BoxDecoration(
        color: VibeTokens.panel,
        borderRadius: BorderRadius.circular(VibeTokens.rMd),
        border: Border.all(color: VibeTokens.border),
        boxShadow: VibeTokens.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: VibeTokens.brand.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(VibeTokens.rSm),
                ),
                child: const Icon(Icons.assistant_outlined,
                    color: VibeTokens.brand),
              ),
              const SizedBox(width: VibeTokens.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_t.assistantSettingsTitle,
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            color: VibeTokens.ink)),
                    const SizedBox(height: 2),
                    Text(_t.assistantSettingsSubtitle,
                        style: TextStyle(
                            fontSize: 12.5, color: VibeTokens.muted)),
                  ],
                ),
              ),
              if (_vibeAnswering)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
          const SizedBox(height: VibeTokens.space16),

          // Idioma de la app (cambia toda la interfaz).
          Text(_t.languageLabel,
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: VibeTokens.ink)),
          const SizedBox(height: VibeTokens.space8),
          SegmentedButton<AppLanguage>(
            segments: AppLanguage.values
                .map((l) => ButtonSegment<AppLanguage>(
                      value: l,
                      label: Text(l.nativeName),
                    ))
                .toList(),
            selected: {_appLanguage},
            showSelectedIcon: false,
            onSelectionChanged: (s) => _applyAppLanguage(s.first),
          ),
          const SizedBox(height: VibeTokens.space16),

          // Tema (claro / oscuro / sistema).
          Text(_t.themeLabel,
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: VibeTokens.ink)),
          const SizedBox(height: VibeTokens.space8),
          SegmentedButton<ThemeMode>(
            segments: [
              ButtonSegment(
                  value: ThemeMode.system,
                  icon: const Icon(Icons.brightness_auto_outlined),
                  label: Text(_t.themeSystem)),
              ButtonSegment(
                  value: ThemeMode.light,
                  icon: const Icon(Icons.light_mode_outlined),
                  label: Text(_t.themeLight)),
              ButtonSegment(
                  value: ThemeMode.dark,
                  icon: const Icon(Icons.dark_mode_outlined),
                  label: Text(_t.themeDark)),
            ],
            selected: {_themeMode},
            showSelectedIcon: false,
            onSelectionChanged: (s) => _applyThemeMode(s.first),
          ),
          const SizedBox(height: VibeTokens.space16),

          // Voz del asistente.
          Text(_t.voiceLabel,
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: VibeTokens.ink)),
          const SizedBox(height: VibeTokens.space8),
          Row(
            children: [
              Expanded(
                child: SegmentedButton<VoiceGender>(
                  segments: [
                    ButtonSegment<VoiceGender>(
                      value: VoiceGender.female,
                      icon: const Icon(Icons.face_3_outlined),
                      label: Text(_t.voiceFemale),
                    ),
                    ButtonSegment<VoiceGender>(
                      value: VoiceGender.male,
                      icon: const Icon(Icons.face_outlined),
                      label: Text(_t.voiceMale),
                    ),
                  ],
                  selected: {_voiceGender},
                  showSelectedIcon: false,
                  onSelectionChanged: (s) => _applyVoiceGender(s.first),
                ),
              ),
              const SizedBox(width: VibeTokens.space8),
              IconButton.filledTonal(
                tooltip: _t.testVoice,
                onPressed: _testAssistantVoice,
                icon: const Icon(Icons.volume_up_outlined),
              ),
            ],
          ),
          const SizedBox(height: VibeTokens.space16),

          // Clave de IA (Claude).
          Text(_t.claudeKeyLabel,
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: VibeTokens.ink)),
          const SizedBox(height: VibeTokens.space4),
          Text(_t.claudeKeyHint,
              style:
                  TextStyle(fontSize: 12.5, color: VibeTokens.muted)),
          const SizedBox(height: VibeTokens.space8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _claudeKeyController,
                  obscureText: !_claudeKeyVisible,
                  autocorrect: false,
                  enableSuggestions: false,
                  keyboardType: TextInputType.visiblePassword,
                  decoration: InputDecoration(
                    isDense: true,
                    border: const OutlineInputBorder(),
                    hintText: 'sk-ant-...',
                    suffixIcon: IconButton(
                      tooltip: _claudeKeyVisible ? _t.hidePassword : _t.showPassword,
                      onPressed: () => setState(
                          () => _claudeKeyVisible = !_claudeKeyVisible),
                      icon: Icon(_claudeKeyVisible
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: VibeTokens.space8),
              FilledButton(
                onPressed: _saveClaudeKey,
                child: Text(_t.save),
              ),
            ],
          ),
          const SizedBox(height: VibeTokens.space8),
          // Estado visible de la IA: confirma si la clave quedo registrada.
          Row(
            children: [
              Icon(
                _claude != null && _claude!.isConfigured
                    ? Icons.check_circle
                    : Icons.error_outline,
                size: 18,
                color: _claude != null && _claude!.isConfigured
                    ? VibeTokens.positive
                    : VibeTokens.danger,
              ),
              const SizedBox(width: VibeTokens.space8),
              Expanded(
                child: Text(
                  _claude != null && _claude!.isConfigured
                      ? '${_t.aiStatusActive} (${_claudeApiKey.length} car.)'
                      : _t.aiStatusNoKey,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: _claude != null && _claude!.isConfigured
                        ? VibeTokens.positive
                        : VibeTokens.danger,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: VibeTokens.space8),
          // Prueba real de la IA (llamada minima) para diagnosticar.
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: _vibeTestingAi ? null : _testClaudeConnection,
                icon: _vibeTestingAi
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.bolt_outlined),
                label: Text(_t.aiTestButton),
              ),
            ],
          ),
          if (_vibeAiTestResult.isNotEmpty) ...[
            const SizedBox(height: VibeTokens.space8),
            Text(
              _vibeAiTestResult,
              style: TextStyle(
                fontSize: 12.5,
                color: _vibeAiTestResult.startsWith(_t.aiTestOk)
                    ? VibeTokens.positive
                    : VibeTokens.danger,
              ),
            ),
          ],
          const SizedBox(height: VibeTokens.space16),

          // Escucha persistente.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_t.wakeLabel,
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: VibeTokens.ink)),
                    const SizedBox(height: 2),
                    Text(_t.wakeHint,
                        style: TextStyle(
                            fontSize: 12.5, color: VibeTokens.muted)),
                  ],
                ),
              ),
              const SizedBox(width: VibeTokens.space8),
              Switch(value: _wakeEnabled, onChanged: _applyWakeEnabled),
            ],
          ),
        ],
      ),
    );
  }

  void _handleNoteChanged() {
    if (!mounted) return;
    final text = _noteController.text.trim();
    setState(() {
      if (text.isEmpty) {
        _vibeCommandStatusMessage = '';
        _vibeCommandOnline = false;
      }
    });
  }

  void _activateVibeCommand() {
    setState(() {
      _selectedHomeTab = 1;
      _noteController.text = 'V';
      _noteController.selection = TextSelection.fromPosition(
        TextPosition(offset: _noteController.text.length),
      );
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vOnlineStatus;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 5),
        content: Text(_t.vOnlineWaiting),
      ),
    );
  }

  Future<void> _toggleVibeVoiceCommand() async {
    if (_vibeVoiceArmed || _isListeningForVibe) {
      await _deactivateVibeVoice(_t.vDeactivated);
    } else {
      await _startVibeVoiceCommand();
    }
  }

  Future<void> _startVibeVoiceCommand({bool resetUi = true}) async {
    try {
      if (!_speechReady) {
        final available = await _speechToText.initialize(
          onError: _handleVibeSpeechError,
          onStatus: _handleVibeSpeechStatus,
        );
        if (!mounted) return;
        if (!available) {
          setState(() {
            _vibeCommandOnline = false;
            _isListeningForVibe = false;
            _vibeCommandStatusMessage = _t.micPermissionNeeded;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(_t.micPermissionNeeded)),
          );
          return;
        }
        _speechReady = true;
      }

      setState(() {
        if (resetUi) _selectedHomeTab = 0;
        _vibeCommandOnline = true;
        _isListeningForVibe = true;
        _vibeVoiceArmed = true;
        _vibePausedForExternalAction = false;
        _lastVibeVoiceActivityAt = DateTime.now();
        _vibeVoiceTranscript = '';
        _vibeCommandStatusMessage =
            'V escuchando continuo. Di comandos; para salir di desactivar V.';
      });

      await _speechToText.listen(
        onResult: _handleVibeSpeechResult,
        listenOptions: SpeechListenOptions(
          listenFor: const Duration(seconds: 60),
          pauseFor: const Duration(seconds: 5),
          partialResults: true,
          cancelOnError: false,
          localeId: _vibeVoiceLanguage.localeId,
          listenMode: ListenMode.confirmation,
          autoPunctuation: true,
          enableHapticFeedback: true,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isListeningForVibe = false;
        _vibeCommandOnline = _vibeVoiceArmed;
        _vibeCommandStatusMessage = _vibeVoiceArmed
            ? _t.vRecovering
            : _t.vVoiceError(shorten(error.toString()));
      });
      if (_vibeVoiceArmed) {
        unawaited(_vibeVoiceWatchdog());
      }
    }
  }

  Future<void> _stopVibeVoiceCommand({required bool executeTranscript}) async {
    final transcript = _vibeVoiceTranscript.trim();
    await _speechToText.stop();
    if (!mounted) return;
    setState(() {
      _isListeningForVibe = false;
      _vibeCommandOnline = transcript.isNotEmpty;
      _vibeCommandStatusMessage = transcript.isEmpty
          ? 'V no escucho ningun comando.'
          : 'V escucho: $transcript';
    });
    if (executeTranscript && transcript.isNotEmpty) {
      await _executeVibeVoiceTranscript(transcript);
    }
  }

  Future<void> _deactivateVibeVoice(String message) async {
    await _speechToText.stop();
    _vibeHistory.clear(); // nueva sesion de V => memoria limpia
    if (!mounted) return;
    setState(() {
      _isListeningForVibe = false;
      _vibeVoiceArmed = false;
      _vibePausedForExternalAction = false;
      _vibeCommandOnline = false;
      _vibeCommandStatusMessage = message;
    });
  }

  Future<void> _restartVibeListeningLoop() async {
    if (!mounted || !_vibeVoiceArmed || _isListeningForVibe) return;
    // Escucha persistente: si esta desactivada, V actua como pulsa-para-hablar
    // (un comando por activacion) en lugar de seguir escuchando.
    if (!_wakeEnabled) {
      setState(() {
        _vibeVoiceArmed = false;
        _vibeCommandOnline = false;
      });
      return;
    }
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (!mounted || !_vibeVoiceArmed || _isListeningForVibe) return;
    await _startVibeVoiceCommand(resetUi: false);
  }

  Future<void> _vibeVoiceWatchdog() async {
    if (!mounted ||
        !_vibeVoiceArmed ||
        _isListeningForVibe ||
        _vibePausedForExternalAction ||
        _vibeRecoveryRunning) {
      return;
    }
    final lastActivity = _lastVibeVoiceActivityAt;
    final stale = lastActivity == null ||
        DateTime.now().difference(lastActivity) > const Duration(seconds: 3);
    if (!stale) return;
    _vibeRecoveryRunning = true;
    try {
      setState(() {
        _vibeCommandOnline = true;
        _vibeCommandStatusMessage = _t.vRecovering;
      });
      await _restartVibeListeningLoop();
    } finally {
      _vibeRecoveryRunning = false;
    }
  }

  Future<bool> _pauseVibeVoiceForExternalAction(String label) async {
    final shouldResume = _vibeVoiceArmed;
    if (!shouldResume) return false;
    _vibePausedForExternalAction = true;
    await _speechToText.stop();
    if (!mounted) return false;
    setState(() {
      _isListeningForVibe = false;
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vPaused(label);
    });
    return true;
  }

  Future<void> _resumeVibeVoiceAfterExternalAction(
    bool shouldResume,
    String label,
  ) async {
    _vibePausedForExternalAction = false;
    if (!mounted || !shouldResume || !_vibeVoiceArmed) return;
    setState(() {
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vResumed(label);
    });
    await _restartVibeListeningLoop();
  }

  void _handleVibeSpeechResult(SpeechRecognitionResult result) {
    final words = result.recognizedWords.trim();
    if (!mounted || words.isEmpty) return;
    _vibeBenignErrorStreak = 0;
    setState(() {
      _vibeVoiceTranscript = words;
      _vibeCommandStatusMessage =
          result.finalResult ? 'V entendio: $words' : 'V escuchando: $words';
    });
    if (result.finalResult) {
      unawaited(_stopVibeVoiceCommand(executeTranscript: true));
    }
  }

  /// Un error de voz es FATAL solo si implica permiso/disponibilidad: ahi si hay
  /// que desarmar V y avisar. Silencio, ruido o "no entendi" (error_no_match,
  /// error_speech_timeout, error_no_speech, busy, client, network) son normales
  /// mientras V espera y NO deben cancelar V, aunque el plugin los marque como
  /// permanentes.
  bool _isFatalSpeechError(SpeechRecognitionError error) {
    final msg = error.errorMsg.toLowerCase();
    return msg.contains('denied') ||
        msg.contains('permission') ||
        msg.contains('not-allowed') ||
        msg.contains('not_allowed') ||
        msg.contains('authoriz') ||
        msg.contains('unavailable') ||
        msg.contains('insufficient') ||
        msg.contains('language-not-supported');
  }

  void _handleVibeSpeechError(SpeechRecognitionError error) {
    if (!mounted) return;
    final fatal = _isFatalSpeechError(error);
    if (fatal) {
      setState(() {
        _isListeningForVibe = false;
        _vibeVoiceArmed = false;
        _vibeCommandOnline = false;
        _vibeCommandStatusMessage = _t.micPermissionNeeded;
      });
      return;
    }
    // Error benigno: V sigue vivo y simplemente vuelve a escuchar. No mostramos
    // un mensaje de error que asuste ni desarmamos V.
    _vibeBenignErrorStreak++;
    if (mounted) {
      setState(() {
        _isListeningForVibe = false;
        _vibeCommandOnline = _vibeVoiceArmed;
        if (_vibeVoiceArmed) _vibeCommandStatusMessage = _t.vListening;
      });
    }
    if (_vibeVoiceArmed && _wakeEnabled) {
      // Tras varios silencios seguidos, espera un poco mas para no reintentar en
      // bucle apretado, pero sin cancelar V.
      final backoff = _vibeBenignErrorStreak >= 5
          ? const Duration(milliseconds: 1500)
          : const Duration(milliseconds: 350);
      Future<void>.delayed(backoff, () {
        if (mounted && _vibeVoiceArmed && !_isListeningForVibe) {
          unawaited(_restartVibeListeningLoop());
        }
      });
    }
  }

  void _handleVibeSpeechStatus(String status) {
    if (!mounted) return;
    if (status == 'done' || status == 'notListening') {
      setState(() => _isListeningForVibe = false);
      if (_vibeVoiceArmed && _vibeVoiceTranscript.trim().isEmpty) {
        unawaited(_restartVibeListeningLoop());
      }
    }
  }

  Future<void> _executeVibeVoiceTranscript(String rawTranscript) async {
    final transcript = rawTranscript.trim();
    if (transcript.isEmpty) return;
    // Quita la frase de activacion ("V", "hola V", ...) antes de interpretar.
    final stripped = stripNativeWakePhrase(transcript).trim();
    final effective = stripped.isEmpty ? transcript : stripped;
    final lower = stripDiacritics(effective.toLowerCase());

    setState(() {
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = '${_t.vListening}: $effective';
    });

    // Capa 1 (rapida, local): interpretacion tolerante por sinonimos/difuso.
    final match = _intentEngine.classify(lower, _appLanguage);
    if (match.intent != VibeIntent.unknown &&
        match.intent != VibeIntent.askQuestion) {
      await _runIntent(match.intent, transcript: transcript, effective: effective);
      return;
    }
    // Capa 2 (LLM tool-calling): si hay IA, deja que decida la accion o responda.
    if (_claude != null && _claude!.isConfigured) {
      await _smartVibeRoute(effective, transcript);
    } else {
      // Sin IA: responde (avisa que falta la clave).
      await _answerWithClaude(effective);
      await _restartVibeListeningLoop();
    }
  }

  /// Ejecuta una intencion concreta de V (con confirmacion visible+hablada).
  /// `noteOverride` permite fijar el texto de la nota (p.ej. el que devuelve la IA).
  Future<void> _runIntent(
    VibeIntent intent, {
    required String transcript,
    required String effective,
    String? noteOverride,
  }) async {
    switch (intent) {
      case VibeIntent.deactivate:
        await _deactivateVibeVoice(_t.vDeactivatedByCommand);
        return;
      case VibeIntent.navHome:
        _vibeGoToTab(0, _t.homeTab);
        await _vibeConfirmAndResume(_t.confNavigated(_t.homeTab));
        return;
      case VibeIntent.navCapture:
        _vibeGoToTab(1, _t.captureTab);
        await _vibeConfirmAndResume(_t.confNavigated(_t.captureTab));
        return;
      case VibeIntent.navSaved:
        _vibeGoToTab(2, _t.savedTab);
        await _vibeConfirmAndResume(_t.confNavigated(_t.savedTab));
        return;
      case VibeIntent.navAssets:
        _vibeGoToTab(3, _t.assetsTab);
        await _vibeConfirmAndResume(_t.confNavigated(_t.assetsTab));
        return;
      case VibeIntent.navAgenda:
        _vibeGoToTab(4, _t.agendaTab);
        await _vibeConfirmAndResume(_t.confNavigated(_t.agendaTab));
        return;
      case VibeIntent.navStatus:
        _vibeGoToTab(5, _t.statusTab);
        await _vibeConfirmAndResume(_t.confNavigated(_t.statusTab));
        return;
      case VibeIntent.navAccount:
        _vibeGoToTab(6, _t.accountTab);
        await _vibeConfirmAndResume(_t.confNavigated(_t.accountTab));
        return;
      case VibeIntent.photo:
        await _vibeOpenPhoto();
        return;
      case VibeIntent.video:
        await _vibeOpenVideo();
        return;
      case VibeIntent.audio:
        await _vibeToggleAudio();
        await _vibeConfirmAndResume(
            _isRecordingAudio ? _t.confAudioRecording : _t.confAudioSaved);
        return;
      case VibeIntent.biometrics:
        await _vibeOpenBiometrics();
        return;
      case VibeIntent.location:
        await _captureLocation();
        await _vibeConfirmAndResume(_t.confLocation);
        return;
      case VibeIntent.sync:
        await _syncPendingQueue(showSnackBar: true, force: true);
        await _vibeConfirmAndResume(_t.confSynced);
        return;
      case VibeIntent.verifyBackend:
        await _verifyBackendHealth();
        await _vibeConfirmAndResume(_t.confBackend);
        return;
      case VibeIntent.clearSynced:
        await _clearSyncedQueueItems();
        await _vibeConfirmAndResume(_t.confCleaned);
        return;
      case VibeIntent.clearLocalTests:
        await _clearLocalUnsyncedTestItems();
        await _vibeConfirmAndResume(_t.confCleaned);
        return;
      case VibeIntent.resetLocal:
        await _resetLocalVibeTestState();
        await _vibeConfirmAndResume(_t.confCleaned);
        return;
      case VibeIntent.importExternal:
        await _importExternalSession();
        await _restartVibeListeningLoop();
        return;
      case VibeIntent.healthConnect:
        await _prepareHealthConnectPilotBundle();
        await _vibeConfirmAndResume(_t.confBiometric);
        return;
      case VibeIntent.health:
        await _vibeSpeakHealthSummary();
        return;
      case VibeIntent.openManual:
        if (mounted) {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => UserManualScreen(strings: _t)),
          );
        }
        await _vibeConfirmAndResume(_t.confOpeningManual);
        return;
      case VibeIntent.help:
        await _vibeConfirmAndResume(_t.helpSpoken);
        return;
      case VibeIntent.dailyBriefing:
        await _vibeDailyBriefing();
        return;
      case VibeIntent.queryCaptures:
        await _vibeAnswerCaptures();
        return;
      case VibeIntent.takeNote:
        final body = (noteOverride != null && noteOverride.trim().isNotEmpty)
            ? noteOverride.trim()
            : transcript;
        final commandText =
            hasNativeWakePhrase(body) ? body : 'V, $body';
        _noteController.text = commandText;
        _noteController.selection = TextSelection.fromPosition(
          TextPosition(offset: _noteController.text.length),
        );
        await _saveDraft();
        await _vibeConfirmAndResume(_t.confNote);
        return;
      case VibeIntent.askQuestion:
      case VibeIntent.unknown:
        await _answerWithClaude(effective);
        await _restartVibeListeningLoop();
        return;
    }
  }

  /// Tool-calling: la IA elige la accion (o responde). Mapea la accion a un
  /// VibeIntent y la ejecuta; si es "answer", muestra y dice la respuesta.
  /// Registra un turno en la memoria de conversacion de V (recortando textos
  /// largos y el historial total para no crecer sin limite).
  void _recordVibeTurn(String role, String text) {
    final t = text.trim();
    if (t.isEmpty) return;
    _vibeHistory.add({
      'role': role,
      'text': t.length > 500 ? t.substring(0, 500) : t,
    });
    if (_vibeHistory.length > 16) {
      _vibeHistory.removeRange(0, _vibeHistory.length - 16);
    }
  }

  /// Devuelve el historial saneado para la API: estrictamente alternado
  /// user/assistant, empezando en user y terminando en assistant (el mensaje
  /// de usuario actual lo agrega el cliente aparte). Ultimos 6 turnos.
  List<Map<String, String>> _vibeContextForApi() {
    final out = <Map<String, String>>[];
    String? last;
    for (final t in _vibeHistory) {
      final role = t['role'];
      if (role == last) continue;
      out.add({'role': role!, 'text': t['text'] ?? ''});
      last = role;
    }
    while (out.isNotEmpty && out.first['role'] != 'user') {
      out.removeAt(0);
    }
    while (out.isNotEmpty && out.last['role'] != 'assistant') {
      out.removeLast();
    }
    return out.length > 6 ? out.sublist(out.length - 6) : out;
  }

  Future<void> _smartVibeRoute(String effective, String transcript) async {
    setState(() {
      _vibeAnswering = true;
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vThinking;
    });
    Map<String, dynamic> decision;
    try {
      decision = await _claude!
          .routeIntent(effective, lang: _appLanguage, history: _vibeContextForApi());
    } catch (error) {
      if (mounted) {
        setState(() {
          _vibeAnswering = false;
          _vibeCommandStatusMessage =
              '${_t.vAiError}\n(${shorten(error.toString(), 160)})';
        });
      }
      // Si falla el enrutado, intentamos responder como Q&A normal.
      await _answerWithClaude(effective);
      await _restartVibeListeningLoop();
      return;
    }
    if (mounted) setState(() => _vibeAnswering = false);
    final actionStr = (decision['action'] as String?)?.trim() ?? 'answer';
    VibeIntent? intent;
    for (final e in VibeIntent.values) {
      if (e.name == actionStr) {
        intent = e;
        break;
      }
    }
    if (intent != null &&
        intent != VibeIntent.askQuestion &&
        intent != VibeIntent.unknown) {
      final note = decision['note'] as String?;
      _recordVibeTurn('user', effective);
      _recordVibeTurn(
          'assistant',
          '[accion ejecutada: ${intent.name}'
          '${(note != null && note.trim().isNotEmpty) ? ' — ${note.trim()}' : ''}]');
      await _runIntent(intent,
          transcript: transcript, effective: effective, noteOverride: note);
      return;
    }
    // Respuesta (Q&A). Usamos el texto ya devuelto por la misma llamada.
    final answer = (decision['answer'] as String?)?.trim();
    if (answer == null || answer.isEmpty) {
      await _answerWithClaude(effective);
      await _restartVibeListeningLoop();
      return;
    }
    _recordVibeTurn('user', effective);
    _recordVibeTurn('assistant', answer);
    if (mounted) {
      setState(() {
        _vibeCommandOnline = true;
        _vibeCommandStatusMessage = answer;
      });
    }
    final resumed = await _pauseVibeVoiceForExternalAction(_t.vThinking);
    await _tts.speak(answer, lang: _appLanguage, gender: _voiceGender);
    await _resumeVibeVoiceAfterExternalAction(resumed, _t.vThinking);
  }

  /// Q&A con IA: V consulta a Claude (cliente independiente del backend) y
  /// responde por pantalla y por voz. Pausa la escucha mientras habla para no
  /// transcribir su propia voz (anti-eco).
  Future<void> _answerWithClaude(String question) async {
    final client = _claude;
    if (client == null || !client.isConfigured) {
      setState(() {
        _vibeCommandOnline = true;
        _vibeCommandStatusMessage = _t.vNoKey;
      });
      final resumedNoKey = await _pauseVibeVoiceForExternalAction(_t.vThinking);
      await _tts.speak(_t.vNoKey, lang: _appLanguage, gender: _voiceGender);
      await _resumeVibeVoiceAfterExternalAction(resumedNoKey, _t.vThinking);
      return;
    }
    setState(() {
      _vibeAnswering = true;
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vThinking;
    });
    final resumed = await _pauseVibeVoiceForExternalAction(_t.vThinking);
    String answer;
    String spoken;
    try {
      answer = await client.ask(question,
          lang: _appLanguage, history: _vibeContextForApi());
      spoken = answer;
      _recordVibeTurn('user', question);
      _recordVibeTurn('assistant', spoken);
    } catch (error) {
      // En pantalla mostramos el detalle real (para diagnosticar clave/modelo/
      // conexion); por voz, el mensaje amable.
      answer = '${_t.vAiError}\n(${shorten(error.toString(), 160)})';
      spoken = _t.vAiError;
    }
    if (!mounted) {
      await _resumeVibeVoiceAfterExternalAction(resumed, _t.vThinking);
      return;
    }
    setState(() {
      _vibeAnswering = false;
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = answer;
    });
    await _tts.speak(spoken, lang: _appLanguage, gender: _voiceGender);
    await _resumeVibeVoiceAfterExternalAction(resumed, _t.vThinking);
  }


  /// Cierre de una accion: V confirma por pantalla y por voz que termino
  /// ("Nota creada", "Foto guardada", ...) y vuelve a escuchar. Pausa la
  /// escucha mientras habla para no oirse a si misma (anti-eco).
  Future<void> _vibeConfirmAndResume(String message) async {
    if (mounted) {
      setState(() {
        _vibeCommandOnline = true;
        _vibeCommandStatusMessage = message;
      });
    }
    final wasArmed = _vibeVoiceArmed;
    _vibePausedForExternalAction = true;
    try {
      await _speechToText.stop();
    } catch (_) {}
    if (mounted) setState(() => _isListeningForVibe = false);
    await _tts.speak(message, lang: _appLanguage, gender: _voiceGender);
    _vibePausedForExternalAction = false;
    _lastVibeVoiceActivityAt = DateTime.now();
    if (wasArmed && _vibeVoiceArmed && mounted) {
      await _restartVibeListeningLoop();
    }
  }

  Future<void> _vibeSaveQuickNote() async {
    setState(() {
      _selectedHomeTab = 1;
      _noteController.text = 'V, toma nota prueba de V';
      _noteController.selection = TextSelection.fromPosition(
        TextPosition(offset: _noteController.text.length),
      );
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vRunningQuickNote;
    });
    await _saveDraft();
  }

  Future<void> _vibeToggleAudio() async {
    setState(() {
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage =
          _isRecordingAudio ? _t.vSavingAudio : _t.vRecordingAudio;
    });
    await _toggleAudioRecording();
  }

  Future<void> _vibeOpenAgenda() async {
    setState(() {
      _selectedHomeTab = 4;
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vOpeningAgenda;
    });
    await _openAgendaSheet();
  }

  /// Senal simple de "se agrego algo" para saber si una captura termino o se
  /// cancelo: combina tamano de la cola y total de adjuntos.
  int _captureProgressSignal() {
    var attachments = 0;
    for (final item in _queue) {
      attachments += item.attachments.length;
    }
    final session = _activeSession;
    if (session != null) attachments += session.attachments.length;
    return _queue.length * 100000 + attachments;
  }

  /// Cierra una captura nativa (foto/video/biometria): si V estaba activo,
  /// confirma por voz si se guardo o se cancelo, y reanuda la escucha.
  Future<void> _vibeCloseCapture(bool wasArmed, int before, String savedMsg) async {
    final saved = _captureProgressSignal() > before;
    if (wasArmed) {
      await _vibeConfirmAndResume(saved ? savedMsg : _t.confCanceled);
    } else {
      _vibePausedForExternalAction = false;
    }
  }

  Future<void> _vibeOpenPhoto() async {
    final shouldResume = await _pauseVibeVoiceForExternalAction(_t.actPhoto);
    final before = _captureProgressSignal();
    try {
      setState(() {
        _vibeCommandOnline = true;
        _vibeCommandStatusMessage = _t.vOpeningPhoto;
      });
      await _openPhotoCaptureSheet();
    } finally {
      await _vibeCloseCapture(shouldResume, before, _t.confPhoto);
    }
  }

  Future<void> _vibeOpenVideo() async {
    final shouldResume = await _pauseVibeVoiceForExternalAction(_t.capVideo);
    final before = _captureProgressSignal();
    try {
      setState(() {
        _vibeCommandOnline = true;
        _vibeCommandStatusMessage = _t.vOpeningVideo;
      });
      await _openVideoCaptureSheet();
    } finally {
      await _vibeCloseCapture(shouldResume, before, _t.confVideo);
    }
  }

  Future<void> _vibeOpenBiometrics() async {
    final shouldResume =
        await _pauseVibeVoiceForExternalAction(_t.biometricsLabel);
    final before = _captureProgressSignal();
    try {
      setState(() {
        _vibeCommandOnline = true;
        _vibeCommandStatusMessage = _t.vOpeningBiometrics;
      });
      await _openBiometricImportSheet();
    } finally {
      await _vibeCloseCapture(shouldResume, before, _t.confBiometric);
    }
  }

  void _vibeGoToTab(int index, String label) {
    setState(() {
      _selectedHomeTab = index;
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vNavigatedTo(label);
    });
  }

  void _vibeStartExperienceNow() {
    setState(() {
      _sessionTitleController.text = _t.experienceFromV;
      _vibeCommandOnline = true;
      _vibeCommandStatusMessage = _t.vStartingExperience;
    });
    _startExperienceSession();
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

  Future<File> _sessionStorageFile() async {
    final directory = await getApplicationDocumentsDirectory();
    return File(
        '${directory.path}${Platform.pathSeparator}vibeapp-session.json');
  }

  Future<void> _loadPersistedSession() async {
    try {
      // Keychain primero (sobrevive reinstalaciones). Si no hay, migra desde el
      // archivo JSON antiguo y lo reescribe en el Keychain.
      String? raw = await kSecureStore.read(VibeSecureStore.sessionKey);
      if (raw == null || raw.isEmpty) {
        final file = await _sessionStorageFile();
        if (await file.exists()) {
          raw = await file.readAsString();
          if (raw.isNotEmpty) {
            await kSecureStore.write(VibeSecureStore.sessionKey, raw);
          }
        }
      }
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final session = PersistedVibeSession.fromJson(
        Map<String, dynamic>.from(decoded),
      );
      if (!session.isUsable || !mounted) return;
      setState(() {
        _apiUrlController.text = session.apiBaseUrl;
        _emailController.text = session.email;
        _accessToken = session.accessToken;
        _signedInEmail = session.email;
        _authStatusOk = true;
        _authStatusMessage = _t.sessionRemembered;
        _syncState = SyncState.synced;
      });
      unawaited(_syncPendingQueue());
    } catch (_) {
      // If the remembered session cannot be read, the user can still sign in.
    }
  }

  Future<void> _saveSession() async {
    try {
      final session = PersistedVibeSession(
        apiBaseUrl: _apiUrlController.text.trim(),
        email: _signedInEmail,
        accessToken: _accessToken,
        savedAt: DateTime.now().toUtc(),
      );
      if (!session.isUsable) return;
      final raw = jsonEncode(session.toJson());
      await kSecureStore.write(VibeSecureStore.sessionKey, raw);
      // Espejo en archivo por compatibilidad/migracion (no es la fuente de verdad).
      final file = await _sessionStorageFile();
      await file.writeAsString(raw);
    } catch (_) {
      // Session persistence is only a convenience; sync still works in memory.
    }
  }

  Future<void> _signIn() async {
    final settings = SyncSettings(
      apiBaseUrl: _apiUrlController.text.trim(),
      accessToken: _accessToken,
    );
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (settings.apiBaseUrl.isEmpty) {
      setState(() {
        _authStatusOk = false;
        _authStatusMessage = _t.signInFailed;
        _syncState = SyncState.needsAttention;
      });
      return;
    }
    if (email.isEmpty || password.isEmpty) {
      setState(() {
        _authStatusOk = false;
        _authStatusMessage = _t.enterEmailPassword;
        _syncState = SyncState.needsAttention;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.enterEmailPasswordToSync)),
      );
      return;
    }
    setState(() {
      _isSigningIn = true;
      _authStatusOk = false;
      _authStatusMessage = _t.signingIn;
      _syncState = SyncState.syncing;
    });
    final result =
        await VibeAuthClient(settings).signInViaBackend(email, password);
    if (!mounted) return;
    if (result.ok && result.accessToken.isNotEmpty) {
      setState(() {
        _isSigningIn = false;
        _accessToken = result.accessToken;
        _signedInEmail = email;
        _authStatusOk = true;
        _authStatusMessage = _t.signInReady;
        _syncState = SyncState.synced;
      });
      await _saveSession();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.reviewingPending)),
      );
      await _syncPendingQueue(showSnackBar: true);
    } else {
      setState(() {
        _isSigningIn = false;
        _authStatusOk = false;
        _authStatusMessage = _t.signInFailedDetailed;
        _syncState = SyncState.needsAttention;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.signInFailedDetailed)),
      );
    }
  }

  Future<void> _verifyBackendHealth() async {
    final baseUrl = _apiUrlController.text.trim();
    if (baseUrl.isEmpty) {
      setState(() {
        _backendHealthOk = false;
        _backendHealthMessage = _t.defineUrlFirst;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.writeUrlFirst)),
      );
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
            ? _t.backendReady(mode, persistence, storage)
            : _t.backendNeedsSupabase;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_backendHealthOk
              ? _t.backendVerifiedOk
              : _t.backendVerifiedPartial),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _backendHealthOk = false;
        _backendHealthMessage =
            _t.backendCheckErrorDetail(shorten(error.toString()));
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.backendCheckFailed)),
      );
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

    if (command.type == NativeQuickCommandType.listen) {
      if (!mounted) return;
      setState(() {
        _vibeCommandOnline = true;
        _vibeCommandStatusMessage =
            'Vibe en linea. Ahora escribe o dicta la accion despues de V.';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          duration: Duration(seconds: 5),
          content: Text(
            'Vibe en linea. Ahora escribe o dicta la accion despues de V.',
          ),
        ),
      );
      return;
    }

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
        SnackBar(content: Text(_t.experienceActive(title))),
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
      _vibeCommandStatusMessage = '';
      _vibeCommandOnline = false;
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
          item.error = 'Entra para guardar en tus otros dispositivos.';
        }
        _syncState = SyncState.needsAttention;
      });
      if (showSnackBar && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text(
                  'Captura guardada localmente. Falta token de sesion para sincronizar.')),
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
    setState(() {
      _syncState = failures == 0 ? SyncState.synced : SyncState.needsAttention;
      _lastSyncAt = DateTime.now();
    });
    await _saveQueue();
    if (!mounted) return;
    if (showSnackBar) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            failures == 0
                ? 'Captura sincronizada con Vibe PWA.'
                : 'Captura guardada en este dispositivo. Se enviara cuando haya conexion.',
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
    var titleError = '';

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
                    tr.createAgendaEventTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(tr.agendaSheetBlurb),
                  const SizedBox(height: 14),
                  TextField(
                    controller: titleController,
                    decoration: InputDecoration(
                      labelText: tr.titleField,
                      hintText: tr.titleHint,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  if (titleError.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      titleError,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
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
                    decoration: InputDecoration(
                      labelText: tr.durationField,
                      border: const OutlineInputBorder(),
                    ),
                    items: [
                      DropdownMenuItem(
                          value: 15, child: Text(tr.minutesOption(15))),
                      DropdownMenuItem(
                          value: 30, child: Text(tr.minutesOption(30))),
                      DropdownMenuItem(value: 60, child: Text(tr.hoursOption(1))),
                      DropdownMenuItem(value: 120, child: Text(tr.hoursOption(2))),
                      DropdownMenuItem(value: 180, child: Text(tr.hoursOption(3))),
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
                    decoration: InputDecoration(
                      labelText: tr.placeField,
                      hintText: tr.optionalHint,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    minLines: 2,
                    maxLines: 4,
                    decoration: InputDecoration(
                      labelText: tr.notesField,
                      hintText: tr.notesHint,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        final title = titleController.text.trim();
                        if (title.isEmpty) {
                          setSheetState(() {
                            titleError = tr.addTitleError;
                          });
                          return;
                        }
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
                      label: Text(tr.saveAndContinue),
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
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_t.agendaSaved(draft.title)),
        action: SnackBarAction(
          label: _t.viewAction,
          onPressed: () => setState(() => _selectedHomeTab = 4),
        ),
      ),
    );
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
                'Activa ubicacion en el dispositivo para capturar el lugar.'),
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
          SnackBar(content: Text(_t.allowLocation)),
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
              'No se pudo capturar ubicacion: ${shorten(error.toString())}'),
        ),
      );
    }
  }

  Future<void> _importBiometricFile() async {
    try {
      final picked = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['csv', 'json', 'zip'],
        withData: true,
      );
      final pickedFile = picked?.files.single;
      if (pickedFile == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(_t.noBiometricFile)),
          );
        }
        return;
      }
      var filePath = pickedFile.path;
      late final List<int> rawBytes;
      if (filePath != null && filePath.isNotEmpty) {
        rawBytes = await File(filePath).readAsBytes();
      } else if (pickedFile.bytes != null && pickedFile.bytes!.isNotEmpty) {
        rawBytes = pickedFile.bytes!;
        final directory = await getTemporaryDirectory();
        final safeName = pickedFile.name
            .replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '_')
            .replaceAll(RegExp(r'^_+|_+$'), '');
        final importedFile = File(
          '${directory.path}${Platform.pathSeparator}'
          'vibeapp-biometric-${DateTime.now().microsecondsSinceEpoch}-'
          '${safeName.isEmpty ? 'biometria.csv' : safeName}',
        );
        await importedFile.writeAsBytes(rawBytes, flush: true);
        filePath = importedFile.path;
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(_t.cannotReadFile)),
          );
        }
        return;
      }
      final isZip = pickedFile.name.toLowerCase().endsWith('.zip');
      final rawText = isZip ? '' : utf8.decode(rawBytes, allowMalformed: true);
      final summary = isZip
          ? BiometricImportSummary.fromOriginalArchive(
              fileName: pickedFile.name,
              size: pickedFile.size,
            )
          : BiometricImportSummary.fromRawText(
              rawText,
              fileName: pickedFile.name,
              size: pickedFile.size,
            );
      final attachment = NativeAttachmentDraft.fromFilePath(
        filePath,
        sourceType: 'biometric',
        previewText: summary.summaryText,
        analysisText: summary.analysisText,
        metadataExtras: {
          'payloadType': isZip ? 'biometric_archive' : 'biometric',
          if (!isZip)
            'extractedText':
                rawText.length > 12000 ? rawText.substring(0, 12000) : rawText,
          'extractionMethod': 'vibeapp-biometric-file-import',
          'extractionStatus': isZip ? 'archive-preserved' : 'automatic',
          if (isZip) 'originalArchive': true,
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(summary.userSummary),
            action: SnackBarAction(
              label: _t.viewAction,
              onPressed: () => setState(() => _selectedHomeTab = 3),
            ),
          ),
        );
      }
      await _syncPendingQueue(showSnackBar: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr.importBiometricError(shorten(error.toString()))),
        ),
      );
    }
  }

  Future<void> _openBiometricImportSheet() async {
    final proceed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr.importBiometricsTitle),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(tr.biometricSheetBlurb),
              const SizedBox(height: 12),
              _BiometricSourceRow(
                icon: Icons.apple,
                title: 'Apple Health',
                detail: tr.biometricAppleDetail,
              ),
              _BiometricSourceRow(
                icon: Icons.watch_outlined,
                title: 'Oura / Samsung / Health Connect',
                detail: tr.biometricOuraDetail,
              ),
              _BiometricSourceRow(
                icon: Icons.privacy_tip_outlined,
                title: tr.biometricPrivacyTitle,
                detail: tr.biometricPrivacyDetail,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(tr.cancel),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.of(context).pop(true),
            icon: const Icon(Icons.upload_file_outlined),
            label: Text(tr.chooseFile),
          ),
        ],
      ),
    );
    if (proceed == true) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.openingFilePicker)),
      );
      await Future<void>.delayed(const Duration(milliseconds: 250));
      await _importBiometricFile();
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
                    tr.importExternalTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(tr.externalSheetBlurb),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<ExternalSessionSource>(
                    initialValue: selectedSource,
                    decoration: InputDecoration(
                      labelText: tr.sourceField,
                      border: const OutlineInputBorder(),
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
                    decoration: InputDecoration(
                      labelText: tr.experienceTitleField,
                      hintText: tr.experienceTitleHint,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    minLines: 3,
                    maxLines: 5,
                    decoration: InputDecoration(
                      labelText: tr.contextField,
                      hintText: tr.contextHint,
                      border: const OutlineInputBorder(),
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
                      label: Text(tr.chooseFiles),
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
                tr.addPhotoTitle,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(tr.photoSheetBlurb),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: Text(tr.takePhotoSheet),
                onTap: () => Navigator.of(context).pop(ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: Text(tr.chooseImage),
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
                tr.addVideoTitle,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(tr.videoSheetBlurb),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.videocam_outlined),
                title: Text(tr.recordVideoSheet),
                onTap: () => Navigator.of(context).pop(ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.video_library_outlined),
                title: Text(tr.chooseVideo),
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
          SnackBar(content: Text(_t.allowMicForAudio)),
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
      // Suscripcion a la amplitud para dibujar el waveform en vivo.
      _audioLevels.clear();
      await _amplitudeSub?.cancel();
      _amplitudeSub = _audioRecorder
          .onAmplitudeChanged(const Duration(milliseconds: 120))
          .listen((amp) {
        // current en dBFS (0 = max, ~-60 = silencio) -> [0,1].
        final norm = ((amp.current + 60) / 60).clamp(0.0, 1.0);
        if (!mounted) return;
        setState(() {
          _audioLevels.add(norm);
          if (_audioLevels.length > 48) {
            _audioLevels.removeRange(0, _audioLevels.length - 48);
          }
        });
      });
      if (!mounted) return;
      setState(() {
        _isRecordingAudio = true;
        _audioRecordingPath = path;
        _syncState = SyncState.ready;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.recordingAudioTapAudio)),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _syncState = SyncState.needsAttention);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text(tr.audioStartError(shorten(error.toString()))),
        ),
      );
    }
  }

  Future<void> _stopAudioRecording() async {
    try {
      await _amplitudeSub?.cancel();
      _amplitudeSub = null;
      final path = await _audioRecorder.stop();
      final resolvedPath =
          (path == null || path.isEmpty) ? _audioRecordingPath : path;
      if (!mounted) return;
      setState(() {
        _isRecordingAudio = false;
        _audioRecordingPath = '';
        _audioLevels.clear();
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
      // Si hay clave de transcripcion, transcribe el audio y vuelca el texto en
      // el campo de nota (el archivo local aun existe tras detener).
      unawaited(_transcribeAudio(resolvedPath));
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
              Text(tr.audioSaveError(shorten(error.toString()))),
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
      SnackBar(content: Text(_t.experienceActive(title))),
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
    final syncedCount =
        _queue.where((item) => item.status == CaptureSyncStatus.synced).length;
    if (syncedCount == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.noSyncedToClean)),
      );
      return;
    }
    final confirmed = await _confirmAction(
      title: _t.clearSyncedTitle,
      message: _t.clearSyncedMessage(syncedCount),
      confirmLabel: _t.clearLabel,
    );
    if (!confirmed || !mounted) return;
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
      SnackBar(content: Text(_t.syncedCleared)),
    );
  }

  Future<void> _clearLocalUnsyncedTestItems() async {
    final localCount =
        _queue.where((item) => item.status != CaptureSyncStatus.synced).length;
    if (localCount == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t.noLocalTests)),
      );
      return;
    }
    final confirmed = await _confirmAction(
      title: _t.deleteLocalTitle,
      message: _t.deleteLocalMessage(localCount),
      confirmLabel: _t.deleteLocalConfirm,
    );
    if (!confirmed || !mounted) return;
    setState(() {
      _queue.removeWhere((item) => item.status != CaptureSyncStatus.synced);
      _syncState = _queue.isEmpty ? SyncState.ready : SyncState.synced;
    });
    await _saveQueue();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t.localTestsDeleted)),
    );
  }

  Future<void> _resetLocalVibeTestState() async {
    final confirmed = await _confirmAction(
      title: _t.resetLocalTitle,
      message: _t.resetLocalMessage,
      confirmLabel: _t.resetLocalConfirm,
    );
    if (!confirmed || !mounted) return;
    setState(() {
      _queue.clear();
      _activeSession = null;
      _sessionTitleController.clear();
      _noteController.clear();
      _vibeCommandStatusMessage = '';
      _vibeVoiceTranscript = '';
      _syncState = SyncState.ready;
    });
    await _saveQueue();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t.localResetDone)),
    );
  }

  Future<bool> _confirmAction({
    required String title,
    required String message,
    String? confirmLabel,
  }) async {
    final confirmText = confirmLabel ?? _t.continueLabel;
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(_t.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(confirmText),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _prepareHealthConnectPilotBundle() async {
    final bundle = HealthConnectPreviewBundle.pilot();
    setState(() {
      _queue.insert(0, CaptureQueueItem.healthConnect(bundle));
      _syncState = SyncState.syncing;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t.healthConnectPrepared)),
    );
    await _syncPendingQueue(showSnackBar: true);
  }

  @override
  Widget build(BuildContext context) {
    final hasDraft = _noteController.text.trim().isNotEmpty;
    final commandPreview =
        !hasDraft ? null : NativeQuickCommand.parse(_noteController.text);
    final queueSummary = CaptureQueueSummary.fromItems(_queue);

    final noteComposer = QuickNoteComposer(
      noteController: _noteController,
      commandPreview: commandPreview,
      hasDraft: hasDraft,
      vibeStatusMessage: _vibeCommandStatusMessage,
      vibeOnline: _vibeCommandOnline,
      onActivateVibe: _activateVibeCommand,
      onAudio: _vibeToggleAudio,
      onSave: _saveDraft,
      onImprove: _improveNote,
      improving: _improvingNote,
      isRecordingAudio: _isRecordingAudio,
      audioLevels: _audioLevels,
    );

    final captureActions = CaptureActionGrid(
      onAction: _registerNativeAction,
      onAudio: _toggleAudioRecording,
      onPhoto: _openPhotoCaptureSheet,
      onVideo: _openVideoCaptureSheet,
      onAgenda: _openAgendaSheet,
      onLocation: _captureLocation,
      onBiometrics: _openBiometricImportSheet,
      isRecordingAudio: _isRecordingAudio,
    );

    final sessionCard = ExperienceSessionCard(
      titleController: _sessionTitleController,
      session: _activeSession,
      onStart: _startExperienceSession,
      onClose: _closeExperienceSession,
    );

    final queuePanel = CaptureQueuePanel(
      queue: _queue,
      onClearSynced: _clearSyncedQueueItems,
      onClearLocalUnsynced: _clearLocalUnsyncedTestItems,
      onResetLocal: _resetLocalVibeTestState,
    );

    final settingsCard = SyncSettingsCard(
      apiUrlController: _apiUrlController,
      emailController: _emailController,
      passwordController: _passwordController,
      signedInEmail: _signedInEmail,
      authStatusMessage: _authStatusMessage,
      authStatusOk: _authStatusOk,
      isSigningIn: _isSigningIn,
      backendHealthOk: _backendHealthOk,
      backendHealthMessage: _backendHealthMessage,
      checkingBackend: _isCheckingBackend,
      onSignIn: _signIn,
      onRetry: _syncPendingQueue,
      onVerifyBackend: _verifyBackendHealth,
    );

    final advancedSettings = AdvancedSettingsCard(
      readinessCard: NativePilotReadinessCard(
        backendOk: _backendHealthOk,
        backendMessage: _backendHealthMessage,
        checkingBackend: _isCheckingBackend,
        signedInEmail: _signedInEmail,
        queue: _queue,
        onVerifyBackend: _verifyBackendHealth,
      ),
      flowSummary: const NativeFlowSummary(),
      externalImportCard:
          ExternalSessionImportCard(onImport: _importExternalSession),
      healthConnectCard: HealthConnectBridgeCard(
        permissionPlan: HealthConnectPermissionPlan.pilot(),
        onPreparePilotBundle: _prepareHealthConnectPilotBundle,
      ),
    );

    final pages = [
      [
        VibeHomeHeader(
          syncState: _syncState,
          signedInEmail: _signedInEmail,
          queueSummary: queueSummary,
          activeSession: _activeSession,
          onOpenAccount: () => setState(() => _selectedHomeTab = 6),
          onOpenSaved: () => setState(() => _selectedHomeTab = 2),
          onOpenStatus: () => setState(() => _selectedHomeTab = 5),
          manualLabel: _t.manualButton,
          onOpenManual: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => UserManualScreen(strings: _t)),
          ),
        ),
        const SizedBox(height: 16),
        VibeActivationPanel(
          online: _vibeCommandOnline,
          message: _vibeCommandStatusMessage,
          transcript: _vibeVoiceTranscript,
          listening: _isListeningForVibe,
          armed: _vibeVoiceArmed,
          language: _vibeVoiceLanguage,
          isRecordingAudio: _isRecordingAudio,
          onActivate: _toggleVibeVoiceCommand,
          onLanguageChanged: (language) =>
              setState(() => _vibeVoiceLanguage = language),
          onNote: _vibeSaveQuickNote,
          onAudio: _vibeToggleAudio,
          onPhoto: _vibeOpenPhoto,
          onVideo: _vibeOpenVideo,
          onBiometrics: _vibeOpenBiometrics,
          onAgenda: _vibeOpenAgenda,
          onExperience: _vibeStartExperienceNow,
          onHome: () => _vibeGoToTab(0, 'Inicio'),
          onCapture: () => _vibeGoToTab(1, 'Capturar'),
          onSaved: () => _vibeGoToTab(2, 'Guardados'),
          onAssets: () => _vibeGoToTab(3, 'Archivos'),
          onAgendaView: () => _vibeGoToTab(4, 'Agenda'),
          onStatus: () => _vibeGoToTab(5, 'Estado'),
          onAccount: () => _vibeGoToTab(6, 'Cuenta'),
        ),
        const SizedBox(height: 16),
        HomeFlowCard(
          signedInEmail: _signedInEmail,
          queueSummary: queueSummary,
          activeSession: _activeSession,
          syncState: _syncState,
        ),
        const SizedBox(height: 20),
        HomeActionPanel(
          isRecordingAudio: _isRecordingAudio,
          onNewNote: () => setState(() => _selectedHomeTab = 1),
          onAudio: _toggleAudioRecording,
          onPhoto: _openPhotoCaptureSheet,
          onAgenda: _openAgendaSheet,
          onAssets: () => setState(() => _selectedHomeTab = 3),
          onSaved: () => setState(() => _selectedHomeTab = 2),
        ),
        const SizedBox(height: 18),
        noteComposer,
        const SizedBox(height: 18),
        sessionCard,
        const SizedBox(height: 18),
        CompactQueueStatusCard(summary: queueSummary),
      ],
      [
        AppSectionHeader(
          title: _t.captureTitle,
          subtitle: _t.captureSubtitle,
          icon: Icons.add_circle_outline,
        ),
        const SizedBox(height: 14),
        noteComposer,
        const SizedBox(height: 18),
        captureActions,
        const SizedBox(height: 18),
        sessionCard,
      ],
      [
        MobileLibraryPanel(queue: _queue, activeSession: _activeSession),
      ],
      [
        MobileAssetsPanel(queue: _queue, activeSession: _activeSession),
      ],
      [
        MobileAgendaPanel(queue: _queue, activeSession: _activeSession),
      ],
      [
        AppSectionHeader(
          title: _t.statusTitle,
          subtitle: _t.statusSubtitle,
          icon: Icons.cloud_done_outlined,
        ),
        const SizedBox(height: 14),
        CompactQueueStatusCard(summary: queueSummary),
        const SizedBox(height: 14),
        queuePanel,
        const SizedBox(height: 16),
        advancedSettings,
      ],
      [
        AppSectionHeader(
          title: _t.accountTitle,
          subtitle: _t.accountSubtitle,
          icon: Icons.tune_outlined,
        ),
        const SizedBox(height: 14),
        settingsCard,
        const SizedBox(height: 16),
        _buildAssistantSettingsCard(),
        const SizedBox(height: 16),
        _buildHealthCard(),
        const SizedBox(height: 16),
        _buildTranscribeCard(),
        const SizedBox(height: 16),
        _buildGlassesCard(),
        const SizedBox(height: 16),
        _buildClioCard(),
        const SizedBox(height: 16),
        VibePanelButton(
          icon: Icons.menu_book_outlined,
          label: _t.manualButton,
          sublabel: _t.manualIntro,
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => UserManualScreen(strings: _t),
            ),
          ),
        ),
        const SizedBox(height: 16),
        AboutVibeappCard(
          apiBaseUrl: _apiUrlController.text.trim(),
          signedInEmail: _signedInEmail,
          lastSyncAt: _lastSyncAt,
          queueSummary: queueSummary,
        ),
      ],
    ];

    return Scaffold(
      backgroundColor: const Color(0xFFFAFAFA),
      body: SafeArea(
        child: ListView(
          key: ValueKey('vibeapp-tab-$_selectedHomeTab'),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
          children: pages[_selectedHomeTab],
        ),
      ),
      bottomNavigationBar: VibeBottomNavigation(
        selectedIndex: _selectedHomeTab,
        onSelected: (index) => setState(() => _selectedHomeTab = index),
        strings: _t,
      ),
      floatingActionButton: GlobalVibeMicButton(
        armed: _vibeVoiceArmed,
        listening: _isListeningForVibe,
        language: _vibeVoiceLanguage,
        onPressed: _toggleVibeVoiceCommand,
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
    );
  }
}

class GlobalVibeMicButton extends StatelessWidget {
  const GlobalVibeMicButton({
    required this.armed,
    required this.listening,
    required this.language,
    required this.onPressed,
    super.key,
  });

  final bool armed;
  final bool listening;
  final VibeVoiceLanguage language;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final background = armed ? const Color(0xFFFFD84D) : Colors.white;
    final foreground = armed ? const Color(0xFF4D3900) : Colors.black87;
    final label = listening
        ? tr.vListening
        : armed
            ? tr.vActive
            : tr.vInactive;
    return Tooltip(
      message: '$label - ${language.label}',
      child: FloatingActionButton.extended(
        heroTag: 'global-vibe-mic',
        backgroundColor: background,
        foregroundColor: foreground,
        elevation: armed ? 8 : 4,
        onPressed: onPressed,
        icon: Icon(
          listening
              ? Icons.graphic_eq_outlined
              : armed
                  ? Icons.mic_outlined
                  : Icons.mic_none_outlined,
        ),
        label: Text('${language.shortLabel} · ${armed ? 'V' : 'OFF'}'),
      ),
    );
  }
}

class VibeHomeHeader extends StatelessWidget {
  const VibeHomeHeader({
    required this.syncState,
    required this.signedInEmail,
    required this.queueSummary,
    required this.activeSession,
    required this.onOpenAccount,
    required this.onOpenSaved,
    required this.onOpenStatus,
    required this.onOpenManual,
    required this.manualLabel,
    super.key,
  });

  final SyncState syncState;
  final String signedInEmail;
  final CaptureQueueSummary queueSummary;
  final ActiveExperienceSession? activeSession;
  final VoidCallback onOpenAccount;
  final VoidCallback onOpenSaved;
  final VoidCallback onOpenStatus;
  final VoidCallback onOpenManual;
  final String manualLabel;

  @override
  Widget build(BuildContext context) {
    final status = _homeStatusText();
    final statusColor = _homeStatusColor();
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [VibeTokens.brandDark, Color(0xFF0A1A16)],
        ),
        borderRadius: BorderRadius.circular(VibeTokens.rLg),
        boxShadow: [
          BoxShadow(
            color: VibeTokens.brand.withValues(alpha: 0.30),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Logo oficial de Vibe (render de marca) como banner del encabezado.
          ClipRRect(
            borderRadius: BorderRadius.circular(VibeTokens.rMd),
            child: Image.asset(
              'assets/branding/vibe_logo.png',
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Text(
                  activeSession == null
                      ? tr.appTagline
                      : tr.experienceOpen(activeSession!.title),
                  style: const TextStyle(
                    color: Colors.white70,
                    height: 1.25,
                    fontSize: 13.5,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              _RoundHeaderButton(
                icon: Icons.menu_book_outlined,
                label: manualLabel,
                onPressed: onOpenManual,
              ),
              const SizedBox(width: 10),
              _RoundHeaderButton(
                icon: Icons.person_outline,
                label: tr.accountTab,
                onPressed: onOpenAccount,
              ),
            ],
          ),
          const SizedBox(height: 16),
          InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: signedInEmail.isEmpty ? onOpenAccount : onOpenStatus,
            child: Ink(
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: statusColor.withValues(alpha: 0.35)),
              ),
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Icon(
                    signedInEmail.isEmpty
                        ? Icons.login_outlined
                        : Icons.cloud_done_outlined,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      status,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Colors.white70),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _HeaderMetric(
                  label: tr.pendingMetric,
                  value: '${queueSummary.pending}',
                  icon: Icons.sync_outlined,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _HeaderMetric(
                  label: tr.sessionMetric,
                  value: activeSession == null ? tr.freeLabel : tr.openLabel,
                  icon: Icons.timeline_outlined,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _homeStatusText() {
    if (signedInEmail.isEmpty) {
      return tr.headerSignInPrompt;
    }
    if (queueSummary.pending > 0) {
      return tr.headerPending(queueSummary.pending);
    }
    return switch (syncState) {
      SyncState.syncing => tr.headerSyncing,
      SyncState.needsAttention => tr.headerAttention,
      _ => tr.headerAllSynced,
    };
  }

  Color _homeStatusColor() {
    if (signedInEmail.isEmpty) return Colors.orange;
    if (queueSummary.pending > 0 || syncState == SyncState.needsAttention) {
      return Colors.orange;
    }
    if (syncState == SyncState.syncing) return Colors.blue;
    return const Color(0xFF0D7C66);
  }
}

class _HeaderMetric extends StatelessWidget {
  const _HeaderMetric({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(icon, color: Colors.white70, size: 19),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white60,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoundHeaderButton extends StatelessWidget {
  const _RoundHeaderButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: IconButton.filledTonal(
        onPressed: onPressed,
        icon: Icon(icon),
        style: IconButton.styleFrom(
          fixedSize: const Size(48, 48),
          backgroundColor: Colors.white.withValues(alpha: 0.14),
          foregroundColor: Colors.white,
        ),
      ),
    );
  }
}

class HomeFlowCard extends StatelessWidget {
  const HomeFlowCard({
    required this.signedInEmail,
    required this.queueSummary,
    required this.activeSession,
    required this.syncState,
    super.key,
  });

  final String signedInEmail;
  final CaptureQueueSummary queueSummary;
  final ActiveExperienceSession? activeSession;
  final SyncState syncState;

  @override
  Widget build(BuildContext context) {
    final connected = signedInEmail.isNotEmpty;
    final synced =
        connected && queueSummary.isClear && syncState != SyncState.syncing;
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    tr.flowTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                ),
                Chip(
                  avatar: Icon(
                    synced ? Icons.check_circle_outline : Icons.info_outline,
                    size: 18,
                  ),
                  label: Text(synced ? tr.flowUpToDate : tr.flowReview),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              activeSession == null
                  ? tr.flowDescIdle
                  : tr.flowDescOpen(activeSession!.title),
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.black54, height: 1.3),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _FlowStepCard(
                    icon: Icons.add_circle_outline,
                    title: tr.flowStep1Title,
                    detail: tr.flowStep1Detail,
                    ok: true,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _FlowStepCard(
                    icon: Icons.cloud_upload_outlined,
                    title: tr.flowStep2Title,
                    detail: connected ? tr.flowStep2Connected : tr.flowStep2Missing,
                    ok: connected,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _FlowStepCard(
                    icon: Icons.devices_outlined,
                    title: tr.flowStep3Title,
                    detail: queueSummary.pending == 0
                        ? tr.flowStep3Clear
                        : tr.flowStep3Pending(queueSummary.pending),
                    ok: queueSummary.pending == 0,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FlowStepCard extends StatelessWidget {
  const _FlowStepCard({
    required this.icon,
    required this.title,
    required this.detail,
    required this.ok,
  });

  final IconData icon;
  final String title;
  final String detail;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    final color = ok ? const Color(0xFF0D7C66) : Colors.orange.shade800;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 10),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(
              detail,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }
}

class HomeActionPanel extends StatelessWidget {
  const HomeActionPanel({
    required this.isRecordingAudio,
    required this.onNewNote,
    required this.onAudio,
    required this.onPhoto,
    required this.onAgenda,
    required this.onAssets,
    required this.onSaved,
    super.key,
  });

  final bool isRecordingAudio;
  final VoidCallback onNewNote;
  final Future<void> Function() onAudio;
  final Future<void> Function() onPhoto;
  final Future<void> Function() onAgenda;
  final VoidCallback onAssets;
  final VoidCallback onSaved;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          tr.whatToDoNow,
          style: Theme.of(context)
              .textTheme
              .titleLarge
              ?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          childAspectRatio: 1.08,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          children: [
            _HomeActionTile(
              icon: Icons.edit_note_outlined,
              title: tr.actWrite,
              detail: tr.actWriteDetail,
              color: const Color(0xFF0D7C66),
              onTap: onNewNote,
            ),
            _HomeActionTile(
              icon: isRecordingAudio
                  ? Icons.stop_circle_outlined
                  : Icons.mic_none_outlined,
              title: isRecordingAudio ? tr.actStop : tr.actAudio,
              detail:
                  isRecordingAudio ? tr.actStopDetail : tr.actAudioDetail,
              color: const Color(0xFF3657D6),
              onTap: () => unawaited(onAudio()),
            ),
            _HomeActionTile(
              icon: Icons.photo_camera_outlined,
              title: tr.actPhoto,
              detail: tr.actPhotoDetail,
              color: const Color(0xFFD65A31),
              onTap: () => unawaited(onPhoto()),
            ),
            _HomeActionTile(
              icon: Icons.event_available_outlined,
              title: tr.actAgenda,
              detail: tr.actAgendaDetail,
              color: const Color(0xFF0F8A9D),
              onTap: () => unawaited(onAgenda()),
            ),
            _HomeActionTile(
              icon: Icons.perm_media_outlined,
              title: tr.actFiles,
              detail: tr.actFilesDetail,
              color: const Color(0xFF4E6C50),
              onTap: onAssets,
            ),
            _HomeActionTile(
              icon: Icons.folder_open_outlined,
              title: tr.actSaved,
              detail: tr.actSavedDetail,
              color: const Color(0xFF7B3FE4),
              onTap: onSaved,
            ),
          ],
        ),
      ],
    );
  }
}

class _HomeActionTile extends StatelessWidget {
  const _HomeActionTile({
    required this.icon,
    required this.title,
    required this.detail,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String detail;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 0,
      borderRadius: BorderRadius.circular(26),
      child: InkWell(
        borderRadius: BorderRadius.circular(26),
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: const Color(0xFFEAEAEA)),
          ),
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Icon(icon, color: color, size: 28),
                ),
              ),
              const Spacer(),
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Text(
                detail,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.black54),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class VibeHomeSegments extends StatelessWidget {
  const VibeHomeSegments({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _SegmentPill(
            icon: Icons.auto_awesome,
            label: tr.segForYou,
            selected: true,
          ),
          const SizedBox(width: 10),
          _SegmentPill(icon: Icons.group_outlined, label: tr.segGroups),
          const SizedBox(width: 10),
          _SegmentPill(icon: Icons.schedule, label: tr.segRecent),
        ],
      ),
    );
  }
}

class _SegmentPill extends StatelessWidget {
  const _SegmentPill({
    required this.icon,
    required this.label,
    this.selected = false,
  });

  final IconData icon;
  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: selected ? Colors.black : const Color(0xFFF0F0F0),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        child: Row(
          children: [
            Icon(icon, color: selected ? Colors.white : Colors.black, size: 20),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                color: selected ? Colors.white : Colors.black,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class VibeBottomNavigation extends StatelessWidget {
  const VibeBottomNavigation({
    required this.selectedIndex,
    required this.onSelected,
    required this.strings,
    super.key,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final AppStrings strings;

  List<_BottomNavItem> get _items => [
        _BottomNavItem(Icons.home_outlined, Icons.home, strings.homeTab),
        _BottomNavItem(
            Icons.add_circle_outline, Icons.add_circle, strings.captureTab),
        _BottomNavItem(
            Icons.library_books_outlined, Icons.library_books, strings.savedTab),
        _BottomNavItem(
            Icons.perm_media_outlined, Icons.perm_media, strings.assetsTab),
        _BottomNavItem(
            Icons.event_note_outlined, Icons.event_note, strings.agendaTab),
        _BottomNavItem(
            Icons.cloud_done_outlined, Icons.cloud_done, strings.statusTab),
        _BottomNavItem(Icons.person_outline, Icons.person, strings.accountTab),
      ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(30),
          boxShadow: const [
            BoxShadow(
              color: Color(0x1F000000),
              blurRadius: 24,
              offset: Offset(0, 10),
            ),
          ],
        ),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              for (var index = 0; index < _items.length; index++)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: _BottomNavChip(
                    item: _items[index],
                    selected: selectedIndex == index,
                    onPressed: () => onSelected(index),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BottomNavItem {
  const _BottomNavItem(this.icon, this.selectedIcon, this.label);

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

class _BottomNavChip extends StatelessWidget {
  const _BottomNavChip({
    required this.item,
    required this.selected,
    required this.onPressed,
  });

  final _BottomNavItem item;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final foreground = selected ? Colors.white : Colors.black87;
    return Tooltip(
      message: item.label,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onPressed,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          width: selected ? 128 : 92,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            gradient: selected
                ? const LinearGradient(
                    colors: [VibeTokens.brand, VibeTokens.brandDark])
                : null,
            color: selected ? null : VibeTokens.panelGrey,
            borderRadius: BorderRadius.circular(24),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: VibeTokens.brand.withValues(alpha: 0.30),
                      blurRadius: 12,
                      offset: const Offset(0, 5),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(selected ? item.selectedIcon : item.icon,
                  color: foreground, size: 21),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AppSectionHeader extends StatelessWidget {
  const AppSectionHeader({
    required this.title,
    required this.subtitle,
    required this.icon,
    super.key,
  });

  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(VibeTokens.space16),
      decoration: BoxDecoration(
        color: VibeTokens.panel,
        borderRadius: BorderRadius.circular(VibeTokens.rLg),
        border: Border.all(color: VibeTokens.border),
        boxShadow: VibeTokens.softShadow,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [VibeTokens.brand, VibeTokens.brandDark],
              ),
              borderRadius: BorderRadius.circular(VibeTokens.rSm),
              boxShadow: [
                BoxShadow(
                  color: VibeTokens.brand.withValues(alpha: 0.30),
                  blurRadius: 12,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Icon(icon, color: Colors.white, size: 24),
          ),
          const SizedBox(width: VibeTokens.space12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.35,
                    color: VibeTokens.muted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class MobileLibraryPanel extends StatelessWidget {
  const MobileLibraryPanel({
    required this.queue,
    required this.activeSession,
    super.key,
  });

  final List<CaptureQueueItem> queue;
  final ActiveExperienceSession? activeSession;

  @override
  Widget build(BuildContext context) {
    final experiences =
        queue.where((item) => item.sourceType == 'experience-session').toList();
    final visible = [
      if (activeSession != null) CaptureQueueItem.fromSession(activeSession!),
      ...queue,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppSectionHeader(
          title: tr.savedTab,
          subtitle: tr.savedSubtitle,
          icon: Icons.library_books_outlined,
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
                child: _MetricTile(
                    label: tr.capturesMetric, value: '${queue.length}')),
            const SizedBox(width: 10),
            Expanded(
                child: _MetricTile(
                    label: tr.sessionsMetric, value: '${experiences.length}')),
          ],
        ),
        const SizedBox(height: 14),
        if (visible.isEmpty)
          _EmptyStateCard(
            icon: Icons.inbox_outlined,
            title: tr.emptySavedTitle,
            detail: tr.emptySavedDetail,
          )
        else
          for (final item in visible.take(12))
            _ExperiencePreviewCard(item: item),
      ],
    );
  }
}

class MobileAssetsPanel extends StatelessWidget {
  const MobileAssetsPanel({
    required this.queue,
    required this.activeSession,
    super.key,
  });

  final List<CaptureQueueItem> queue;
  final ActiveExperienceSession? activeSession;

  @override
  Widget build(BuildContext context) {
    final assets = [
      ...queue.expand((item) => item.attachments),
      if (activeSession != null) ...activeSession!.attachments,
    ];
    final counts = <String, int>{};
    for (final asset in assets) {
      counts[asset.displayLabel] = (counts[asset.displayLabel] ?? 0) + 1;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppSectionHeader(
          title: tr.assetsTab,
          subtitle: tr.assetsSubtitle,
          icon: Icons.perm_media_outlined,
        ),
        const SizedBox(height: 14),
        AssetProcessingGuideCard(assetCount: assets.length),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in counts.entries)
              Chip(label: Text('${entry.key}: ${entry.value}')),
            if (counts.isEmpty) Chip(label: Text(tr.noAssetsChip)),
          ],
        ),
        const SizedBox(height: 14),
        if (assets.isEmpty)
          _EmptyStateCard(
            icon: Icons.photo_library_outlined,
            title: tr.emptyAssetsTitle,
            detail: tr.emptyAssetsDetail,
          )
        else
          for (final asset in assets.take(14)) _AssetPreviewCard(asset: asset),
      ],
    );
  }
}

class AssetProcessingGuideCard extends StatelessWidget {
  const AssetProcessingGuideCard({required this.assetCount, super.key});

  final int assetCount;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome_outlined,
                    color: Color(0xFF0D7C66)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    tr.assetsGuideTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                ),
                Chip(label: Text(tr.assetsActiveChip(assetCount))),
              ],
            ),
            const SizedBox(height: 10),
            Text(tr.assetsGuideBody),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(label: Text(tr.chipImageVideo)),
                Chip(label: Text(tr.chipAudio)),
                Chip(label: Text(tr.chipDocument)),
                Chip(label: Text(tr.chipBiometric)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class MobileAgendaPanel extends StatelessWidget {
  const MobileAgendaPanel({
    required this.queue,
    required this.activeSession,
    super.key,
  });

  final List<CaptureQueueItem> queue;
  final ActiveExperienceSession? activeSession;

  @override
  Widget build(BuildContext context) {
    final agendaItems = queue
        .where(
            (item) => item.agendaEvent != null || item.sourceType == 'agenda')
        .toList();
    final events = [
      if (activeSession != null) ...activeSession!.events,
      ...queue.expand((item) => item.events),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppSectionHeader(
          title: tr.agendaTab,
          subtitle: tr.agendaSubtitle,
          icon: Icons.event_note_outlined,
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
                child: _MetricTile(
                    label: tr.agendaMetric, value: '${agendaItems.length}')),
            const SizedBox(width: 10),
            Expanded(
                child:
                    _MetricTile(label: tr.eventsMetric, value: '${events.length}')),
          ],
        ),
        const SizedBox(height: 14),
        if (agendaItems.isEmpty && events.isEmpty)
          _EmptyStateCard(
            icon: Icons.event_available_outlined,
            title: tr.emptyAgendaTitle,
            detail: tr.emptyAgendaDetail,
          )
        else ...[
          for (final item in agendaItems.take(8))
            _ExperiencePreviewCard(item: item),
          for (final event in events.take(8)) _EventPreviewCard(event: event),
        ],
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
            Text(label, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}

class _EmptyStateCard extends StatelessWidget {
  const _EmptyStateCard({
    required this.icon,
    required this.title,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Icon(icon, size: 34, color: const Color(0xFF0D7C66)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text(detail),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ExperiencePreviewCard extends StatelessWidget {
  const _ExperiencePreviewCard({required this.item});

  final CaptureQueueItem item;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        leading: Icon(item.status.icon, color: const Color(0xFF0D7C66)),
        title: Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle:
            Text(item.subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
        trailing: Text(item.status.label),
      ),
    );
  }
}

class _AssetPreviewCard extends StatelessWidget {
  const _AssetPreviewCard({required this.asset});

  final NativeAttachmentDraft asset;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        leading:
            Icon(_assetIcon(asset.sourceType), color: const Color(0xFF0D7C66)),
        title: Text(asset.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
            '${asset.displayLabel} - ${asset.mimeType} - ${asset.size} bytes'),
        trailing: asset.eventTitle.isEmpty
            ? null
            : const Icon(Icons.link_outlined, size: 18),
      ),
    );
  }

  IconData _assetIcon(String sourceType) {
    if (sourceType == 'video') return Icons.videocam_outlined;
    if (sourceType == 'audio') return Icons.graphic_eq_outlined;
    if (sourceType == 'biometric') return Icons.favorite_border;
    if (sourceType == 'document') return Icons.description_outlined;
    if (sourceType == 'zip') return Icons.archive_outlined;
    return Icons.photo_outlined;
  }
}

class _EventPreviewCard extends StatelessWidget {
  const _EventPreviewCard({required this.event});

  final ExperienceEventDraft event;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xFFE7F4F0),
          child: Text('${event.order}'),
        ),
        title: Text(event.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(event.description,
            maxLines: 2, overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

/// Waveform en vivo durante la grabacion de audio: barras animadas a partir de
/// los niveles de amplitud (0..1). Ligero, sin dependencias.
class AudioWaveform extends StatelessWidget {
  const AudioWaveform({required this.levels, super.key});

  final List<double> levels;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: VibeTokens.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(VibeTokens.rSm),
        border: Border.all(color: VibeTokens.danger.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Icon(Icons.fiber_manual_record, color: VibeTokens.danger, size: 12),
          const SizedBox(width: 8),
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: List.generate(24, (i) {
                // Toma los ultimos niveles; si faltan, barra minima.
                final idx = levels.length - 24 + i;
                final v = (idx >= 0 && idx < levels.length) ? levels[idx] : 0.04;
                return Container(
                  width: 4,
                  height: (4 + v * 28).clamp(4.0, 32.0),
                  decoration: BoxDecoration(
                    color: VibeTokens.danger
                        .withValues(alpha: 0.5 + v * 0.5),
                    borderRadius: BorderRadius.circular(2),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

class QuickNoteComposer extends StatelessWidget {
  const QuickNoteComposer({
    required this.noteController,
    required this.commandPreview,
    required this.hasDraft,
    required this.vibeStatusMessage,
    required this.vibeOnline,
    required this.onActivateVibe,
    required this.onAudio,
    required this.onSave,
    required this.onImprove,
    required this.improving,
    required this.isRecordingAudio,
    required this.audioLevels,
    super.key,
  });

  final TextEditingController noteController;
  final NativeQuickCommand? commandPreview;
  final bool hasDraft;
  final String vibeStatusMessage;
  final bool vibeOnline;
  final VoidCallback onActivateVibe;
  final Future<void> Function() onAudio;
  final Future<void> Function() onSave;
  final Future<void> Function() onImprove;
  final bool improving;
  final bool isRecordingAudio;
  final List<double> audioLevels;

  @override
  Widget build(BuildContext context) {
    final showVibeStatus = vibeStatusMessage.isNotEmpty ||
        commandPreview?.type == NativeQuickCommandType.listen;
    final statusMessage = vibeStatusMessage.isNotEmpty
        ? vibeStatusMessage
        : tr.quickNoteReady;
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              tr.quickNoteTitle,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: noteController,
              minLines: 4,
              maxLines: 7,
              decoration: InputDecoration(
                labelText: tr.noteFieldLabel,
                hintText: tr.noteFieldHint,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: onActivateVibe,
                    icon: const Icon(Icons.sensors_outlined),
                    label: Text(tr.activateV),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => unawaited(onAudio()),
                    icon: const Icon(Icons.mic_none_outlined),
                    label: Text(tr.recordAudio),
                  ),
                ),
              ],
            ),
            if (isRecordingAudio) ...[
              const SizedBox(height: 12),
              AudioWaveform(levels: audioLevels),
            ],
            if (commandPreview != null) ...[
              const SizedBox(height: 12),
              NativeCommandPreviewCard(command: commandPreview!),
            ],
            if (showVibeStatus) ...[
              const SizedBox(height: 12),
              VibeCommandStatusBanner(
                online: vibeOnline ||
                    commandPreview?.type == NativeQuickCommandType.listen,
                message: statusMessage,
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                if (hasDraft && commandPreview == null) ...[
                  OutlinedButton.icon(
                    onPressed: improving ? null : () => unawaited(onImprove()),
                    icon: improving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.auto_awesome_outlined),
                    label: Text(improving ? tr.improvingNote : tr.improveNoteBtn),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: FilledButton.icon(
                    onPressed: hasDraft ? onSave : null,
                    icon: Icon(
                        commandPreview?.type == NativeQuickCommandType.listen
                            ? Icons.sensors_outlined
                            : Icons.cloud_upload_outlined),
                    label: Text(commandPreview == null
                        ? tr.saveCapture
                        : commandPreview!.primaryActionLabel),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class VibeActivationPanel extends StatelessWidget {
  const VibeActivationPanel({
    required this.online,
    required this.message,
    required this.transcript,
    required this.listening,
    required this.armed,
    required this.language,
    required this.isRecordingAudio,
    required this.onActivate,
    required this.onLanguageChanged,
    required this.onNote,
    required this.onAudio,
    required this.onPhoto,
    required this.onVideo,
    required this.onBiometrics,
    required this.onAgenda,
    required this.onExperience,
    required this.onHome,
    required this.onCapture,
    required this.onSaved,
    required this.onAssets,
    required this.onAgendaView,
    required this.onStatus,
    required this.onAccount,
    super.key,
  });

  final bool online;
  final String message;
  final String transcript;
  final bool listening;
  final bool armed;
  final VibeVoiceLanguage language;
  final bool isRecordingAudio;
  final VoidCallback onActivate;
  final ValueChanged<VibeVoiceLanguage> onLanguageChanged;
  final Future<void> Function() onNote;
  final Future<void> Function() onAudio;
  final Future<void> Function() onPhoto;
  final Future<void> Function() onVideo;
  final Future<void> Function() onBiometrics;
  final Future<void> Function() onAgenda;
  final VoidCallback onExperience;
  final VoidCallback onHome;
  final VoidCallback onCapture;
  final VoidCallback onSaved;
  final VoidCallback onAssets;
  final VoidCallback onAgendaView;
  final VoidCallback onStatus;
  final VoidCallback onAccount;

  @override
  Widget build(BuildContext context) {
    final status = message.isEmpty ? language.idlePrompt : message;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: online ? const Color(0xFFFFF4BF) : Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: online ? const Color(0xFFB88A00) : const Color(0xFFE0E0E0),
          width: 1.4,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  online ? Icons.sensors_outlined : Icons.power_settings_new,
                  color: online ? const Color(0xFF7A5A00) : Colors.black,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    listening
                        ? language.listeningTitle
                        : armed
                            ? language.waitingTitle
                            : language.voiceTitle,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: online ? const Color(0xFF4D3900) : null,
                        ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              status,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: online ? const Color(0xFF4D3900) : null,
                  ),
            ),
            const SizedBox(height: 12),
            SegmentedButton<VibeVoiceLanguage>(
              segments: VibeVoiceLanguage.values
                  .map(
                    (item) => ButtonSegment<VibeVoiceLanguage>(
                      value: item,
                      label: Text(item.shortLabel),
                      icon: Icon(item.icon, size: 18),
                    ),
                  )
                  .toList(),
              selected: {language},
              onSelectionChanged: armed
                  ? null
                  : (selection) => onLanguageChanged(selection.first),
            ),
            const SizedBox(height: 6),
            Text(
              language.languageStatus,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: online ? const Color(0xFF4D3900) : Colors.black54,
                  ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onActivate,
                icon: Icon(
                  armed ? Icons.stop_circle_outlined : Icons.mic_outlined,
                ),
                label:
                    Text(armed ? language.deactivateLabel : language.talkLabel),
              ),
            ),
            if (transcript.isNotEmpty) ...[
              const SizedBox(height: 10),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE0C15B)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.subtitles_outlined, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          transcript,
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 10),
            Text(
              language.captureSection,
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ActionChip(
                  avatar: const Icon(Icons.edit_note_outlined, size: 18),
                  label: Text(language.noteLabel),
                  onPressed: () => unawaited(onNote()),
                ),
                ActionChip(
                  avatar: Icon(
                    isRecordingAudio
                        ? Icons.stop_circle_outlined
                        : Icons.mic_none_outlined,
                    size: 18,
                  ),
                  label: Text(isRecordingAudio
                      ? language.stopAudioLabel
                      : language.audioLabel),
                  onPressed: () => unawaited(onAudio()),
                ),
                ActionChip(
                  avatar: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: Text(language.photoLabel),
                  onPressed: () => unawaited(onPhoto()),
                ),
                ActionChip(
                  avatar: const Icon(Icons.videocam_outlined, size: 18),
                  label: Text(language.videoLabel),
                  onPressed: () => unawaited(onVideo()),
                ),
                ActionChip(
                  avatar: const Icon(Icons.monitor_heart_outlined, size: 18),
                  label: Text(language.biometricsLabel),
                  onPressed: () => unawaited(onBiometrics()),
                ),
                ActionChip(
                  avatar: const Icon(Icons.event_available_outlined, size: 18),
                  label: Text(language.createAgendaLabel),
                  onPressed: () => unawaited(onAgenda()),
                ),
                ActionChip(
                  avatar: const Icon(Icons.play_circle_outline, size: 18),
                  label: Text(language.experienceLabel),
                  onPressed: onExperience,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              language.navigationSection,
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ActionChip(
                  avatar: const Icon(Icons.home_outlined, size: 18),
                  label: Text(language.homeLabel),
                  onPressed: onHome,
                ),
                ActionChip(
                  avatar: const Icon(Icons.add_circle_outline, size: 18),
                  label: Text(language.captureNavLabel),
                  onPressed: onCapture,
                ),
                ActionChip(
                  avatar: const Icon(Icons.folder_open_outlined, size: 18),
                  label: Text(language.savedLabel),
                  onPressed: onSaved,
                ),
                ActionChip(
                  avatar: const Icon(Icons.inventory_2_outlined, size: 18),
                  label: Text(language.assetsLabel),
                  onPressed: onAssets,
                ),
                ActionChip(
                  avatar: const Icon(Icons.calendar_month_outlined, size: 18),
                  label: Text(language.viewAgendaLabel),
                  onPressed: onAgendaView,
                ),
                ActionChip(
                  avatar: const Icon(Icons.cloud_done_outlined, size: 18),
                  label: Text(language.statusLabel),
                  onPressed: onStatus,
                ),
                ActionChip(
                  avatar: const Icon(Icons.person_outline, size: 18),
                  label: Text(language.accountLabel),
                  onPressed: onAccount,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum VibeVoiceLanguage {
  spanish('es_ES', 'Espanol', 'ES', Icons.translate_outlined),
  english('en_US', 'English', 'EN', Icons.language_outlined),
  french('fr_FR', 'Francais', 'FR', Icons.public_outlined);

  const VibeVoiceLanguage(
    this.localeId,
    this.label,
    this.shortLabel,
    this.icon,
  );

  final String localeId;
  final String label;
  final String shortLabel;
  final IconData icon;

  String get idlePrompt => switch (this) {
        VibeVoiceLanguage.spanish =>
          'Toca Hablar con V. Queda escuchando hasta que digas desactivar V.',
        VibeVoiceLanguage.english =>
          'Tap Talk to V. It keeps listening until you say stop V.',
        VibeVoiceLanguage.french =>
          'Touchez Parler avec V. V ecoute jusqu a desactiver V.',
      };

  String get listeningTitle => switch (this) {
        VibeVoiceLanguage.spanish => 'V escuchando',
        VibeVoiceLanguage.english => 'V listening',
        VibeVoiceLanguage.french => 'V écoute',
      };

  String get waitingTitle => switch (this) {
        VibeVoiceLanguage.spanish => 'V esperando comando',
        VibeVoiceLanguage.english => 'V waiting for command',
        VibeVoiceLanguage.french => 'V attend une commande',
      };

  String get voiceTitle => switch (this) {
        VibeVoiceLanguage.spanish => 'V por voz',
        VibeVoiceLanguage.english => 'V voice',
        VibeVoiceLanguage.french => 'V vocal',
      };

  String get languageStatus => switch (this) {
        VibeVoiceLanguage.spanish => 'Idioma de V: Espanol.',
        VibeVoiceLanguage.english => 'V language: English.',
        VibeVoiceLanguage.french => 'Langue de V: Francais.',
      };

  String get talkLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Hablar con V',
        VibeVoiceLanguage.english => 'Talk to V',
        VibeVoiceLanguage.french => 'Parler avec V',
      };

  String get deactivateLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Desactivar V',
        VibeVoiceLanguage.english => 'Stop V',
        VibeVoiceLanguage.french => 'Desactiver V',
      };

  String get captureSection => switch (this) {
        VibeVoiceLanguage.spanish => 'Captura',
        VibeVoiceLanguage.english => 'Capture',
        VibeVoiceLanguage.french => 'Capture',
      };

  String get navigationSection => switch (this) {
        VibeVoiceLanguage.spanish => 'Navegacion',
        VibeVoiceLanguage.english => 'Navigation',
        VibeVoiceLanguage.french => 'Navigation',
      };

  String get noteLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Nota',
        VibeVoiceLanguage.english => 'Note',
        VibeVoiceLanguage.french => 'Note',
      };

  String get audioLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Audio',
        VibeVoiceLanguage.english => 'Audio',
        VibeVoiceLanguage.french => 'Audio',
      };

  String get stopAudioLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Detener audio',
        VibeVoiceLanguage.english => 'Stop audio',
        VibeVoiceLanguage.french => 'Arreter audio',
      };

  String get photoLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Foto',
        VibeVoiceLanguage.english => 'Photo',
        VibeVoiceLanguage.french => 'Photo',
      };

  String get videoLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Vídeo',
        VibeVoiceLanguage.english => 'Video',
        VibeVoiceLanguage.french => 'Vidéo',
      };

  String get biometricsLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Biometria',
        VibeVoiceLanguage.english => 'Biometrics',
        VibeVoiceLanguage.french => 'Biometrie',
      };

  String get createAgendaLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Crear agenda',
        VibeVoiceLanguage.english => 'Create event',
        VibeVoiceLanguage.french => 'Creer agenda',
      };

  String get experienceLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Experiencia',
        VibeVoiceLanguage.english => 'Experience',
        VibeVoiceLanguage.french => 'Experience',
      };

  String get homeLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Inicio',
        VibeVoiceLanguage.english => 'Home',
        VibeVoiceLanguage.french => 'Accueil',
      };

  String get captureNavLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Capturar',
        VibeVoiceLanguage.english => 'Capture',
        VibeVoiceLanguage.french => 'Capturer',
      };

  String get savedLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Guardados',
        VibeVoiceLanguage.english => 'Saved',
        VibeVoiceLanguage.french => 'Enregistres',
      };

  String get assetsLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Archivos',
        VibeVoiceLanguage.english => 'Files',
        VibeVoiceLanguage.french => 'Fichiers',
      };

  String get viewAgendaLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Ver agenda',
        VibeVoiceLanguage.english => 'View agenda',
        VibeVoiceLanguage.french => 'Voir agenda',
      };

  String get statusLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Estado',
        VibeVoiceLanguage.english => 'Status',
        VibeVoiceLanguage.french => 'Etat',
      };

  String get accountLabel => switch (this) {
        VibeVoiceLanguage.spanish => 'Cuenta',
        VibeVoiceLanguage.english => 'Account',
        VibeVoiceLanguage.french => 'Compte',
      };

  String repeatCommandMessage(String transcript) => switch (this) {
        VibeVoiceLanguage.spanish =>
          'No entendi "$transcript". Repite: foto, video, toma nota, agenda, cuenta o estado.',
        VibeVoiceLanguage.english =>
          'I did not understand "$transcript". Try: photo, video, take note, agenda, account, or status.',
        VibeVoiceLanguage.french =>
          'Je n ai pas compris "$transcript". Essayez: photo, video, note, agenda, compte ou etat.',
      };
}

class VibeCommandStatusBanner extends StatelessWidget {
  const VibeCommandStatusBanner({
    required this.online,
    required this.message,
    super.key,
  });

  final bool online;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: online
            ? const Color(0xFFFFF4BF)
            : colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: online ? const Color(0xFFB88A00) : colorScheme.outlineVariant,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              online ? Icons.sensors_outlined : Icons.info_outline,
              color: online ? const Color(0xFF7A5A00) : colorScheme.primary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: online ? const Color(0xFF4D3900) : null,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CompactQueueStatusCard extends StatelessWidget {
  const CompactQueueStatusCard({required this.summary, super.key});

  final CaptureQueueSummary summary;

  @override
  Widget build(BuildContext context) {
    final clear = summary.isClear;
    return Card(
      elevation: 0,
      color: clear ? const Color(0xFFEAF7F2) : const Color(0xFFFFF4DF),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(
              clear ? Icons.check_circle_outline : Icons.sync_problem_outlined,
              color: clear ? const Color(0xFF0D7C66) : Colors.orange.shade800,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                summary.operatorMessage,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AdvancedSettingsCard extends StatelessWidget {
  const AdvancedSettingsCard({
    required this.readinessCard,
    required this.flowSummary,
    required this.externalImportCard,
    required this.healthConnectCard,
    super.key,
  });

  final Widget readinessCard;
  final Widget flowSummary;
  final Widget externalImportCard;
  final Widget healthConnectCard;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: ExpansionTile(
        title: Text(tr.advancedTitle),
        subtitle: Text(tr.advancedSubtitle),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          readinessCard,
          const SizedBox(height: 16),
          flowSummary,
          const SizedBox(height: 16),
          externalImportCard,
          const SizedBox(height: 16),
          healthConnectCard,
        ],
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
              tr.nativeContractTitle,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(tr.nativeContractBody),
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
            'Permisos Android y contrato Health Connect cubren Samsung/Galaxy por pasos, pulso, sueno y actividad.',
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
      return 'Antes de usar en produccion: ${blockers.map((item) => item.title).join(', ')}.';
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
                    'Compuerta de compatibilidad movil',
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
              'Usa esta tarjeta antes de operar en telefono: confirma backend, sesion, cola y capacidades nativas sin exponer Supabase al usuario final.',
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
                  label: 'Sesion',
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
                  detail: 'Agenda, lugar, biometria e importaciones externas.',
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
              label: Text(tr.importExternalTitle),
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
                label: Text(tr.prepareHealthConnect),
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
                'Usa este modo cuando una experiencia tenga varios momentos. Cada nota o accion queda como evento interno del mismo registro.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Titulo de la experiencia',
                  hintText: 'Ejemplo: Visita al museo',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: onStart,
                icon: const Icon(Icons.play_circle_outline),
                label: Text(tr.startExperience),
              ),
            ] else ...[
              Text(active.title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      )),
              const SizedBox(height: 6),
              Text(
                '${active.events.length} evento(s) - inicio ${formatClock(active.startedAt)}',
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: onClose,
                icon: const Icon(Icons.stop_circle_outlined),
                label: Text(tr.closeExperienceLabel),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class AboutVibeappCard extends StatelessWidget {
  const AboutVibeappCard({
    required this.apiBaseUrl,
    required this.signedInEmail,
    required this.lastSyncAt,
    required this.queueSummary,
    super.key,
  });

  final String apiBaseUrl;
  final String signedInEmail;
  final DateTime? lastSyncAt;
  final CaptureQueueSummary queueSummary;

  @override
  Widget build(BuildContext context) {
    final lastSyncText = lastSyncAt == null
        ? tr.notSyncedYet
        : formatDateTime(lastSyncAt!);
    final queueText =
        queueSummary.isClear ? tr.allSavedShort : queueSummary.operatorMessage;
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: const Color(0xFFE7F4F0),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Padding(
                    padding: EdgeInsets.all(12),
                    child:
                        Icon(Icons.verified_outlined, color: Color(0xFF0D7C66)),
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        vibeappBuildLabel,
                        style: TextStyle(fontWeight: FontWeight.w900),
                      ),
                      SizedBox(height: 4),
                      Text(
                        vibeappReleaseLabel,
                        style: TextStyle(color: Colors.black54),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _DiagnosticRow(
              label: tr.accountTab,
              value:
                  signedInEmail.isEmpty ? tr.noActiveSession : signedInEmail,
            ),
            _DiagnosticRow(
              label: tr.diagDestination,
              value: apiBaseUrl.isEmpty ? tr.notDefined : apiBaseUrl,
            ),
            _DiagnosticRow(label: tr.diagLastSave, value: lastSyncText),
            _DiagnosticRow(label: tr.statusTab, value: queueText),
          ],
        ),
      ),
    );
  }
}

class _DiagnosticRow extends StatelessWidget {
  const _DiagnosticRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 118,
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.black54,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class SyncSettingsCard extends StatefulWidget {
  const SyncSettingsCard({
    required this.apiUrlController,
    required this.emailController,
    required this.passwordController,
    required this.signedInEmail,
    required this.authStatusMessage,
    required this.authStatusOk,
    required this.isSigningIn,
    required this.backendHealthOk,
    required this.backendHealthMessage,
    required this.checkingBackend,
    required this.onSignIn,
    required this.onRetry,
    required this.onVerifyBackend,
    super.key,
  });

  final TextEditingController apiUrlController;
  final TextEditingController emailController;
  final TextEditingController passwordController;
  final String signedInEmail;
  final String authStatusMessage;
  final bool authStatusOk;
  final bool isSigningIn;
  final bool backendHealthOk;
  final String backendHealthMessage;
  final bool checkingBackend;
  final Future<void> Function() onSignIn;
  final Future<void> Function({bool showSnackBar, bool force}) onRetry;
  final Future<void> Function() onVerifyBackend;

  @override
  State<SyncSettingsCard> createState() => _SyncSettingsCardState();
}

class _SyncSettingsCardState extends State<SyncSettingsCard> {
  bool _showPassword = false;
  String get signedInEmail => widget.signedInEmail;

  Future<void> _confirmRetryQueue() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr.retryQueueTitle),
        content: Text(tr.retryQueueBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(tr.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(tr.retry),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await widget.onRetry(showSnackBar: true, force: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              tr.accountTab,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(tr.signInBlurb),
            const SizedBox(height: 12),
            BackendStatusBanner(
              ok: widget.backendHealthOk,
              busy: widget.checkingBackend,
              message: widget.backendHealthMessage,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.apiUrlController,
              decoration: InputDecoration(
                labelText: tr.apiFieldLabel,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(
                labelText: tr.emailFieldLabel,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.passwordController,
              obscureText: !_showPassword,
              decoration: InputDecoration(
                labelText: tr.passwordFieldLabel,
                helperText: tr.passwordHelper,
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  tooltip: _showPassword ? tr.hidePassword : tr.showPassword,
                  onPressed: () =>
                      setState(() => _showPassword = !_showPassword),
                  icon: Icon(_showPassword
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined),
                ),
              ),
            ),
            const SizedBox(height: 12),
            AuthStatusBanner(
              message: widget.isSigningIn
                  ? tr.signingIn
                  : widget.signedInEmail.isNotEmpty
                      ? tr.signInReady
                      : widget.authStatusMessage,
              ok: widget.signedInEmail.isNotEmpty || widget.authStatusOk,
              busy: widget.isSigningIn,
            ),
            if (widget.signedInEmail.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(tr.activeSessionLine(signedInEmail)),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                OutlinedButton.icon(
                  onPressed:
                      widget.checkingBackend ? null : widget.onVerifyBackend,
                  icon: widget.checkingBackend
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.health_and_safety_outlined),
                  label: Text(
                      widget.checkingBackend ? tr.verifying : tr.verifyVibe),
                ),
                FilledButton.icon(
                  onPressed: widget.isSigningIn ? null : widget.onSignIn,
                  icon: const Icon(Icons.login_outlined),
                  label: Text(
                      widget.isSigningIn ? tr.signingIn : tr.signInAndSync),
                ),
                OutlinedButton.icon(
                  onPressed: _confirmRetryQueue,
                  icon: const Icon(Icons.sync_outlined),
                  label: Text(tr.retryQueueTitle),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class AuthStatusBanner extends StatelessWidget {
  const AuthStatusBanner({
    required this.message,
    required this.ok,
    required this.busy,
    super.key,
  });

  final String message;
  final bool ok;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final color = ok ? const Color(0xFF0D7C66) : Colors.orange.shade800;
    final background = ok ? const Color(0xFFEAF7F2) : const Color(0xFFFFF4DF);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            if (busy)
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: color),
              )
            else
              Icon(ok ? Icons.check_circle_outline : Icons.info_outline,
                  color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: TextStyle(color: color, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class BackendStatusBanner extends StatelessWidget {
  const BackendStatusBanner({
    required this.ok,
    required this.busy,
    required this.message,
    super.key,
  });

  final bool ok;
  final bool busy;
  final String message;

  @override
  Widget build(BuildContext context) {
    final color = ok ? const Color(0xFF0D7C66) : const Color(0xFF3657D6);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            if (busy)
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: color),
              )
            else
              Icon(
                ok ? Icons.cloud_done_outlined : Icons.cloud_queue_outlined,
                color: color,
              ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: TextStyle(color: color, fontWeight: FontWeight.w700),
              ),
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
    // Cada accion lleva su propio onTap (sin depender del texto de la etiqueta,
    // para que la localizacion no rompa el despacho).
    final entries = <(NativeCaptureAction, VoidCallback)>[
      (
        NativeCaptureAction(
          isRecordingAudio ? Icons.stop_circle_outlined : Icons.mic_none,
          tr.actAudio,
          isRecordingAudio ? tr.capAudioRecording : tr.capAudioDetail,
        ),
        () => unawaited(onAudio()),
      ),
      (
        NativeCaptureAction(
            Icons.photo_camera_outlined, tr.actPhoto, tr.capPhotoDetail),
        () => unawaited(onPhoto()),
      ),
      (
        NativeCaptureAction(Icons.videocam_outlined, tr.capVideo, tr.capVideoDetail),
        () => unawaited(onVideo()),
      ),
      (
        NativeCaptureAction(
            Icons.event_available_outlined, tr.actAgenda, tr.capAgendaDetail),
        () => unawaited(onAgenda()),
      ),
      (
        NativeCaptureAction(
            Icons.favorite_border, tr.biometricsLabel, tr.capBiometricDetail),
        () => unawaited(onBiometrics()),
      ),
      (
        NativeCaptureAction(Icons.place_outlined, tr.capPlace, tr.capPlaceDetail),
        () => unawaited(onLocation()),
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      childAspectRatio: 1.18,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      children: [
        for (final entry in entries)
          _CaptureActionTile(action: entry.$1, onTap: entry.$2),
      ],
    );
  }
}

class _CaptureActionTile extends StatelessWidget {
  const _CaptureActionTile({
    required this.action,
    required this.onTap,
  });

  final NativeCaptureAction action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: const Color(0xFFEAEAEA)),
          ),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(action.icon, color: const Color(0xFF0D7C66), size: 28),
              const SizedBox(height: 10),
              Text(
                action.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Expanded(
                child: Text(
                  action.detail,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Colors.black54),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CaptureQueuePanel extends StatelessWidget {
  const CaptureQueuePanel({
    required this.queue,
    required this.onClearSynced,
    required this.onClearLocalUnsynced,
    required this.onResetLocal,
    super.key,
  });

  final List<CaptureQueueItem> queue;
  final Future<void> Function() onClearSynced;
  final Future<void> Function() onClearLocalUnsynced;
  final Future<void> Function() onResetLocal;

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
                    label: Text(tr.clearReady),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            DecoratedBox(
              decoration: BoxDecoration(
                color: const Color(0xFFFFF4BF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE0C15B)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Limpieza de pruebas',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Estas acciones limpian solo este iPad. No borran datos ya enviados a Vibe PWA/backend.',
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: summary.total == summary.synced
                              ? null
                              : onClearLocalUnsynced,
                          icon: const Icon(Icons.delete_sweep_outlined),
                          label: Text(tr.deleteLocalTitle),
                        ),
                        OutlinedButton.icon(
                          onPressed: queue.isEmpty ? null : onResetLocal,
                          icon: const Icon(Icons.restart_alt_outlined),
                          label: Text(tr.resetLocalConfirm),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (queue.isEmpty)
              const Text(
                  'Sin capturas pendientes. Cuando guardes una nota o acciones un medio, aparecera aqui antes de sincronizar.')
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

class _BiometricSourceRow extends StatelessWidget {
  const _BiometricSourceRow({
    required this.icon,
    required this.title,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: const Color(0xFFE7F4F0),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Icon(icon, color: const Color(0xFF0D7C66), size: 22),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text(
                  detail,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Colors.black54),
                ),
              ],
            ),
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
      return SyncResult.failure('Sin conexion con la API.');
    } on FormatException {
      return SyncResult.failure('Respuesta invalida del servidor.');
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

  Future<AuthResult> signInViaBackend(String email, String password) async {
    final primary = await _signInThroughBackend(email, password);
    if (primary.ok) return primary;
    final fallback = await _signInDirectSupabase(email, password);
    if (fallback.ok) return fallback;
    return AuthResult.failure(
        'No se pudo entrar. Revisa correo, clave o conexion.');
  }

  Future<AuthResult> _signInThroughBackend(
      String email, String password) async {
    try {
      final uri =
          Uri.parse(settings.apiBaseUrl).resolve('/api/mobile/auth/sign-in');
      final request =
          await HttpClient().postUrl(uri).timeout(const Duration(seconds: 10));
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'email': email, 'password': password}));
      final response =
          await request.close().timeout(const Duration(seconds: 20));
      final responseText = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return AuthResult.failure(authMessageFromResponse(responseText));
      }
      final decoded = jsonDecode(responseText) as Map<String, dynamic>;
      return AuthResult.success((decoded['accessToken'] ?? '').toString());
    } on TimeoutException {
      return AuthResult.failure('Tiempo de espera agotado al entrar.');
    } on SocketException {
      return AuthResult.failure('Sin conexion con Vibe.');
    } on FormatException {
      return AuthResult.failure('Respuesta de acceso invalida.');
    } catch (error) {
      return AuthResult.failure(shorten(error.toString()));
    }
  }

  Future<AuthResult> _signInDirectSupabase(
      String email, String password) async {
    try {
      final config = await _loadConfig();
      final supabaseUrl = stringFromJson(config['supabaseUrl']);
      final publishableKey = stringFromJson(config['supabasePublishableKey']);
      if (supabaseUrl.isEmpty || publishableKey.isEmpty) {
        return AuthResult.failure(
            'No se pudo entrar. Revisa correo, clave o conexion.');
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
        return AuthResult.failure(authMessageFromResponse(responseText));
      }
      final decoded = jsonDecode(responseText) as Map<String, dynamic>;
      return AuthResult.success((decoded['access_token'] ?? '').toString());
    } on TimeoutException {
      return AuthResult.failure('Tiempo de espera agotado al entrar.');
    } on SocketException {
      return AuthResult.failure('Sin conexion con Vibe.');
    } on FormatException {
      return AuthResult.failure('Respuesta de acceso invalida.');
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
      throw StateError(shorten(responseText));
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

class PersistedVibeSession {
  const PersistedVibeSession({
    required this.apiBaseUrl,
    required this.email,
    required this.accessToken,
    required this.savedAt,
  });

  factory PersistedVibeSession.fromJson(Map<String, dynamic> json) {
    return PersistedVibeSession(
      apiBaseUrl: stringFromJson(json['apiBaseUrl']).trim(),
      email: stringFromJson(json['email']).trim(),
      accessToken: stringFromJson(json['accessToken']).trim(),
      savedAt: DateTime.tryParse(stringFromJson(json['savedAt'])) ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
    );
  }

  final String apiBaseUrl;
  final String email;
  final String accessToken;
  final DateTime savedAt;

  bool get isUsable =>
      apiBaseUrl.isNotEmpty && email.isNotEmpty && accessToken.isNotEmpty;

  Map<String, dynamic> toJson() {
    return {
      'version': 1,
      'apiBaseUrl': apiBaseUrl,
      'email': email,
      'accessToken': accessToken,
      'savedAt': savedAt.toUtc().toIso8601String(),
    };
  }
}

String authMessageFromResponse(String responseText) {
  try {
    final decoded = jsonDecode(responseText);
    if (decoded is Map) {
      final values = [
        stringFromJson(decoded['detail']),
        stringFromJson(decoded['message']),
        stringFromJson(decoded['error']),
      ];
      for (final value in values) {
        if (value.isNotEmpty) return value;
      }
    }
  } catch (_) {
    // Keep the fallback short and readable for the phone UI.
  }
  final plain = responseText.trim();
  return plain.isEmpty ? 'No se pudo iniciar sesion.' : shorten(plain);
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
            ? 'Sesion iniciada'
            : 'No se pudo entrar. Revisa correo, clave o conexion.',
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
    'Galeria / archivos del telefono',
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
  listen,
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
    if (command.trim().isEmpty && rawText.trim().isNotEmpty) {
      return const NativeQuickCommand(
        type: NativeQuickCommandType.listen,
        cleanedText: '',
      );
    }

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
      r'\b(agenda|calendario|recordarme|recuerdame|recuerdame|schedule|calendar|remind)\b',
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
      NativeQuickCommandType.listen => 'Confirmar V en linea',
      NativeQuickCommandType.agenda => 'Crear agenda',
      NativeQuickCommandType.startExperience => 'Iniciar experiencia',
      NativeQuickCommandType.closeExperience => 'Cerrar experiencia',
      NativeQuickCommandType.note => 'Guardar nota',
    };
  }

  IconData get previewIcon {
    return switch (type) {
      NativeQuickCommandType.listen => Icons.hearing_outlined,
      NativeQuickCommandType.agenda => Icons.event_available_outlined,
      NativeQuickCommandType.startExperience => Icons.play_circle_outline,
      NativeQuickCommandType.closeExperience => Icons.stop_circle_outlined,
      NativeQuickCommandType.note => Icons.sticky_note_2_outlined,
    };
  }

  String get previewTitle {
    return switch (type) {
      NativeQuickCommandType.listen => 'Vibe en linea',
      NativeQuickCommandType.agenda => 'Vibe entendio: crear agenda',
      NativeQuickCommandType.startExperience =>
        'Vibe entendio: iniciar experiencia',
      NativeQuickCommandType.closeExperience =>
        'Vibe entendio: cerrar experiencia',
      NativeQuickCommandType.note => 'Vibe entendio: guardar nota',
    };
  }

  String get previewDetail {
    if (type == NativeQuickCommandType.agenda && agenda != null) {
      final localStart = agenda!.startAt.toLocal();
      final time =
          '${localStart.hour.toString().padLeft(2, '0')}:${localStart.minute.toString().padLeft(2, '0')}';
      final place =
          agenda!.location.isEmpty ? 'sin lugar definido' : agenda!.location;
      return '${agenda!.title} - ${formatDateLabel(localStart)} $time - $place.';
    }
    if (type == NativeQuickCommandType.startExperience) {
      return cleanedText.isEmpty
          ? 'Se abrira una experiencia activa.'
          : 'Se abrira una experiencia activa: $cleanedText.';
    }
    if (type == NativeQuickCommandType.closeExperience) {
      return 'Se cerrara la experiencia activa y se intentara sincronizar.';
    }
    if (type == NativeQuickCommandType.listen) {
      return 'Di o escribe la accion completa: V, toma nota..., V, agenda..., V, inicia experiencia...';
    }
    return cleanedText.isEmpty
        ? 'Se guardara como nota rapida.'
        : 'Se guardara como nota: $cleanedText.';
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
      'location': location.isEmpty ? 'Sin ubicacion' : location,
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
        'location': location.isEmpty ? 'Sin ubicacion' : location,
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
      'Coordenadas $displayLocation - precision aproximada ${accuracy.toStringAsFixed(0)} m';

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
    required this.userSummary,
    required this.suggestedAction,
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
        ? 'sin senales identificadas'
        : metricNames.join(', ');
    final rangeText = startAt.isEmpty
        ? 'sin rango de fechas detectado'
        : '${formatDateLabel(DateTime.parse(startAt))} - ${formatDateLabel(DateTime.parse(endAt))}';
    final metricLabel = metricNames.isEmpty
        ? 'no pude identificar senales de salud claras'
        : 'detecte ${metricNames.join(', ')}';
    final userSummary = recordCount == 0
        ? 'Archivo recibido, pero no encontre registros legibles. Puedes conservarlo como respaldo o revisar el formato.'
        : 'Biometria lista: $metricLabel en $recordCount registros. Rango: $rangeText.';
    final suggestedAction = metricNames.isEmpty
        ? 'Revisa si el archivo viene de Apple Health, Oura, Samsung Health o Health Connect en CSV/JSON.'
        : 'Vibe usara estas senales por fecha y hora para explicar energia, recuperacion, sueno, actividad y contexto de tus experiencias.';
    final summary =
        'Importacion biometrica desde Vibeapp. $recordCount registros. Senales: $metricText. Rango: $rangeText.';
    return BiometricImportSummary(
      name: fileName,
      size: size,
      recordCount: recordCount,
      metricNames: metricNames,
      startAt: startAt,
      endAt: endAt,
      summaryText: summary,
      analysisText: '$userSummary $suggestedAction',
      userSummary: userSummary,
      suggestedAction: suggestedAction,
    );
  }

  factory BiometricImportSummary.fromOriginalArchive({
    required String fileName,
    required int size,
  }) {
    return BiometricImportSummary(
      name: fileName,
      size: size,
      recordCount: 0,
      metricNames: const ['archivo original Apple Health'],
      startAt: '',
      endAt: '',
      summaryText:
          'Archivo biometrico original conservado: $fileName. Pendiente de procesamiento backend.',
      analysisText:
          'Vibeapp guardo el ZIP original de Apple Health/Apple Watch como evidencia biometrica privada. No se interpreta en el telefono; debe procesarlo el backend o una herramienta posterior.',
      userSummary:
          'ZIP biometrico guardado: $fileName. Vibe lo conserva completo para procesarlo despues.',
      suggestedAction:
          'Procesar el ZIP en backend/PC para extraer XML/CSV de Apple Health y cruzarlo por fecha y hora.',
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
      userSummary: stringFromJson(json['userSummary']).isEmpty
          ? stringFromJson(json['summaryText'])
          : stringFromJson(json['userSummary']),
      suggestedAction: stringFromJson(json['suggestedAction']),
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
  final String userSummary;
  final String suggestedAction;

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
      'userSummary': userSummary,
      'suggestedAction': suggestedAction,
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
      'sueno': RegExp(r'sleep|sue[nn]o'),
      'pasos': RegExp(r'step|paso'),
      'frecuencia cardiaca': RegExp(r'heart|cardio|pulse|frecuencia'),
      'energia activa': RegExp(r'active energy|calor|kcal|energia|energia'),
      'distancia': RegExp(r'distance|distancia'),
      'entrenamiento': RegExp(r'workout|exercise|actividad|entreno'),
      'oxigeno': RegExp(r'oxygen|spo2|respir'),
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
    if (sourceType == 'biometric') return 'Biometria';
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
          '${event.title} - ${formatDateLabel(event.startAt.toLocal())} ${formatClock(event.startAt)}',
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
      title: 'Biometria',
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
    final locationLabel = locationDraft?.displayLocation ?? 'Captura movil';
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
                  ? 'Biometria importada'
                  : locationDraft == null
                      ? 'Nota rapida'
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
                  ? 'Biometria transversal desde Vibeapp'
                  : locationDraft == null
                      ? 'Captura rapida desde Vibeapp'
                      : 'Ubicacion capturada desde Vibeapp',
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
          '${agenda.description.isEmpty ? 'Evento creado desde Vibeapp.' : agenda.description} Lugar: ${agenda.location.isEmpty ? 'Sin ubicacion' : agenda.location}.',
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
      title: 'Biometria importada',
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
      title: 'Biometria importada',
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
  needsSession('Sesion', Icons.lock_outline),
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
  final raw = text.trim();
  final greeted = RegExp(
    r'^(hola|hello|hi|hey|oye)\s+([a-z]+)\b[,\s:;-]*(.*)$',
    caseSensitive: false,
  ).firstMatch(raw);
  if (greeted != null &&
      isNativeWakeToken(greeted.group(2) ?? '', greeted.group(3) ?? '')) {
    return (greeted.group(3) ?? '').trim();
  }
  final direct = RegExp(
    r'^([a-z]+)\b[,\s:;-]*(.*)$',
    caseSensitive: false,
  ).firstMatch(raw);
  if (direct != null &&
      isNativeWakeToken(direct.group(1) ?? '', direct.group(2) ?? '')) {
    return (direct.group(2) ?? '').trim();
  }
  return raw;
}

bool isNativeWakeToken(String token, String followingCommand) {
  final normalized = token.toLowerCase().trim();
  if (RegExp(r'^(v|ve|vee)$').hasMatch(normalized)) return true;
  if (RegExp(r'^(by|bye|bay|vai)$').hasMatch(normalized)) {
    return looksLikeNativeActionCommand(followingCommand);
  }
  return false;
}

bool looksLikeNativeActionCommand(String command) {
  final lower = command.toLowerCase().trim();
  if (lower.isEmpty) return false;
  return RegExp(
    r'\b(toma nota|tomar nota|anota|nota que|guarda esto|guardar esto|take note|note that|save this|agenda|calendario|recordarme|recuerdame|schedule|calendar|remind|empieza|inicia|iniciar|abre|nueva|graba|start|begin|new|create|cierra|cerrar|termina|terminar|finaliza|finalizar|stop|close|end|foto|imagen|photo|picture|video|audio|voz)\b',
    caseSensitive: false,
  ).hasMatch(lower);
}

bool hasNativeWakePhrase(String text) {
  final normalized = stripDiacritics(text.toLowerCase()).trim();
  return RegExp(r'^(v|ve|vee|hola v|hi v)\b').hasMatch(normalized);
}

String stripDiacritics(String value) {
  const replacements = {
    'á': 'a',
    'à': 'a',
    'ä': 'a',
    'â': 'a',
    'ã': 'a',
    'é': 'e',
    'è': 'e',
    'ë': 'e',
    'ê': 'e',
    'í': 'i',
    'ì': 'i',
    'ï': 'i',
    'î': 'i',
    'ó': 'o',
    'ò': 'o',
    'ö': 'o',
    'ô': 'o',
    'õ': 'o',
    'ú': 'u',
    'ù': 'u',
    'ü': 'u',
    'û': 'u',
    'ñ': 'n',
  };
  var normalized = value;
  for (final entry in replacements.entries) {
    normalized = normalized.replaceAll(entry.key, entry.value);
  }
  return normalized;
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
    description: 'Creado desde comando rapido: ${command.trim()}',
    location: extractNativeAgendaLocation(command),
    startAt: startAt.toUtc(),
    endAt: startAt.add(const Duration(hours: 1)).toUtc(),
  );
}

DateTime parseNativeCommandDateTime(String command, DateTime now) {
  final lower = command.toLowerCase();
  var date = DateTime(now.year, now.month, now.day);
  if (lower.contains('manana') || lower.contains('manana')) {
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
          r'\b(pon en mi agenda|agrega a mi agenda|agenda|calendario|recordarme|recuerdame|recuerdame|schedule|calendar|remind me|remind)\b',
          caseSensitive: false,
        ),
        '',
      )
      .replaceAll(
        RegExp(
          r'\b(hoy|manana|manana|today|tomorrow|a las|at|am|pm|a\.m\.|p\.m\.)\b',
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
    r'\b(?:en|at)\s+(.+?)(?:\s+(?:con|hoy|manana|manana|today|tomorrow|a las|at)\b|$)',
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

String formatDateTime(DateTime value) {
  final local = value.toLocal();
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '${formatDateLabel(local)} $hour:$minute';
}
