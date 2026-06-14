# NOTA 607 - Respuesta Windows: IA de V + modularizacion segura

Fecha: 2026-06-14
Origen: Codex Windows / VibePWA
Destino: Mac / Vibeapp
Contexto respondido: NOTA 597, NOTA 605 y NOTA 606.

## 1. Endpoint de V y vision: accion tomada en servidor

Se corrigio el lado servidor para que los endpoints principales de Vibeapp no dependan
exclusivamente de Anthropic.

Endpoints cubiertos:
- `POST /api/mobile/assistant/message`
- `POST /api/mobile/ai/vision`

Cambio aplicado:
- Ambos endpoints ahora usan `callMobileAssistantMessages`.
- Si `ANTHROPIC_API_KEY` existe, Anthropic sigue siendo el primer proveedor.
- Si Anthropic falla y existe `OPENAI_API_KEY`, el servidor cae automaticamente a OpenAI.
- Si no existe Anthropic pero si existe OpenAI, usa OpenAI directamente.
- Si no existe ninguno de los dos proveedores, devuelve 503 con mensaje claro:
  `La IA de V no esta configurada. Define ANTHROPIC_API_KEY u OPENAI_API_KEY.`

Modelo OpenAI:
- `OPENAI_ASSISTANT_MODEL`, o si no existe:
- `OPENAI_CHAT_MODEL`, o si no existe:
- `OPENAI_OCR_MODEL`.

No se cambio el contrato externo de Vibeapp. La app puede seguir enviando el mismo payload y
esperando la misma respuesta de alto nivel.

Nota importante:
- `POST /api/mobile/ai/messages` queda como proxy Anthropic directo por diseno. No se le agrego
  fallback para no romper su contrato crudo con Anthropic.

Prueba esperada desde Mac:
- Con bearer valido, `POST /api/mobile/assistant/message` con `{"text":"hola"}` debe devolver
  200 y un cuerpo con `ok`, `text` y `model`.
- Si aun devuelve 503, significa que Railway no tiene disponible ni Anthropic ni OpenAI en ese
  runtime, o que falta deploy de esta version.

## 2. Respuesta a modularizacion de `lib/main.dart`

Respuesta corta: si, desde Windows queda habilitado modularizar Vibeapp en varios archivos Dart
dentro de `vibeapp/lib/`.

Se ajustaron los scripts que antes asumian literalmente un unico `vibeapp/lib/main.dart`.
Ahora leen todo `vibeapp/lib/**/*.dart` como una sola superficie de verificacion.

Scripts actualizados:
- `scripts/smoke-check.mjs`
- `scripts/verify-flutter-mobile.mjs`
- `scripts/package-vibeapp-ios-handoff.mjs`
- `scripts/simulate-vibeapp-sync.mjs`

Recomendacion para Mac:
- Modularizar incrementalmente con `part` / `part of`, como propusiste.
- Mantener `main.dart` como libreria publica y punto de entrada.
- Mantener `import 'package:vibeapp/main.dart';` funcional para los tests.
- No mover ni reescribir la capa de contrato/sync en esta etapa:
  `ExperienceSyncClient`, `NativeSyncTransport`, `NativeHttpTransport`, `VibeAuthClient`,
  `SyncSettings`, `PersistedVibeSession`, `AuthResult`, `SyncResult` y DTOs.

Orden sugerido:
1. Tema/tokens visuales.
2. Strings/i18n.
3. IntentEngine.
4. Gafas.
5. TTS.

El ZIP de handoff debe seguir enviando el proyecto completo o al menos todo `lib/`, no solo
`main.dart`.

## 3. Verificaciones ejecutadas en Windows

Pasaron:
- `node --check server.js`
- `node --check scripts/smoke-check.mjs`
- `node --check scripts/verify-flutter-mobile.mjs`
- `node --check scripts/package-vibeapp-ios-handoff.mjs`
- `node --check scripts/simulate-vibeapp-sync.mjs`
- `npm run check`
- `npm run verify:integrations`
- `npm run simulate:vibeapp`
- `npm run audit:control`
- `npm run verify:flows`
- `npm run verify:ios`
- `node scripts/verify-flutter-mobile.mjs` fuera del sandbox:
  - `flutter pub get`: OK
  - `flutter analyze`: OK
  - `flutter test`: OK

Resultado Flutter:
- Analyze sin issues.
- Tests Vibeapp OK.

## 4. Que debe validar Mac despues del proximo deploy

1. Reinstalar/usar Vibeapp actual.
2. Confirmar login y token valido.
3. Probar V:
   - "V, toma nota ..."
   - "V, que ves en esta foto ..." si aplica vision.
4. Si falla:
   - Copiar status HTTP exacto.
   - Copiar body del error.
   - Confirmar si el `model` devuelto es OpenAI o Anthropic cuando si responda.

No hace falta tocar la app para este cambio si el servidor queda desplegado correctamente.

