# Contrato de captura Vibeapp -> Backend 2

Estado: contrato normativo

Base URL: `/api/v2`

Principio: Vibeapp captura evidencia y contexto; VibePWA arma historias.

## 1. Alcance

Este contrato cubre:

- texto;
- imagen;
- audio;
- video;
- documento;
- biometría y sensores;
- ubicación;
- clima;
- noticias;
- agenda.

Vibeapp no necesita crear una historia para sincronizar. Tampoco envía
`experienceId`, `storyId` o `eventId` dentro de una captura. La estructuración
ocurre después en VibePWA 2.

## 2. Campos comunes

Toda captura incluye:

| Campo | Regla |
| --- | --- |
| `captureId` | Identidad estable creada en el dispositivo |
| `idempotencyKey` | Estable durante todos los reintentos |
| `intent` | `evidence` o `context` |
| `kind` | Tipo admitido por el contrato |
| `occurredAt` | Fecha y hora reales del hecho en ISO 8601 |
| `participantId` | Grupo/persona cuando aplique |
| `source.app` | Aplicación de origen |
| `source.device` | Dispositivo o conector |
| `source.platform` | iOS, iPadOS, Android u otro |
| `source.capturedOffline` | `true` cuando nació sin conexión |
| `metadata` | Objeto con datos propios del tipo |

El servidor obtiene propietario y espacio desde la sesión.

## 3. Clasificación

| Tipo | `intent` | `kind` |
| --- | --- | --- |
| Texto o voz transcrita | `evidence` | `text` |
| Foto | `evidence` | `image` |
| Audio | `evidence` | `audio` |
| Video | `evidence` | `video` |
| Documento | `evidence` | `document` |
| Biometría | `context` | `biometric` |
| Sensor | `context` | `sensor` |
| Ubicación | `context` | `location` |
| Clima | `context` | `weather` |
| Noticias | `context` | `news` |
| Agenda | `context` | `agenda` |

Una narración humana capturada como texto sigue siendo evidencia hasta que
VibePWA la adopta como narrativa de una historia o evento.

## 4. Autenticación

Todas las rutas de captura usan:

```http
Authorization: Bearer <supabase_access_token>
```

Una sesión inválida se rechaza. Vibeapp puede intentar una renovación y repetir
la solicitud una sola vez. Una falla temporal no borra el token de renovación
ni la cola local.

## 5. Captura liviana

Ruta:

```http
POST /api/v2/captures
Content-Type: application/json
```

Ejemplo:

```json
{
  "captureId": "cap_01J...",
  "idempotencyKey": "capture:cap_01J...",
  "intent": "evidence",
  "kind": "text",
  "occurredAt": "2026-07-30T14:32:10-04:00",
  "participantId": "group_123",
  "text": "Conversé con Ana y salí con una idea clara.",
  "metadata": {},
  "source": {
    "app": "vibeapp",
    "device": "iPhone 14 Pro",
    "platform": "ios",
    "capturedOffline": false
  }
}
```

Biometría, ubicación, clima, noticias y agenda usan la misma ruta con
`intent=context` y metadatos específicos.

## 6. Captura binaria

### 6.1 Preparar

Antes de enviar, Vibeapp calcula:

- SHA-256;
- nombre;
- MIME;
- tamaño.

### 6.2 Autorizar

```http
POST /api/v2/captures/uploads
```

El cuerpo incluye los campos comunes y:

```json
{
  "filename": "IMG_1234.HEIC",
  "mimeType": "image/heic",
  "sizeBytes": 1842201,
  "checksum": "<sha256>"
}
```

La respuesta entrega una autorización para una ruta privada estable. Una
autorización no significa que el archivo esté guardado.

### 6.3 Transferir

- Archivos pequeños y red estable: URL firmada.
- Archivos grandes o red inestable: TUS reanudable.
- Vibeapp conserva el archivo hasta completar el commit.

### 6.4 Confirmar

```http
POST /api/v2/captures/commit
```

Backend 2 comprueba Storage y catálogo. Solo entonces devuelve `complete`.

## 7. Recibo durable

Éxito:

```json
{
  "ok": true,
  "accepted": true,
  "durable": true,
  "visible": true,
  "state": "complete",
  "operationId": "...",
  "captureId": "...",
  "duplicate": false
}
```

Reglas:

- `authorized: true` solo autoriza la transferencia.
- `durable: true` solo aparece cuando archivo y catálogo existen.
- `duplicate: true` significa que el mismo envío ya había terminado.
- Un timeout no equivale a fracaso ni a éxito.

Consulta de recibo:

```http
GET /api/v2/captures/operations/{operationId}
```

## 8. Idempotencia

- Mismo contenido + mismas identidades: devuelve el mismo resultado.
- Misma clave + contenido distinto: conflicto visible.
- El cliente nunca crea nuevas identidades para “destrabar” un reintento.
- El checksum detecta sustituciones accidentales.

## 9. Cola offline

La cola persiste:

- archivo o texto;
- campos comunes;
- checksum;
- autorización TUS cuando exista;
- etapa alcanzada;
- intentos y último error.

Secuencia al reconectar:

1. renovar sesión si hace falta;
2. consultar recibo si hubo timeout;
3. autorizar o reanudar;
4. transferir;
5. confirmar;
6. retirar de la cola solo tras `complete`.

`occurredAt` no cambia. La fecha de sincronización se registra aparte.

## 10. Grupos y personas

Vibeapp obtiene los grupos/personas activos desde Backend 2. La selección se
aplica a todas las capturas siguientes hasta que el usuario la cambie. Si no
existe un grupo, usa el usuario principal sin bloquear la captura.

Vibeapp no crea permisos administrativos ni accede a datos de otros usuarios.

## 11. Salud y dispositivos

### HealthKit

Vibeapp solicita permisos por tipo. Envía únicamente las muestras autorizadas,
con fecha, unidad y fuente. No debe inferir un cero cuando HealthKit no devuelve
datos.

### Health Connect y Samsung

Health Connect es la ruta preferida en Android. Cada registro conserva origen y
dispositivo para distinguir teléfono, Galaxy Watch u otra fuente.

### Oura

La conexión OAuth y los tokens viven en Backend 2. Vibeapp puede solicitar
estado o sincronización, pero nunca almacena el secreto de la aplicación Oura.

### Meta Ray-Ban y Oakley

Fotos y videos importados mediante Meta AI o la galería se envían como archivos
normales. El origen se conserva en `source.device` o `metadata`. No se promete
un CSV multimedia inexistente.

## 12. Agenda, clima y noticias

- Agenda registra planificación y no crea historia.
- Clima y noticias se asocian al momento y lugar.
- Una falla de enriquecimiento externo no invalida una captura ya durable.
- Los trabajos posteriores deben exponer estado y error.

## 13. Mensajes para el usuario

Vibeapp muestra mensajes sencillos:

- Guardado.
- Enviando.
- Se enviará cuando vuelva la conexión.
- Reintentando.
- Requiere atención.

Los detalles técnicos pueden desplegarse en Estado, pero no sustituyen la
explicación principal. ES, EN, FR y PT deben tener cobertura equivalente.

## 14. Casos de aceptación

1. Texto en línea.
2. Foto pequeña.
3. Video grande con pausa y reanudación.
4. Documento.
5. Audio y transcripción.
6. Biometría sin sueño disponible.
7. Ubicación.
8. Clima y noticias.
9. Agenda que no crea historia.
10. Captura offline sincronizada horas después con la hora original.
11. Reintento después de timeout sin duplicado.
12. Cambio de grupo/persona.
13. Token vencido y renovación.
14. Archivo inválido conservado en `needs_attention`.

La prueba está completa cuando el archivo aparece en Storage, el catálogo en
Database, el recibo en `complete` y VibePWA lo muestra una sola vez.
