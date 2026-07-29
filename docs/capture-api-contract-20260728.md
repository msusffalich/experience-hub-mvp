# Contrato unico de capturas Vibe

Fecha: 2026-07-28
Version del contrato: `2026-07-28.1`
Version de servidor: `20260729-capture-guardian-729`
Estado: preparado para canario; apagado por defecto

## Proposito

Vibeapp captura hechos y contexto. VibePWA arma historias, experiencias y
eventos. La comunicacion movil usa una sola ruta:

```text
POST /api/captures
```

Cada solicitud representa una sola captura. Nunca crea una experiencia ni un
evento.

## Acceso

- Autenticacion: `Authorization: Bearer <Supabase access token>`.
- Modo por defecto: `CAPTURE_PIPELINE_MODE=off`.
- Canario: `CAPTURE_PIPELINE_MODE=canary`.
- Usuarios del canario:
  `CAPTURE_PIPELINE_CANARY_USERS=<user id o email, separados por coma>`.
- Produccion general: `CAPTURE_PIPELINE_MODE=on`, solo despues del cierre del
  canario.

`GET /api/captures/status` informa:

- `ready`: infraestructura completa;
- `enabledForUser`: acceso del usuario actual;
- `reason`: motivo claro si no esta listo;
- `contract`: contrato que debe usar Vibeapp;
- `compatibility`: observacion temporal de las rutas anteriores.

Vibeapp solo cambia de V1 a la ruta unica cuando `ready=true` y
`enabledForUser=true`.

## Campos comunes

| Campo | Regla |
|---|---|
| `captureId` | Identificador estable creado en el movil |
| `idempotencyKey` | Identificador estable de reintento; no cambia y debe coincidir en cabecera/cuerpo |
| `intent` | `evidence` o `context` |
| `kind` | Tipo permitido para la intencion |
| `occurredAt` | Obligatorio: momento original de captura, no momento de sincronizacion |
| `participantId` | Grupo/persona elegido; puede omitirse para usuario principal |
| `source` | App, dispositivo, plataforma y si nacio sin conexion |
| `metadata` | Datos estructurados propios del tipo |

El servidor asigna `ownerUserId` y `workspaceId` desde la sesion. Vibeapp no
puede suplantarlos.

Campos prohibidos:

- `experienceId`;
- `eventId`;
- `storyId`;
- `parentExperienceId`;
- `requestedExperienceId`;
- `requestedEventId`.

## Tipos

### Evidencia

| `kind` | Transporte | Contenido |
|---|---|---|
| `text` | JSON | Texto humano |
| `image` | Multipart | Archivo original |
| `audio` | Multipart | Archivo original |
| `video` | Multipart | Archivo original |
| `document` | Multipart | Archivo original |

### Contexto

| `kind` | Transporte normal | Contenido |
|---|---|---|
| `biometric` | JSON o multipart | Mediciones o exportacion completa |
| `location` | JSON | Coordenadas y precision |
| `weather` | JSON | Lectura ambiental |
| `news` | JSON | Fuentes y titulares vigentes |
| `agenda` | JSON | Evento de calendario como contexto |
| `sensor` | JSON o multipart | Lectura estructurada de otro sensor |

Una exportacion CSV, JSON o ZIP de salud usa `intent=context` y
`kind=biometric`. No se envia como documento narrativo.

## Texto o contexto JSON

```json
{
  "captureId": "note-20260728-001",
  "idempotencyKey": "note-20260728-001",
  "intent": "evidence",
  "kind": "text",
  "occurredAt": "2026-07-28T18:15:00-04:00",
  "participantId": "principal",
  "text": "Conversamos sobre el proyecto y acordamos el siguiente paso.",
  "metadata": {},
  "source": {
    "app": "vibeapp",
    "device": "iphone-14-pro",
    "platform": "ios",
    "capturedOffline": false
  }
}
```

Ejemplo de ubicacion:

```json
{
  "captureId": "location-20260728-001",
  "idempotencyKey": "location-20260728-001",
  "intent": "context",
  "kind": "location",
  "occurredAt": "2026-07-28T18:15:00-04:00",
  "metadata": {
    "latitude": 28.5653,
    "longitude": -81.5862,
    "accuracyMeters": 12
  },
  "source": {
    "app": "vibeapp",
    "device": "iphone-14-pro",
    "platform": "ios",
    "capturedOffline": false
  }
}
```

## Archivo multipart

Campos:

- `file`: archivo binario completo;
- `metadata`: JSON UTF-8 con los campos comunes.

Ejemplo de `metadata`:

```json
{
  "captureId": "photo-20260728-001",
  "idempotencyKey": "photo-20260728-001",
  "intent": "evidence",
  "kind": "image",
  "occurredAt": "2026-07-28T18:15:00-04:00",
  "participantId": "principal",
  "filename": "IMG_1001.HEIC",
  "mimeType": "image/heic",
  "source": {
    "app": "vibeapp",
    "device": "iphone-14-pro",
    "platform": "ios",
    "capturedOffline": true
  }
}
```

El limite publicado por el servidor corresponde a la solicitud multipart
completa. Vibeapp debe conservar el original local hasta recibir confirmacion
durable.

## Recibo

Exito:

```json
{
  "ok": true,
  "accepted": true,
  "durable": true,
  "duplicate": false,
  "operationId": "photo-20260728-001",
  "captureId": "photo-20260728-001",
  "intent": "evidence",
  "kind": "image",
  "state": "complete",
  "retryable": false,
  "needsAttention": false,
  "storagePath": "usuario/captures/2026-07-28/photo-20260728-001/IMG_1001.HEIC",
  "recordedAt": "2026-07-28T22:15:05.000Z",
  "lastError": null
}
```

Vibeapp muestra "Guardado" solo si:

- `ok=true`;
- `durable=true`;
- `state=complete`;
- coinciden `captureId` y `operationId`.

Para consultar una operacion incierta:

```text
GET /api/captures/operations/{operationId}
```

## Sin conexion, respuesta perdida y reintento

1. Vibeapp guarda primero el original y el mensaje en su outbox local.
2. `captureId`, `idempotencyKey` y `occurredAt` se persisten antes del primer
   intento.
3. Sin senal, el elemento permanece pendiente; no cambia de identificador.
4. Al recuperar red, reenvia exactamente la misma captura.
5. Si la respuesta se pierde, consulta primero el recibo por `operationId`.
6. Si el recibo esta `complete`, no reenvia.
7. Si esta `retry_pending`, reintenta con la misma clave.
8. Si esta `needs_attention`, conserva el original y muestra revision; nunca lo
   elimina automaticamente.
9. Solo despues de `durable=true` puede liberar la copia temporal, segun la
   politica local del usuario.

## Errores esperados

| HTTP | Codigo | Accion |
|---|---|---|
| 400 | `capture_*_required` o `capture_*_invalid` | Corregir el mensaje; no reintentar igual |
| 403 | `capture_pipeline_canary_only` | Mantener V1 |
| 409 | `capture_idempotency_conflict` o `capture_content_conflict` | Conservar original y pedir revision |
| 503 | `capture_pipeline_disabled` | Mantener V1 |
| 503 | `capture_pipeline_requires_supabase` | No enviar; infraestructura incompleta |
| 503 | fallo temporal con `retryable=true` | Reintentar con la misma clave |

## Matriz de aceptacion del canario

Se prueba una captura nueva de cada tipo:

1. texto;
2. imagen;
3. audio;
4. video;
5. documento;
6. biometria;
7. ubicacion;
8. clima;
9. noticias;
10. agenda;
11. sensor disponible.

Para imagen, audio, video y documento se repite:

- conectado;
- capturado sin senal y sincronizado despues;
- respuesta perdida;
- reinicio de Vibeapp antes del reintento;
- reintento duplicado.

Criterio:

- una captura local;
- una operacion remota;
- un registro remoto;
- un original remoto cuando aplica;
- un recibo durable;
- cero experiencias o eventos creados por Vibeapp;
- la evidencia aparece una sola vez en VibePWA.

## Fuente movil requerida

La build instalada declarada por Claude Mac es `Vibeapp 0.5.34+663`. La copia de
Vibeapp presente en Windows es `0.4.7+568` y no puede usarse para implementar el
corte. Claude Mac debe aplicar este contrato sobre la fuente exacta de la build
vigente y devolver version, commit/paquete y matriz de pruebas.
