# Arquitectura V2: evidencia Vibeapp, servidor y VibePWA

> **Documento histórico, no vigente.** La ruta descrita aquí permanece
> congelada. La arquitectura canónica está en
> `docs/plan-maestro-reestructuracion-ecosistema-vibe-20260726.md` y
> `docs/vibe-operating-contract-20260727.md`.

Fecha: 2026-07-26  
Estado: diseño canónico previo a implementación  
Alcance: multimedia intencional, experiencias, eventos, reintentos y lectura
coherente en VibePWA.

## 1. Objetivo

Construir una ruta V2 paralela que resuelva el flujo completo sin modificar la
ruta V1 mientras se valida:

1. Vibeapp captura un archivo.
2. El servidor guarda el binario y registra una evidencia consultable.
3. La evidencia puede permanecer suelta o esperar una experiencia que todavía
   no existe.
4. La experiencia y sus eventos se crean antes de vincular los activos.
5. La asociación se confirma de forma idempotente.
6. Bandeja, Activos y Biblioteca leen el mismo estado.

La V2 no reemplaza la V1 por edición directa. Se construye, prueba y observa en
paralelo. El cambio de tráfico será explícito y reversible.

## 2. Decisiones no negociables

### 2.1 Una sola fuente de verdad

- `assets` contiene cada evidencia intencional una sola vez.
- El bucket V2 contiene cada binario una sola vez por `asset_id`.
- `experiences` contiene la historia.
- `experience_events` contiene sus submomentos.
- Una bitácora V2 controla la operación, pero no duplica el activo ni su
  contenido.

### 2.2 Un solo escritor

Solo `EvidencePersistenceServiceV2` puede:

- registrar una fila en `assets`;
- cambiar `experience_id` o `event_id`;
- cambiar `adoption_status`;
- reconciliar una evidencia pendiente.

Rutas HTTP, tareas de reparación, administración y guardado de experiencias
llaman al mismo servicio. Quedan prohibidos los `POST` y `PATCH` directos a
`assets` fuera de su repositorio.

### 2.3 Archivo primero es un caso normal

La ausencia temporal de una experiencia no es un error:

- el binario se guarda;
- el activo se registra como `inbox`;
- el padre solicitado queda en la bitácora como `requested_experience_id`;
- no se escribe una clave foránea inexistente;
- el endpoint de media responde éxito durable;
- cuando llega la experiencia, la asociación se completa.

### 2.4 Éxito verificable

El servidor no deduce el éxito a partir de que una llamada no lanzó error.
Después de cada operación crítica verifica el estado persistido:

- el objeto existe en Storage;
- la fila existe en `assets`;
- el activo tiene el padre esperado cuando la asociación debía completarse.

### 2.5 Reintento sin duplicación

Todos los reintentos usan:

- `asset_id` estable;
- `experience_id` estable;
- `event_id` estable;
- `idempotency_key` estable;
- ruta de Storage derivada de `user_id + asset_id`.

Repetir una petición produce el mismo resultado, no un segundo archivo ni una
segunda experiencia.

La misma clave idempotente con un checksum diferente produce `409 conflict`.
Nunca sobrescribe silenciosamente el archivo anterior.

### 2.6 Lecturas sin efectos secundarios

`GET` de Bandeja, Activos y Biblioteca solo consulta. La reparación y la
reconciliación se ejecutan mediante operaciones V2 explícitas y observables.

### 2.7 Una sola representación de adjuntos

La tabla `assets` es la fuente de verdad de los adjuntos. El arreglo JSON
`experiences.attachments` se considera compatibilidad V1 durante la migración y
se retira después del cambio definitivo. V2 no intenta mantener dos copias.

## 3. Componentes

```text
Vibeapp
  |
  | POST /api/v2/evidence
  | POST /api/v2/experiences
  v
API V2
  |
  v
EvidencePersistenceServiceV2
  |-- StorageRepository
  |-- AssetRepository
  |-- ExperienceRepository
  |-- EvidenceOperationRepository
  |
  v
Supabase Storage + PostgreSQL
  |
  v
VibePWA
  |-- Bandeja: assets.inbox
  |-- Biblioteca: experiences + assets.adopted
  |-- Activos: inventario completo
```

Las señales de contexto no entran en este servicio:

- biometría, ubicación, clima y noticias -> `context_signals`;
- agenda -> `agenda_events`;
- narrativa escrita o transcrita -> experiencia o evento según intención;
- foto, audio, video y documento -> evidencia intencional V2.

## 4. Modelo de datos

### 4.1 Tablas canónicas existentes

`assets` conserva:

- `asset_id`;
- `workspace_id`, `owner_user_id`, `participant_id`;
- `experience_id`, `event_id`;
- datos de archivo y Storage;
- `evidence_type`;
- `adoption_status`;
- procedencia, captura, análisis y metadatos.

`experience_id` y `event_id` representan el vínculo confirmado, nunca un padre
futuro.

### 4.2 Bitácora nueva, no una segunda fuente de verdad

Tabla aditiva propuesta: `evidence_operations`.

| Campo | Uso |
| --- | --- |
| `operation_id` | Identificador interno. |
| `idempotency_key` | Único por operación lógica del cliente. |
| `asset_id` | Activo afectado. |
| `owner_user_id`, `workspace_id` | Aislamiento y seguridad. |
| `requested_experience_id` | Padre deseado, exista o no. |
| `requested_event_id` | Evento deseado, exista o no. |
| `state` | Estado de la máquina V2. |
| `attempt_count` | Número de intentos. |
| `last_error_code`, `last_error_detail` | Diagnóstico operativo. |
| `created_at`, `updated_at`, `completed_at` | Trazabilidad. |

Restricciones:

- `UNIQUE (owner_user_id, idempotency_key)`;
- índice por `(workspace_id, state, updated_at)`;
- RLS por usuario/miembro;
- no almacena el binario ni reemplaza `assets`.

## 5. Máquina de estados

```text
RECEIVED
   |
   v
STORING_BINARY ------> FAILED_RETRYABLE
   |
   v
BINARY_STORED
   |
   v
REGISTERING_ASSET ---> FAILED_RETRYABLE
   |
   v
ASSET_REGISTERED
   |                    \
   | sin padre           \ padre solicitado, aún no existe
   v                      v
INBOX_COMPLETE       LINK_PENDING
                          |
                          | llega experiencia/evento
                          v
                      LINKING
                          |
                          v
                      LINKED_COMPLETE
```

Estados terminales de éxito:

- `INBOX_COMPLETE`: evidencia suelta y visible en Bandeja.
- `LINKED_COMPLETE`: evidencia adoptada y visible en la historia.

`FAILED_TERMINAL` solo se usa para datos inválidos que no mejorarán al
reintentar. Los fallos de red, Storage o base de datos son recuperables.

## 6. Secuencias

### 6.1 Evidencia suelta

1. Vibeapp envía archivo e identificadores estables.
2. V2 crea o recupera la operación por `idempotency_key`.
3. Guarda el binario con `upsert`.
4. Verifica el objeto.
5. Registra `assets` sin padre y con `adoption_status = inbox`.
6. Verifica la fila.
7. Marca `INBOX_COMPLETE`.
8. Responde `201` con estado simple y el activo.

### 6.2 Archivo enviado antes de su experiencia

1. Vibeapp envía el archivo con `requestedExperienceId`.
2. V2 no intenta escribir ese valor en `assets.experience_id`.
3. Guarda el activo como `inbox`.
4. Registra `LINK_PENDING` en la bitácora.
5. Responde `201`; Vibeapp continúa con la experiencia.
6. Vibeapp envía la experiencia y sus eventos.
7. El servidor guarda primero experiencia y eventos.
8. V2 busca los activos por ids explícitos del payload.
9. Vincula y verifica cada uno.
10. Solo responde experiencia completa cuando todos están `LINKED_COMPLETE`.

### 6.3 Reintento después de fallo parcial

- Si Storage falló: se repite la subida.
- Si Storage terminó pero `assets` falló: no se vuelve a crear otra ruta; se
  verifica el objeto existente y se reintenta la fila.
- Si la experiencia existe pero el vínculo falló: se reintenta únicamente la
  asociación.
- Si el cliente repite todo: ids e idempotencia convierten la repetición en
  lectura/continuación de la misma operación.

### 6.4 Captura sin señal y sincronización diferida

1. Vibeapp guarda localmente el contenido y su sobre operativo: `assetId`,
   `idempotencyKey`, `capturedAt`, tipo, persona/grupo y padre solicitado.
2. Cerrar o reiniciar la app no elimina la cola.
3. Al recuperar conexión, Vibeapp conserva `capturedAt`; la hora de subida se
   registra aparte.
4. Si la evidencia llega primero, queda en `inbox` o `link_pending`.
5. Si la experiencia llegó primero, la evidencia tardía detecta el padre y usa
   el mismo servicio V2 para vincularse.
6. Si falta un evento específico, el archivo permanece guardado y pendiente;
   no se transforma una carga válida en un error 502.
7. Repetir la sincronización con la misma clave y contenido continúa la misma
   operación. La misma clave con contenido distinto se rechaza como conflicto.

La cola local es responsabilidad de Vibeapp. La bitácora durable y la
reconciliación son responsabilidad del servidor. Ninguna de las dos reemplaza a
la otra.

## 7. Contrato de API V2

### 7.1 `POST /api/v2/evidence`

Entrada multipart para archivos o JSON para texto humano:

- archivo;
- `assetId`;
- `idempotencyKey`;
- tipo, nombre, fecha, dispositivo y participante;
- `requestedExperienceId` y `requestedEventId` opcionales.

Una nota escrita usa `application/json` con `assetId`, `idempotencyKey`,
`capturedAt` y `text`. El servidor la conserva como evidencia intencional
`text/plain`; no la confunde con clima, biometría u otra señal de contexto.

Respuesta durable:

```json
{
  "ok": true,
  "assetId": "asset-123",
  "storageStatus": "stored",
  "evidenceStatus": "registered",
  "linkStatus": "inbox",
  "retryRequired": false
}
```

Si hay padre futuro, `linkStatus` es `pending_parent`; sigue siendo una carga
correcta. Un error de clave foránea por padre inexistente no debe ocurrir.

### 7.2 `POST /api/v2/experiences`

Entrada:

- experiencia;
- eventos;
- lista explícita de `assetIds`;
- relación opcional `assetId -> eventId`.

Respuesta de éxito solo tras verificación:

```json
{
  "ok": true,
  "experienceId": "exp-123",
  "experienceStatus": "stored",
  "eventsStatus": "stored",
  "evidence": {
    "expected": 2,
    "linked": 2,
    "pending": 0
  }
}
```

Para la build actual de Vibeapp, si el vínculo no termina se devuelve un error
recuperable y la cola conserva la operación. La experiencia ya creada se
actualiza idempotentemente en el próximo intento.

### 7.3 `GET /api/v2/operations/:id`

Devuelve el estado real de una operación para operación, diagnóstico y soporte.
No expone lenguaje técnico en la UI final.

No requiere sondeo permanente. Vibeapp conserva `operationId` y consulta esta
ruta únicamente para recuperar una respuesta perdida, revisar un reintento o
diagnosticar una operación que no alcanzó estado terminal.

## 8. Estados visibles para el usuario

La UI usa cuatro mensajes, derivados del servidor:

- `Enviando archivo`.
- `Archivo guardado; esperando historia`.
- `Vinculando con la historia`.
- `Listo`.

Un error recuperable muestra:

- `No se pudo completar; se reintentará automáticamente`.

Los códigos, tablas, claves foráneas y JSON quedan en Operación, no en las
pantallas normales.

El procesamiento OCR, visión, transcripción y análisis usa otra máquina de
estados. Nunca se mezcla con el estado de persistencia o asociación.

## 9. Estrategia paralela

Bandera única:

`EVIDENCE_PIPELINE_MODE=off|simulate|shadow|canary|on`

### `off`

V1 funciona sin cambios.

### `simulate`

V2 recibe fixtures y adaptadores controlados. No toca datos de producción.

### `shadow`

V1 atiende la petición real. V2 evalúa una copia saneada del contrato y produce
un resultado comparativo, pero no escribe Storage ni tablas canónicas.

### `canary`

Solo usuarios autorizados usan V2, con bucket y bitácora V2 separados. V1
permanece disponible para reversión inmediata.

### `on`

V2 atiende todo el tráfico. V1 permanece en código durante una ventana corta de
observación, sin recibir tráfico.

La V1 se elimina únicamente después de:

- pruebas automatizadas completas;
- prueba real en iPhone;
- lectura coherente en las tres vistas de VibePWA;
- revisión de logs sin estados atascados ni duplicados;
- confirmación del orquestador.

## 10. Pruebas obligatorias antes del canario

Matriz por tipo:

- foto;
- audio;
- video;
- documento.

Para cada tipo:

1. suelto;
2. con experiencia futura;
3. con experiencia existente;
4. asociado a evento;
5. reintento idéntico;
6. dos dispositivos intentando el mismo id;
7. misma clave idempotente con checksum distinto;
8. fallo de Storage;
9. fallo de fila `assets`;
10. fallo de vínculo;
11. respuesta perdida después de persistir;
12. actualización de eventos sin perder `assets.event_id`;
13. archivo grande sin cargarlo completo en memoria cuando la ruta reanudable
    esté habilitada.

Pruebas de no regresión:

- texto/voz narrativa;
- experiencia sin archivos;
- ubicación;
- biometría;
- agenda;
- clima/noticias;
- grupos/personas;
- lectura en Bandeja, Activos y Biblioteca.

Invariantes verificadas por consulta:

- un `asset_id` -> una fila;
- un `asset_id` -> una ruta de Storage;
- un activo `adopted` tiene padre existente;
- un activo `inbox` no aparenta estar vinculado;
- todos los adjuntos declarados por una experiencia aparecen vinculados;
- ningún contexto crea una experiencia falsa.
- ninguna lectura cambia datos;
- ninguna actualización de eventos libera activos por accidente.

## 11. Migración y reversión

1. Crear la bitácora, funciones transaccionales y bucket V2 mediante migración
   aditiva.
2. Implementar V2 en módulos nuevos; no modificar los handlers V1.
3. Ejecutar `simulate`.
4. Ejecutar `shadow` y comparar resultados.
5. Activar `canary` solo para Miguel.
6. Validar iPhone y VibePWA.
7. Activar `on`.
8. Observar y reconciliar pendientes.
9. Retirar escritores V1 y código muerto en un release separado.

Reversión:

- cambiar la bandera a `off`;
- V1 no depende de la tabla nueva;
- la bitácora V2 es aditiva;
- no se revierten ni borran activos válidos.

## 12. Funciones transaccionales de base de datos

La saga de Storage no puede ser una transacción PostgreSQL, pero sus tramos de
base de datos sí:

- `commit_evidence_v2`: registra/actualiza activo y operación juntos;
- `commit_experience_v2`: guarda experiencia, hace upsert de eventos sin
  borrarlos primero y vincula la lista de activos en una transacción;
- `retry_evidence_operation_v2`: reserva una operación pendiente para un único
  trabajador.

La actualización de eventos es por `event_id`; no hace `DELETE` general antes
del `INSERT`, porque `assets.event_id ON DELETE SET NULL` perdería vínculos.

## 13. Hallazgos que V2 elimina

La auditoría del código V1 confirmó:

- Storage usa credenciales del servidor y tablas usan sesión del usuario; una
  parte puede aceptar y la otra rechazar;
- el encabezado `Idempotency-Key` no gobierna hoy una operación persistida;
- `GET /api/assets` y `GET /api/experiences` ejecutan reparaciones ocultas;
- eventos se borran y recrean;
- `experiences.attachments` y `assets` pueden divergir;
- `syncExperienceAssetsToSupabase` oculta errores que el endpoint ignora.

Estos comportamientos no se trasladan a V2.

## 14. Condición de aprobación del diseño

La implementación puede comenzar solo si:

- no existe ambigüedad sobre el dueño de cada escritura;
- el padre futuro se trata como estado normal;
- el servicio tiene una sola ruta por operación;
- las respuestas representan datos verificados;
- la reversión no requiere restaurar la base;
- las pruebas reproducen el orden real de Vibeapp.
