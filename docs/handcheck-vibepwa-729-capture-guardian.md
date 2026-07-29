# Handcheck VibePWA 729 - Capture Guardian

Fecha: 2026-07-29

## Objetivo

Cerrar la inestabilidad entre Vibeapp y el servidor con una sola ruta de
captura y una prueba automática que cubra todos los tipos de activo antes de
solicitar otra validación en iPhone o iPad.

## Causa confirmada

La aplicación tenía rutas diferentes para archivos, señales y experiencias.
Además, el diagnóstico comprobaba la existencia del bucket, pero no que el
servidor pudiera escribir, leer y borrar un archivo real. Esto permitía que
Railway apareciera verde aunque una foto pudiera fallar después.

## Corrección aplicada

1. Vibeapp usa `POST /api/captures` como entrada canónica.
2. Los binarios usan el bucket privado `experience-media`, dentro de la ruta
   interna `captures/`.
3. Cada captura conserva `captureId`, clave de idempotencia, usuario, persona,
   fecha original, bytes, MIME y checksum.
4. El servidor devuelve éxito solo después de guardar el original, registrar la
   captura y dejar disponible su proyección en VibePWA.
5. La consulta del recibo reconcilia una proyección incompleta sin duplicar el
   archivo.
6. Una captura no crea por sí sola una experiencia, evento o historia.
7. El healthcheck de Railway realiza escritura, lectura y borrado real en
   Storage y devuelve `503 degraded` si cualquiera falla.
8. Los errores indican etapa, posibilidad de reintento, operación y estado
   durable alcanzado.

## Matriz automática ejecutada

Resultado: **verde**.

- Texto por JSON.
- Imagen por multipart.
- Audio por multipart.
- Video por multipart.
- Documento por multipart.
- Archivo biométrico por multipart.
- Biometría, ubicación, Agenda, clima, noticias y sensor por JSON.
- Bytes y MIME exactos.
- Reenvío idempotente.
- Respuesta perdida y consulta de recibo.
- Fallo temporal de Storage con recuperación.
- Fallo de catálogo con continuación sin volver a subir el archivo.
- Estado `needs_attention` cuando el contenido no coincide.
- Errores HTTP 401, 403, 413, 415 y 503.
- Rechazo de campos de experiencia, evento o historia.
- Ausencia de regresión de compatibilidad durante el canario.

Comandos ejecutados:

```text
npm run check
npm run verify:release
```

Ambos terminaron correctamente. La verificación de release también confirmó
los PDF de Reportes, Hallazgos, Publicaciones y Manual, el recorrido local de la
PWA, edición y borrado en Librería, Activos, Agenda y curación de historias.

## Comportamiento sin señal

Vibeapp conserva el original en su cola local. Al recuperar conexión reenvía la
misma captura, aunque hayan pasado horas. El servidor usa la fecha real del
hecho, no la hora de subida, y evita duplicados mediante la misma clave estable.

## Instrucción para Claude Mac

No cambiar rutas ni volver a dividir texto y multimedia.

Vibeapp debe:

1. consultar `GET /api/captures/status`;
2. enviar cada tipo a `POST /api/captures`;
3. conservar la captura hasta recibir estado durable;
4. ante respuesta dudosa, consultar `GET /api/captures/{captureId}`;
5. reintentar con el mismo `captureId` e `idempotencyKey`;
6. mostrar un estado humano: pendiente, enviando, guardado o requiere atención.

La próxima prueba en dispositivo es confirmatoria. No debe utilizarse para
diagnosticar Storage, MIME, reintentos o proyección; esos escenarios ya quedan
bloqueados automáticamente antes del despliegue.

## Criterio final

La versión solo puede pasar a producción cuando:

1. `npm run verify:release` termina verde;
2. Railway termina verde;
3. `/api/health` informa `storageRoundTrip.ok=true`;
4. la prueba automática de Vibeapp confirma JSON y multipart por la ruta única.
