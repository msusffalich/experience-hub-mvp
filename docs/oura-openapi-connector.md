# Conectores de salud y wearables

Version app: `20260605-v-command-wake-533`

Este documento consolida los conectores revisados para Oura, Apple Health, Samsung/Android Health Connect y Meta Wearables.

## Oura OpenAPI v2 / Oura Ring 4

El archivo `openapi-1.30.json` sirve para Vibe como base de un conector biometrico real de Oura. No sirve para multimedia; su valor esta en sueño, actividad, recuperacion, estres, resiliencia, SpO2, frecuencia cardiaca, entrenamientos, edad cardiovascular, VO2 max y bateria del anillo.

El CSV `oura_2024-12-10_2026-06-06_trends.csv` es util como respaldo e importacion historica parcial, pero no es lectura completa. La muestra revisada trae solo:

- `date`
- `Total Sleep Duration`
- `Average MET`

Por eso el CSV permite cruzar sueño total y actividad promedio por fecha, pero no reemplaza la API para readiness, HRV, SpO2, temperatura, frecuencia cardiaca detallada, etapas de sueño, workouts, bateria o resiliencia.

## Decision oficial 2026

La ruta recomendada para Vibe es la API oficial Oura v2 con OAuth2 en backend.

No usar Personal Access Token como base de producto. El OpenAPI 1.30 recibido indica que los personal access tokens fueron deprecados en diciembre de 2025. Para pruebas personales puede existir documentacion antigua o flujos heredados, pero Vibe debe tratarlo como fallback manual, no como integracion comercial.

Flujo correcto para producto:

1. Usuario conecta Oura desde Vibe.
2. Backend redirige a Oura OAuth con scopes minimos.
3. Backend intercambia `code` por `access_token` y `refresh_token`.
4. Backend guarda tokens cifrados, nunca en PWA ni Vibeapp.
5. Primera sincronizacion trae historial acotado por rango de fechas.
6. Jobs diarios mantienen datos basicos.
7. Webhooks se agregan despues para actualizaciones cercanas a tiempo real.

Scopes iniciales recomendados:

- `daily`: readiness, sleep y activity diarios.
- `heartrate`: frecuencia cardiaca por serie temporal.
- `workout`: entrenamientos.
- `session`: sesiones guiadas/no guiadas.
- `spo2`: SpO2 diario.
- `personal`: solo si se decide usar edad/genero/altura/peso en modelos de analisis; si no, evitarlo.

Restricciones oficiales a considerar:

- Gen3 y Oura Ring 4 requieren membresia activa para acceso API.
- Las aplicaciones OAuth nuevas tienen limite inicial de usuarios antes de aprobacion de Oura.
- La API usa `Authorization: Bearer <token>`.
- Los refresh tokens son rotativos/single-use; cada refresh debe reemplazar el token guardado.
- Webhooks requieren endpoint HTTPS publico, verificacion de challenge y validacion de firma HMAC.

## Rutas backend implementadas

- `GET /api/integration/oura/manifest`: describe endpoints Oura, scopes, tipos de datos, metricas y modo recomendado de sincronizacion.
- `GET /api/integration/oura/status`: muestra si OAuth esta configurado, si el usuario esta conectado y que variables faltan.
- `GET /api/integration/oura/connect`: inicia OAuth Oura con scopes calculados desde el manifiesto.
- `GET /api/integration/oura/callback`: recibe el codigo OAuth y guarda tokens cifrados en backend.
- `POST /api/integration/oura/sync`: descarga los tipos Oura definidos, normaliza señales y las ingesta como contexto biometrico transversal.
- `POST /api/integration/oura/webhook`: recibe eventos Oura y registra que hay datos nuevos; la sincronizacion segura ocurre por `sync` o la rutina programada.
- `POST /api/integration/oura/normalize`: normaliza documentos Oura ya recibidos o muestras offline.

Variables requeridas para lectura completa:

- `OURA_CLIENT_ID`
- `OURA_CLIENT_SECRET`
- `OURA_REDIRECT_URI`
- `OURA_TOKEN_ENCRYPTION_SECRET`
- `OURA_SCOPES` opcional: lista separada por espacios o comas para controlar permisos OAuth sin cambiar codigo. Si no se define, Vibe usa los scopes del manifiesto.
- `OURA_AUTHORIZE_REDIRECT_MODE` opcional: `explicit` por defecto. Vibe envia `redirect_uri` en la autorizacion y vuelve a enviarla igual durante el intercambio de token. Usar `registered` solo como diagnostico si Oura cambia el comportamiento de la app registrada.
- `OURA_TOKEN_AUTH_MODE` opcional: `body` por defecto. Vibe envia `client_id` y `client_secret` en el cuerpo `application/x-www-form-urlencoded`, que es el camino principal de Oura para el intercambio server-side.
- `OURA_TOKEN_EXCHANGE_FALLBACK` opcional: apagado por defecto. No conviene probar multiples variantes con el mismo `code`, porque el codigo OAuth puede quedar consumido. Activarlo solo para diagnostico controlado.
- `OURA_AUTHORIZE_SCOPE_MODE` opcional: `core` por defecto. Solicita `daily`, `heartrate` y `workout` en el primer enlace. Usar `full` o `OURA_SCOPES` cuando Oura apruebe permisos adicionales como `spo2`.

Si faltan, `/api/integration/oura/status`, `/connect` y `/sync` deben decir exactamente que variable falta. No debe haber falla silenciosa.

`OURA_REDIRECT_URI` debe quedar exactamente como la URL configurada en Oura. Para Railway actual:

`https://experience-hub-web-production.up.railway.app/api/integration/oura/callback`

Si Oura responde `400 invalid_request`, revisar primero `/api/integration/oura/status`: el bloque `oauthDiagnostics` muestra redirect URI, modo de redirect, scopes de autorizacion, origen de scopes y sufijo del client id sin exponer secretos. El servidor limpia espacios accidentales en variables de Railway antes de generar la URL OAuth.

## Mapeo principal

| Oura data type | Endpoint Oura | Vibe payload | Uso en Vibe |
|---|---|---|---|
| `daily_readiness` | `/v2/usercollection/daily_readiness` | `biometric` | energia, recuperacion, temperatura |
| `daily_sleep` | `/v2/usercollection/daily_sleep` | `sleep` | sueño diario, descanso, recuperacion |
| `sleep` | `/v2/usercollection/sleep` | `sleep` | etapas de sueño, HRV y frecuencia durante el periodo |
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
- La sincronizacion productiva requiere credenciales OAuth y secreto de cifrado en backend.
- El scope de SpO2 debe ser `spo2`.
- PAT queda como fallback de laboratorio si Oura lo permite en una cuenta concreta; no debe aparecer como instruccion principal al usuario final.

## Pendiente real

1. Definir en Railway/backend `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_REDIRECT_URI` y `OURA_TOKEN_ENCRYPTION_SECRET`.
2. Probar OAuth con la cuenta Oura Ring 4 de Miguel y membresia activa.
3. Ejecutar `POST /api/integration/oura/sync` con rango corto y validar que Panel, Reportes y Hallazgos lean el contexto creado.
4. Activar la rutina `Oura Sync` solo despues de la primera prueba real.
5. Configurar webhook Oura con `OURA_WEBHOOK_SECRET` si el proyecto Oura lo habilita.
6. Mostrar estado simple al usuario: Conectado, Sincronizado, Sin lecturas nuevas, Requiere reconectar o Membresia/API no disponible.

## Solucion final de producto

El flujo final para un usuario normal no debe pedir tokens ni archivos:

1. El usuario abre Cuenta o Activos y pulsa `Conectar Oura`.
2. Vibe redirige a Oura OAuth y solicita consentimiento para las lecturas necesarias.
3. El backend recibe el `callback`, cifra tokens y nunca los expone al navegador.
4. `POST /api/integration/oura/sync` consulta Oura por rango, sigue `next_token` por paginas y limita `maxPages` para evitar loops o consumo excesivo.
5. Cada documento Oura se transforma a `vibe-signal-contract-v2`.
6. `POST /api/integration/ingest` actualiza contexto biometrico transversal.
7. Panel, Captura, Activos, Reportes y Hallazgos se refrescan por `sync/state`.
8. La rutina `Oura Sync` puede quedar activa cada dia cuando OAuth ya este probado.
9. El webhook `POST /api/integration/oura/webhook` registra eventos del proveedor; no interpreta datos sensibles directamente, sino que dispara o informa que debe correrse una sincronizacion segura.

Estados visibles recomendados:

- `Oura conectado`: la cuenta esta vinculada.
- `Sincronizado`: hay lecturas nuevas o confirmacion de rango revisado.
- `Sin lecturas nuevas`: el endpoint respondio bien, pero no hubo datos en ese periodo.
- `Requiere reconectar`: token expirado, revocado o sin refresh valido.
- `Permiso insuficiente`: falta un scope como `daily`, `heartrate`, `workout` o `spo2`.
- `Servicio limitado`: rate limit 429 o error temporal de Oura.

## Validacion personal con token

Fecha: 2026-06-06.

Se valido una descarga manual real de Oura Ring 4 sin guardar ni exponer el token personal. La prueba `npm run verify:oura:personal-json` lee archivos JSON descargados en `C:\Users\msusf\Downloads`, normaliza los documentos disponibles con `POST /api/integration/oura/normalize` y luego los ingesta con `POST /api/integration/ingest`.

Resultado actual:

- `daily_activity`: 1 registro real recibido, normalizado e ingerido como contexto transversal.
- Paneles afectados por la ingesta: Panel, Captura, Activos, Reportes y Hallazgos.
- Accion automatica confirmada: `biometric_impact_recomputed`.
- `daily_sleep`: archivo valido, sin registros porque no hubo lecturas en el rango descargado.
- `daily_readiness`: archivo valido, sin registros porque no hubo lecturas en el rango descargado.
- Pendientes para cobertura completa cuando existan lecturas: `sleep`, `heartrate`, `daily_spo2`, `daily_stress`, `daily_resilience` y `workout`.

Evidencia local: `data/oura-personal-json-validation.json`.

Conclusion: el camino tecnico funciona con datos reales. Los endpoints vacios no son falla si Oura no tuvo lecturas en el rango; simplemente no aportan contexto ese dia. Para cerrar producto se requiere probar tambien dias o rangos donde existan sueño, recuperacion, frecuencia cardiaca, oxigenacion, estres, resiliencia y entrenamientos.

## Apple Health / HealthKit

Decision: Apple Health no ofrece una REST API directa para que la PWA o el backend consulten datos de salud. La ruta correcta para Vibe es una app nativa iOS que use HealthKit con consentimiento granular del usuario y envie datos normalizados al backend.

Rutas backend:

- `GET /api/integration/apple-health/manifest`
- `POST /api/integration/apple-health/normalize`

Tipos priorizados: pasos, energia activa, distancia, frecuencia cardiaca, frecuencia cardiaca en reposo, HRV, oxigeno, respiracion, temperatura, sueño y workouts.

Ruta no recomendada como base: CloudKit para HealthKit. Puede servir en casos puntuales, pero no debe ser el flujo principal por privacidad, permisos, cobertura incompleta y fragilidad operacional.

## Samsung / Android Health Connect

Decision: para Samsung Health y Galaxy Watch se debe priorizar Health Connect. Android Health Platform API v1 esta deprecada y fue reemplazada por Health Connect.

Estado actual: bloqueado por falta de dispositivo Android/Samsung. Existe contrato, permisos y normalizador, pero no se declara listo comercialmente hasta probar con hardware real o equivalente validado.

Rutas backend:

- `GET /api/integration/health-connect/manifest`
- `POST /api/integration/health-connect/normalize`

Tipos priorizados: StepsRecord, ActiveCaloriesBurnedRecord, DistanceRecord, HeartRateRecord, RestingHeartRateRecord, HeartRateVariabilityRmssdRecord, OxygenSaturationRecord, RespiratoryRateRecord, BodyTemperatureRecord, SleepSessionRecord y ExerciseSessionRecord.

## Meta Wearables

Decision: Meta Wearables no debe tratarse como REST cloud general para Vibe. La ruta de producto es visual: importar fotos/videos desde Meta AI, Fotos o Galeria del telefono, o usar Vibeapp como puente de camara cuando el SDK sea estable para captura visual. No se promete voz por gafas: el microfono, el wake y la conversacion de V quedan en telefono o tablet.

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

Esta prueba ejecuta muestras normalizadas de Oura, Apple Health, Health Connect/Samsung y Meta Wearables. Debe devolver `ok=true`, muestras correctas y destinos esperados: contexto para salud/biometria y activos para multimedia Meta. Es la compuerta previa a conectar OAuth, HealthKit, Health Connect o SDKs reales.
