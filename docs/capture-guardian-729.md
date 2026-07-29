# Capture Guardian 729

## Objetivo

Capture Guardian valida automaticamente la ruta unica de comunicacion:

`Vibeapp -> /api/captures -> orquestador -> Supabase Storage/PostgREST -> recibo durable`

Una captura no se considera terminada por haber llegado al servidor. Solo termina
cuando el archivo, si existe, queda verificado en Storage, el registro queda
verificado en `capture_records` y la operacion termina en `complete`.

## Arquitectura consolidada

- Un endpoint: `/api/captures`.
- Un almacenamiento privado: el bucket configurado por
  `SUPABASE_STORAGE_BUCKET` (normalmente `experience-media`).
- Un espacio interno para capturas: `{usuario}/captures/{fecha}/{captureId}/`.
- Un identificador estable para reintentar sin duplicar.
- Una tabla de operaciones: `capture_operations`.
- Un catalogo de capturas: `capture_records`.
- Ninguna captura crea por si sola una experiencia, evento o historia.

Se elimina la bifurcacion entre `vibe-captures` y `experience-media`. La
separacion es por rutas, no por servicios distintos.

## Matriz obligatoria

El probador cubre:

| Grupo | Tipos |
| --- | --- |
| Evidencia JSON | texto |
| Evidencia binaria | imagen, audio, video, documento |
| Contexto JSON | biometria, ubicacion, clima, noticias, agenda, sensor |
| Contexto binario | exportacion biometrica |
| Resiliencia | duplicado, respuesta perdida, fallo temporal, reintento, captura diferida |
| Integridad | fecha original, usuario, workspace, participante, bytes, MIME, nombre |
| Seguridad conceptual | rechazo de campos de experiencia/evento/historia |
| Compatibilidad | la ruta anterior permanece disponible durante el canario |

## Tres barreras automaticas

1. **Pruebas locales:** la matriz usa dobles controlados de Supabase y falla por
   tipo y etapa.
2. **Verificacion de release:** la matriz forma parte de `npm run check` y
   bloquea el commit/despliegue cuando existe una regresion.
3. **Healthcheck de Railway:** cuando el canario esta activo, `/api/health`
   ejecuta una prueba real y reversible de escribir, leer y borrar un archivo.
   Railway recibe `503 degraded` si Storage no completa las tres operaciones.

## Errores observables

Los fallos de captura indican:

- etapa: validacion, ledger, storage o catalog;
- si admite reintento;
- `operationId` y `captureId`;
- estado durable alcanzado;
- causa concreta.

Los archivos grandes devuelven `413`; metadatos o multipart invalidos, `400`;
tipo HTTP no admitido, `415`; indisponibilidad temporal de Storage, `503` con
etapa `storage`.

## Cargas sin señal

Vibeapp conserva localmente la captura completa y reutiliza el mismo
`captureId`/`idempotencyKey` al recuperar conectividad. El servidor puede recibir
la captura horas despues porque conserva `occurredAt`, que representa el momento
real. Un reintento nunca crea una segunda copia.

## Regla de despliegue

No se solicita una prueba manual en iPhone hasta que:

1. `npm run verify:capture-guardian` termine verde;
2. `npm run check` termine verde;
3. Railway muestre `/api/health` verde con `storageRoundTrip.ok=true`.

La prueba final de Vibeapp es confirmatoria, no diagnostica.
