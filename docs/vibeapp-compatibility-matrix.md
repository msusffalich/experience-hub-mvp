# Vibeapp compatibility matrix

Fecha: 2026-06-05

## Regla de calidad

No usar "validado" como palabra suelta. Cada familia de dispositivo o servicio debe indicar el alcance real:

- **Validado por codigo/tests en PC**: contratos, payloads, parsing, dependencias y pruebas Flutter pasan sin dispositivo fisico.
- **Validado por build/install en Mac**: compila para iOS y se instala en iPhone fisico.
- **Validado manualmente en iPhone**: Miguel o QA ejecuto el flujo afectado en el dispositivo.
- **Pendiente de dispositivo real**: requiere hardware, permisos nativos, cuenta del proveedor o SDK externo.

Una entrega de Vibeapp que toque Apple/iOS, selector de archivos, permisos, camara, audio, ubicacion o salud no se considera lista de producto hasta pasar por Mac/iPhone y QA manual del flujo afectado.

## Matriz actual

| Familia | Ruta actual | Formatos | Validacion actual | Pendiente |
|---|---|---|---|---|
| iPhone / iOS | Vibeapp Flutter instalada por Xcode | texto, audio, foto, video, ubicacion, archivo | Validado por codigo/tests en PC; Validado por build/install en Mac; prueba manual parcial en iPhone | QA visual y tactil por flujo afectado |
| iPad / iPadOS | Misma app Flutter con layout adaptable | texto, audio, foto, video, ubicacion, archivo, comando V | Validado por codigo/tests en PC; instalado/lanzado en iPad con Vibeapp 536; flujo general OK por prueba manual | Revalidar Vibeapp 537 para feedback de `V`; tablet Android sigue pendiente |
| Android phone | Vibeapp Flutter Android | texto, audio, foto, video, ubicacion, archivo | Validado en emulador Android 15/API 35 con `npm run verify:android:emulator`; instala y lanza Vibeapp | Mantener prueba fisica Android como validacion comercial adicional |
| Android tablet | Vibeapp Flutter Android con layout adaptable | texto, audio, foto, video, ubicacion, archivo | Bloqueado por falta de dispositivo/tablet emulada especifica; solo codigo/tests PC y contrato Android/manifest | No declarar listo hasta APK/AAB en tablet Android fisica o emulador tablet equivalente |
| Apple Health / Apple Watch | Importacion por archivo desde iOS Files | CSV, JSON, Apple Health export.zip | Validado por codigo/tests en PC; Validado por build/install en Mac; servidor procesa ZIP con XML Apple Health sintetico | QA manual en iPhone con export.zip real y archivo real de Apple Health |
| Oura Ring | API Oura v2 / importacion manual de respaldo | CSV, JSON, API REST | Validado por codigo/tests en PC; OAuth backend, token cifrado, sync paginado, webhook y rutina `Oura Sync`; `daily_activity` real de Oura Ring 4 normalizado e ingerido con `npm run verify:oura:personal-json`; endpoints vacios son aceptables cuando no hubo lecturas | Configurar credenciales Oura en Railway, conectar OAuth real y completar con lecturas reales: sleep, daily_sleep, daily_readiness, heartrate, SpO2, stress, resilience y workouts |
| Samsung Health / Samsung Watch / Galaxy Watch | Health Connect / importacion manual | CSV, JSON, ZIP de transporte | Bloqueado por falta de dispositivo Samsung/Galaxy; solo manifest, normalizador y tests PC | Android fisico con Samsung/Galaxy Watch, permisos Health Connect y lectura real |
| Health Connect Android | Puente Android planificado y contrato normalizado | steps, heart rate, sleep, HRV, activity | Emulador disponible para validar permisos/flujo; datos reales de wearable siguen bloqueados | Device Android con Health Connect instalado o emulador con flujo de permisos/simulacion validado |
| Meta / Oakley / Ray-Ban | Ruta visual: importar desde Meta AI/Fotos/Galeria al telefono o usar Vibeapp como puente de camara cuando aplique | JPG, HEIC, MP4, HEVC, JSON/HTML de cuenta | Validado por codigo/tests en PC; decision de producto 618: sin voz por gafas | Prueba con media real importada desde lentes |
| Camara iPhone | ImagePicker nativo | JPG/HEIC imagen, video MOV/MP4 segun iOS | Validado por build/install en Mac; prueba manual previa | Repetir si cambia UI de captura |
| Audio iPhone | Record plugin | M4A/AAC | Validado por build/install en Mac; prueba manual previa | Repetir si cambia permiso o codec |
| Ubicacion iPhone | Geolocator | coordenadas + precision | Validado por build/install en Mac; prueba manual previa | Repetir si cambia permiso o texto de privacidad |
| Comando de voz V en app activa | Reconocimiento mientras PWA o Vibeapp estan abiertos | V, ve, vee, Hi V, Hola V, y variantes de dictado by/bye/vai con accion reconocible | Validado por codigo/tests en PC; Vibeapp 537 agrega feedback `Vibe activo` cuando solo se dice `V` | Revalidar manualmente en iPad/iPhone y luego Android |
| Wake-up nativo en segundo plano | App Intents/Shortcuts o servicio nativo permitido por OS | Acciones seguras de captura rapida | Pendiente de dispositivo real | Probar iOS y Android con app cerrada o en background |
| PWA/backend | API Vibe / Supabase / Storage | contratos Vibe y archivos privados | Validado por codigo/tests en PC; health productivo separado | Verificar antes de cada prueba movil que dependa de sync |

## Requisitos que deben fallar en CI/preflight

`npm run verify:flutter` debe fallar si falta cualquiera de estos elementos:

- Version visible `Vibeapp N` y `pubspec.yaml` build `+N` desalineados.
- `Apple Health export.zip` no aceptado como archivo biometrico original.
- Selector biometrico usa una hoja inferior con botones bloqueables en iOS en vez de dialogo seguro.
- CSV/JSON/ZIP no estan permitidos para biometria.
- ZIP se intenta interpretar en el telefono en vez de preservarse para backend/PC.
- Falta matriz de fuentes externas: Apple, Oura, Samsung/Health Connect y Meta/Oakley.
- Falta declaracion explicita de iPhone, iPad, Android phone, Android tablet, Apple Watch, Samsung Watch, Oura y Meta/Oakley.
- Los tests Flutter no cubren `export.zip`, `biometric_archive` y MIME `application/zip`.
- El comando de voz `V` no reconoce variantes reales de dictado o elimina `bye` cuando no hay accion reconocible.
- `V`, `Hola V` o `Hi V` solos no muestran feedback visible de escucha activa.

## Decisiones de producto

- La PWA sigue siendo el centro de analisis, reportes, hallazgos y publicaciones.
- Vibeapp no debe prometer control total de accesorios externos si el fabricante no lo permite.
- Vibeapp debe funcionar como puente nativo robusto: captura real, permisos reales, cola local, sincronizacion y empaquetado correcto para backend.
- El comando `V` en primer plano es parte del producto; el wake-up con app cerrada debe resolverse con capacidades nativas y pruebas reales por OS.
- Apple Health directo requiere HealthKit nativo con permisos granulares; hasta entonces se acepta exportacion manual CSV/JSON/ZIP.
- Samsung/Galaxy debe priorizar Health Connect, no APIs antiguas.
- Meta/Oakley debe entrar como captura visual o importacion desde Meta AI/Fotos/Galeria. No se promete voz por gafas; V escucha y responde desde telefono/tablet.
- La meta de producto es compatibilidad total con iPhone, iPad, telefonos Android, tablets Android, Apple Watch, Samsung Watch/Galaxy Watch, Oura Ring y lentes Meta Ray-Ban/Oakley.
- La app no debe declarar una familia como lista comercialmente hasta tener al menos una prueba fisica o API real de esa familia.

## Criterio de salida por bloque

Para cerrar un bloque movil de producto:

1. PC: `npm run verify:flutter` pasa.
2. Si toca iOS o hardware: Mac compila e instala.
3. Si toca experiencia tactil/permisos/Files/camara/audio/ubicacion/salud: se prueba manualmente en iPhone.
4. Se escribe nota con producto, version, estado, alcance real de validacion y siguiente accion.

