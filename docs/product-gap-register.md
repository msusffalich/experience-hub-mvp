# Registro de brechas de producto Vibe

Fecha: 2026-07-27

Este archivo evita que los pendientes queden escondidos en conversaciones, notas o supuestos. Todo punto abierto debe vivir aqui hasta cerrarse con prueba.

## Regla

- No se declara una capacidad como lista si solo fue asumida.
- Cada brecha debe tener alcance, estado real, prueba requerida y criterio de cierre.
- Si una brecha se cierra, se deja la evidencia de prueba y version.
- Si un cambio toca PWA, servidor, Vibeapp o conectores, debe actualizar este registro cuando cambie el estado.

## Estados permitidos

- `Cerrado con prueba`: hay test automatico o validacion fisica/API real documentada.
- `Listo PC`: paso codigo/tests, falta dispositivo o proveedor externo.
- `Listo Mac/iPhone`: compilo e instalo en iPhone/iPad, falta otro hardware si aplica.
- `Pendiente hardware/API`: depende de dispositivo, cuenta, SDK o permiso externo.
- `Bloqueado por falta de dispositivo`: existe ruta tecnica, pero no hay hardware disponible para validar.
- `Bloqueado`: no se puede avanzar sin decision, cuenta o recurso externo.

## Brechas activas

| Area | Brecha | Estado real | Prueba requerida | Criterio de cierre |
|---|---|---|---|---|
| Captura Vibeapp -> servidor | La ruta experimental mezcló captura con experiencia y perdió/rechazó elementos reales | Bloqueada y en reemplazo | Matriz real de texto, imagen, audio, video, documento y contexto; sin señal; reinicio; respuesta perdida; reintento | Una sola ruta conserva original, catálogo y recibo; VibePWA muestra el mismo registro; ningún elemento desaparece |
| Arquitectura de historias | Rutas y documentos antiguos aún permiten crear experiencias desde Vibeapp | Reestructuración en curso | Inventario automático + pruebas de separación + UI de historia en VibePWA | Vibeapp no envía campos de historia; VibePWA es único escritor de experiencias/eventos |
| UI/UX VibePWA | Navegación y formularios mezclan producto, operación y legado | Reestructuración en curso | Auditoría visual en escritorio/tableta/móvil y recorridos con usuario no técnico | Inicio, Historias, Evidencia, Inteligencia, Publicar y Cuenta cubren los flujos sin controles técnicos visibles |
| Alcance analítico | Reportes, Hallazgos y Publicaciones aplican filtros similares con implementaciones separadas | Núcleo común listo; UI pendiente | Misma selección produce el mismo conjunto en las tres salidas | Período, persona/grupo y base común; categoría opcional; Publicaciones confirma contenido visual |
| Apple Health directo | Leer HealthKit nativo sin archivo manual | Pendiente hardware/API | iPhone real + permisos HealthKit + prueba de lectura por tipo de dato | Captura real crea contexto biometrico sin importar archivo |
| Android tablet | Validar layout y flujo Android tablet | Bloqueado por falta de dispositivo/tablet emulada | Tablet Android fisica o AVD tablet + instalacion/lanzamiento + flujo tactil | Vibeapp abre, navega y captura sin desbordes en tablet Android |
| Android build futuro | Migrar Kotlin Gradle Plugin a Built-in Kotlin cuando Flutter lo exija | Deuda tecnica no bloqueante | Revisar plugins file_picker, image_picker_android, package_info_plus y record_android; ejecutar build con Flutter futuro | Build Android sin advertencia KGP |
| Samsung Watch / Galaxy Watch | Leer datos via Health Connect | Bloqueado por falta de dispositivo | Android real con Health Connect + permisos + registros reales | Vibeapp Android envia pasos, frecuencia, sueño/actividad al backend |
| Oura Ring 4 | Lectura completa por API Oura v2; CSV solo respaldo parcial | Listo PC / pendiente credenciales Oura | Producto implementa OAuth backend, tokens cifrados, sync paginado con `next_token`, webhook, rutina diaria desactivada y prueba personal `daily_activity`; `daily_sleep` y `daily_readiness` vacios porque no hubo lecturas | Definir variables Oura en Railway, conectar cuenta real por OAuth, activar rutina `Oura Sync` y validar rangos con lecturas de sueño, recuperacion, frecuencia cardiaca, SpO2, estres, resiliencia y workouts |
| Meta/Oakley/Ray-Ban | Captura visual e importacion de fotos/videos desde Meta AI/Galeria | Pendiente hardware/API | Media real importada desde lentes + JSON/HTML de cuenta si aplica | Fotos/videos quedan como activos con origen Meta y procesamiento correcto; voz de V se mantiene en telefono/tablet |
| iPad/tablets | UX y layout tactil | Listo parcial / Android bloqueado | iPad instalo/lanzo Vibeapp 536; flujo general OK; falta revalidar Vibeapp 537 para feedback de `V`; tablet Android bloqueada por falta de dispositivo | Captura, Estado, Cuenta, Archivos, navegacion y comando `V` sin desbordes ni silencios |
| Wake-up nativo con app cerrada | Activar Vibe desde iOS/Android sin tener la pantalla abierta | Pendiente hardware/API | iPhone/Android real + App Intents/Shortcuts o servicio nativo aprobado por el sistema | `V` dispara una accion segura de captura sin abrir flujo manual, dentro de las reglas de cada OS |

## Brechas cerradas recientes

| Area | Cierre | Evidencia |
|---|---|---|
| Biometria Apple Health ZIP | Servidor procesa `export.zip` cuando contiene `apple_health_export/export.xml`; otros ZIP siguen como transporte | `npm run verify:processing`; metodo `server-apple-health-zip-extraction`; devuelve `biometricImport` y `structuredContext.connector = apple-healthkit-native` |
| Android phone emulado | Vibeapp compila, instala y lanza en Pixel 6 Android 15/API 35 | `npm run verify:android:emulator`; evidencia en `data/android-emulator-validation.json` |
| Vibeapp PC/Mac handoff | Protocolo obligatorio con objetivo explicito antes de intercambiar | `PROTOCOLO_VERSIONES_CODEX_WINDOWS_MAC.md`; `npm run verify:flutter` exige protocolo |
| Vibeapp versionado | Version visible alineada con `pubspec.yaml` | `Vibeapp 537`; `npm run verify:flutter` |
| Vibeapp biometria por archivo | CSV/JSON/ZIP aceptados en selector nativo y ZIP preservado para backend | `npm run verify:flutter` |
| Comando V en app activa | PWA y Vibeapp reconocen `V`, `ve`, `vee` y variantes de dictado `by/bye/vai` solo cuando hay una accion reconocible | `npm run check`; `npm run verify:flutter`; guardia `stripNativeWakePhrase('bye') == 'bye'` |
| Feedback V en iPad | `V`, `Hola V` y `Hi V` solos muestran `Vibe activo` en lugar de nota muda | Absorbido desde Codex Mac 537; `flutter analyze`; `flutter test`; Mac instalo/lanzo 537; falta confirmacion manual de Miguel |
| Oura actividad real | JSON real de Oura Ring 4 `daily_activity` se normaliza e ingesta como contexto biometrico transversal | `npm run verify:oura:personal-json`; evidencia `data/oura-personal-json-validation.json`; paneles afectados: dashboard, capture, assets, reports, findings; accion `biometric_impact_recomputed` |
| Oura producto backend | OAuth, sync paginado, webhook y rutina diaria segura quedan implementados sin exponer tokens al navegador | `npm run verify:oura:product`; `npm run verify:integrations` |
