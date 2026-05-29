# Conectores de salud y wearables

Version app: `20260529-publication-channel-picker-497`

Este documento consolida los conectores revisados para Oura, Apple Health, Samsung/Android Health Connect y Meta Wearables.

## Oura OpenAPI v2

El archivo `openapi-1.30.json` sirve para Vibe como base de un conector biometrico real de Oura. No sirve para multimedia; su valor esta en sueño, actividad, recuperacion, estres, resiliencia, SpO2, frecuencia cardiaca, entrenamientos, edad cardiovascular, VO2 max y bateria del anillo.

## Rutas backend incorporadas

- `GET /api/integration/oura/manifest`: describe endpoints Oura, scopes, tipos de datos, metricas y modo recomendado de sincronizacion.
- `POST /api/integration/oura/normalize`: recibe uno o varios documentos Oura y los transforma en señales Vibe compatibles con `vibe-signal-contract-v2`.

## Mapeo principal

| Oura data type | Endpoint Oura | Vibe payload | Uso en Vibe |
|---|---|---|---|
| `daily_readiness` | `/v2/usercollection/daily_readiness` | `biometric` | energia, recuperacion, temperatura |
| `daily_sleep` / `sleep` | `/v2/usercollection/daily_sleep`, `/v2/usercollection/sleep` | `sleep` | sueño, descanso, recuperacion |
| `daily_activity` | `/v2/usercollection/daily_activity` | `activity` | pasos, calorias, movimiento |
| `daily_stress` | `/v2/usercollection/daily_stress` | `biometric` | estres y recuperacion |
| `daily_resilience` | `/v2/usercollection/daily_resilience` | `biometric` | resiliencia |
| `daily_spo2` | `/v2/usercollection/daily_spo2` | `biometric` | oxigenacion y respiracion |
| `heartrate` | `/v2/usercollection/heartrate` | `biometric` | frecuencia cardiaca |
| `workout` | `/v2/usercollection/workout` | `activity` | ejercicio |
| `daily_cardiovascular_age` | `/v2/usercollection/daily_cardiovascular_age` | `biometric` | edad cardiovascular |
| `vO2_max` | `/v2/usercollection/vO2_max` | `biometric` | capacidad aerobica |
| `ring_battery_level` | `/v2/usercollection/ring_battery_level` | `context` | salud del dispositivo |

## Seguridad y privacidad

- Los datos Oura se tratan como `privacyLevel: sensitive`.
- OAuth/token debe vivir en backend, nunca en el navegador.
- La URL base normalizada debe ser `https://api.ouraring.com`; el OpenAPI recibido trae `https://api.None.com`, por lo que no se usa literalmente.
- La sincronizacion productiva requiere `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` y `OURA_REDIRECT_URI`.

## Siguiente incremento

1. Agregar pantalla de conexion Oura en Administracion.
2. Implementar OAuth backend.
3. Guardar token cifrado o delegado a Supabase secrets/Edge Function.
4. Crear job diario para `daily_readiness`, `daily_sleep`, `daily_activity`, `daily_stress` y `daily_resilience`.
5. Usar webhooks despues de la primera sincronizacion estable.

## Apple Health / HealthKit

Decision: Apple Health no ofrece una REST API directa para que la PWA o el backend consulten datos de salud. La ruta correcta para Vibe es una app nativa iOS que use HealthKit con consentimiento granular del usuario y envie datos normalizados al backend.

Rutas backend:

- `GET /api/integration/apple-health/manifest`
- `POST /api/integration/apple-health/normalize`

Tipos priorizados: pasos, energia activa, distancia, frecuencia cardiaca, frecuencia cardiaca en reposo, HRV, oxigeno, respiracion, temperatura, sueño y workouts.

Ruta no recomendada como base: CloudKit para HealthKit. Puede servir en casos puntuales, pero no debe ser el flujo principal por privacidad, permisos, cobertura incompleta y fragilidad operacional.

## Samsung / Android Health Connect

Decision: para Samsung Health y Galaxy Watch se debe priorizar Health Connect. El documento de Android indica que Health Platform API v1 esta deprecado y fue reemplazado por Health Connect.

Rutas backend:

- `GET /api/integration/health-connect/manifest`
- `POST /api/integration/health-connect/normalize`

Tipos priorizados: StepsRecord, ActiveCaloriesBurnedRecord, DistanceRecord, HeartRateRecord, RestingHeartRateRecord, HeartRateVariabilityRmssdRecord, OxygenSaturationRecord, RespiratoryRateRecord, BodyTemperatureRecord, SleepSessionRecord y ExerciseSessionRecord.

Incremento Vibeapp Android:

- `AndroidManifest.xml` declara permisos Health Connect por tipo de dato: pasos, calorias activas, distancia, frecuencia cardiaca, pulso en reposo, HRV, oxigeno, respiracion, temperatura, sueno y ejercicio.
- `HealthConnectPermissionPlan` mantiene el mapa permiso -> dato para que la app pida autorizacion en contexto y no con un permiso generico ambiguo.
- `HealthConnectPreviewBundle` genera senales `android-health-connect` de prueba sin telefono fisico. Sirve para validar cola, payload, privacidad sensible, idempotencia y lectura posterior desde la PWA.
- La lectura real queda como paso de dispositivo: instalar plugin Health Connect, pedir permisos en Android y leer registros locales del usuario antes de enviarlos al backend.

## Meta Wearables

Decision: Meta Wearables no debe tratarse como REST cloud general para Vibe. La ruta inmediata es importacion desde Meta AI/Galeria del telefono; la ruta avanzada es Vibeapp como puente nativo si el SDK/Device Access Toolkit queda disponible para el proyecto.

Rutas backend:

- `GET /api/integration/meta-wearables/manifest`
- `POST /api/integration/meta-wearables/normalize`

Tipos priorizados: photo, video, voice_activity, autocapture_session y ai_context_export.

## Regla comun

Todas estas rutas deben producir señales `vibe-signal-contract-v2`, con `sourceId`, `capturedAt`, `participantId`, `payloadType`, `privacyLevel`, `payload`, `deviceMetadata` e `idempotencyKey`. Los datos de salud se tratan como `sensitive`; los medios de Meta como `private`.

## Uso en la PWA

La PWA usa la biometria como contexto transversal, no como un adjunto aislado de una sola experiencia. Los CSV/JSON importados desde Activos y las señales estructuradas que llegan desde Vibeapp se hidratan en el mismo resumen biometrico central.

Ese resumen alimenta cuatro superficies:

- Panel: muestra cobertura, energia sugerida, riesgo contextual y ejemplos recientes.
- Captura: ayuda a comparar energia percibida contra señales cercanas por fecha/hora.
- Reportes: cruza biometria con el alcance filtrado para explicar energia, recuperacion y confianza.
- Hallazgos: convierte coincidencias biometricas en recomendaciones humanas, no diagnosticas.

Regla operativa: si la señal no tiene fecha/hora clara, queda importada pero sin impacto analitico hasta que exista una experiencia cercana. Esto evita conclusiones falsas.

## Ingesta validada

La ruta `POST /api/integration/ingest` recibe una señal o un arreglo `signals` usando el mismo contrato que `POST /api/integration/validate`.

Comportamiento actual:

- `text`: crea o actualiza una experiencia con id estable derivado de `idempotencyKey`.
- `calendar`: crea o actualiza un evento de Agenda con id estable.
- `biometric`, `activity`, `sleep`, `location` y `context`: crean una experiencia de contexto con `metadata.structuredContext.signals`, para que la PWA la use en biometria, Panel, Reportes y Hallazgos.
- `image`, `audio`, `video`, `document` y `media`: quedan aceptados como `accepted_pending_media`; el archivo binario debe subir por `/api/media` con el mismo `sourceId` e `idempotencyKey`.

La regla sigue siendo la misma: ninguna fuente escribe directamente sobre reportes o hallazgos. Primero se transforma en experiencia, agenda, activo o contexto sincronizable.

## Prueba integral de conectores

Ruta backend:

- `GET /api/integration/device/selftest`

Esta prueba ejecuta muestras normalizadas de Oura, Apple Health, Health Connect/Samsung y Meta Wearables. Debe devolver `ok=true`, 4 muestras correctas y destinos esperados: contexto para salud/biometría y activos para multimedia Meta. Es la compuerta previa a conectar OAuth, HealthKit, Health Connect o SDKs reales.
