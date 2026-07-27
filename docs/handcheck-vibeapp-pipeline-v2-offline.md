# Handcheck Vibeapp: canal V2 de evidencia y trabajo sin señal

Fecha: 2026-07-26  
Emisor: Codex PC  
Receptor: Claude/Codex Mac  
Estado: especificación para implementar; no probar contra producción todavía

## Objetivo del intercambio

Adaptar Vibeapp al canal paralelo V2 sin retirar la ruta actual. La prueba
posterior debe demostrar que texto, foto, audio, video y documento sobreviven a
falta de señal, reinicio, reintento y llegada desordenada.

## Lo que no debe cambiar

- Autenticación y selección de grupo/persona.
- Captura nativa y permisos de iOS/iPadOS.
- Ubicación, biometría, clima, noticias y agenda siguen como contexto por
  `/api/integration/ingest`.
- La versión instalada no cambia a V2 mientras el servidor siga en `off`.

## Nueva configuración móvil

Agregar una bandera remota/local:

`evidencePipeline = v1 | v2`

Por defecto debe ser `v1`. Solo Miguel usa `v2` durante el canario.

## Sobre durable de cada captura intencional

Persistir localmente, antes de intentar red:

- `assetId` estable;
- `idempotencyKey` estable;
- `capturedAt` original;
- `participantId`;
- tipo, nombre y MIME;
- ruta local durable o bytes recuperables;
- `requestedExperienceId` opcional;
- `requestedEventId` opcional;
- estado local y número de intentos.

La hora de sincronización nunca reemplaza `capturedAt`.

## Rutas V2

### Archivo

`POST /api/v2/evidence` multipart.

Encabezado:

`Idempotency-Key: <clave estable>`

Campos de relación opcionales:

- `requestedExperienceId`;
- `requestedEventId`.

### Nota escrita

`POST /api/v2/evidence` con `application/json`:

```json
{
  "assetId": "text-123",
  "idempotencyKey": "vibeapp-text-123",
  "capturedAt": "2026-07-26T08:15:00-04:00",
  "participantId": "",
  "text": "Lo que viví y quiero recordar.",
  "requestedExperienceId": "",
  "requestedEventId": ""
}
```

### Historia

`POST /api/v2/experiences` después de reunir la experiencia, eventos y enlaces
explícitos de activos.

## Orden de sincronización

El cliente debe preferir:

1. evidencias intencionales;
2. experiencia y eventos;
3. verificación de operaciones.

El servidor también soporta el orden inverso. Si una historia ya existe cuando
llega un archivo tardío, intenta asociarlo automáticamente. Si todavía falta el
evento, conserva el archivo y espera la actualización de la historia.

## Estados simples en Vibeapp

| Estado servidor | Texto visible |
| --- | --- |
| enviando | Enviando |
| inbox_complete | Guardado; esperando historia |
| link_pending | Guardado; esperando asociación |
| linked_complete | Listo |
| failed_retryable | Se reintentará automáticamente |
| failed_terminal/conflict | Requiere revisión |

No mostrar JSON, 502, nombres de tablas ni claves foráneas.

## Prueba offline obligatoria

1. Activar modo avión.
2. Capturar una nota, foto, audio, video corto y documento.
3. Cerrar Vibeapp por completo.
4. Reabrirla aún sin señal: los cinco elementos siguen en cola.
5. Crear una historia local que use al menos foto y audio.
6. Esperar varias horas o cambiar la hora de prueba controlada.
7. Recuperar señal.
8. Confirmar que la cola se vacía sin duplicados.
9. Confirmar que el servidor conserva la hora de captura, no la de subida.
10. Confirmar en VibePWA:
    - sueltos en Bandeja;
    - adoptados en la historia;
    - contexto fuera de Bandeja;
    - una sola copia de cada activo.

## Respuesta esperada de Mac

Antes de entregar build:

- versión y commit;
- archivos modificados;
- resultado de pruebas locales de cola/reinicio;
- confirmación de que V1 sigue disponible;
- cualquier discrepancia exacta del contrato V2.
