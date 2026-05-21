# Plan de adopcion selectiva desde CLIO

Fecha: 2026-05-21

Fuente revisada: `C:\Users\msusf\ClaudeCode\Clio-Reverse-Engineering`

Este documento resume que artefactos de la radiografia de CLIO podemos copiar o adaptar para acelerar Experience Hub sin reiniciar el proyecto. La conclusion principal es que no conviene copiar la app Flutter completa: Experience Hub ya tiene un MVP web funcional, Supabase, Railway, captura, reportes y publicaciones. Lo correcto es adoptar los patrones de arquitectura de CLIO que cierran nuestras brechas actuales.

## Hallazgos principales

CLIO se apoya en cuatro decisiones que explican su mejor comportamiento multidispositivo:

1. **Supabase como fuente de verdad**: PostgreSQL + Storage + Auth + Realtime, con RLS en cada tabla de usuario.
2. **Cliente local-first**: cada dispositivo mantiene cache local, pero sincroniza contra Supabase y recibe cambios con Realtime.
3. **Backend seguro por funciones/proxies**: claves de IA, Google, E2B y procesamiento pesado no viven en el cliente.
4. **Procesamiento asíncrono**: tareas largas generan `cloud_tasks`, progreso, artefactos y notificaciones, no bloquean la captura.

## Artefactos que si debemos copiar/adaptar

### 1. Matriz de Supabase y RLS

Origen CLIO:
- `skeleton/supabase/migrations/0001_initial_schema.sql`
- Secciones 5, 15 y 20 de `CLIO_BLUEPRINT.md`

Adaptacion para Experience Hub:
- Mantener `auth.uid() = user_id` en todas las tablas personales.
- Separar las tablas centrales: `experiences`, `experience_events`, `assets`, `participants`, `workspaces`.
- Agregar una prueba SQL/API de aceptacion para cada tabla: insert, select, update, delete, RLS y lectura desde otro dispositivo.
- Usar `service_role` o `sb_secret` solo en backend. Nunca en navegador.

Accion inmediata:
- Crear una lista de verificacion `database/supabase-readiness-checklist.sql` con queries de bucket, RLS, grants, storage policies y conteo de assets pendientes.

### 2. Contrato local-first + Realtime

Origen CLIO:
- Seccion 15.2 de `CLIO_BLUEPRINT.md`
- Roadmap Fase 2: cache local + sincronizacion Supabase Realtime.

Adaptacion para Experience Hub:
- Mantener localStorage/IndexedDB como cache temporal en web.
- Agregar un canal Realtime para `experiences`, `experience_events` y `assets`.
- Cuando se guarda una experiencia en un dispositivo, los otros deben refrescar automaticamente sin depender de que el usuario recargue.
- Definir regla simple de conflicto: `updated_at` gana, con aviso si hay cambios locales pendientes.

Accion inmediata:
- Implementar un modulo `realtime-sync` en el frontend web.
- Registrar en Admin el estado: conectado, ultimo evento recibido, tablas suscritas, errores.

### 3. Pipeline robusto de multimedia

Origen CLIO:
- Dependencias multimedia: `image_picker`, `camera`, `video_player`, `cached_network_image`.
- Secciones 8, 9, 11.3 y 15 del blueprint.

Adaptacion para Experience Hub:
- Estandarizar cada adjunto con un contrato unico:
  - `assetId`
  - `experienceId`
  - `eventId`
  - `participantId`
  - `kind`
  - `mimeType`
  - `sizeBytes`
  - `storageBucket`
  - `storagePath`
  - `uploadStatus`
  - `uploadError`
  - `processingStatus`
  - `sourceDevice`
  - `capturedAt`
  - `metadataFingerprint`
- La captura no debe considerar completo el flujo si `uploadStatus != uploaded`.
- Los reintentos deben subir binario, no base64.
- Los documentos deben tener `processingStatus`: `pending`, `extracting`, `ready`, `failed`.

Accion inmediata:
- Crear una tabla o vista operacional de `asset_upload_attempts`.
- Mostrar en Admin y Libreria el detalle del ultimo intento por archivo.

### 4. Tareas asíncronas y artefactos

Origen CLIO:
- `cloud_tasks`
- `artifacts`
- `skeleton/supabase/functions/dispatch-cloud-task/index.ts`
- `skeleton/e2b/orchestrator.mjs`

Adaptacion para Experience Hub:
- No necesitamos E2B todavia para el MVP.
- Si necesitamos una cola de procesamiento propia para OCR, transcripcion, resumen audiovisual y generacion de reportes pesados.
- Cada tarea debe tener:
  - `taskId`
  - `userId`
  - `assetId` o `experienceId`
  - `type`
  - `status`
  - `progress`
  - `error`
  - `result`
  - `createdAt`
  - `completedAt`

Accion inmediata:
- Implementar una tabla `processing_jobs` y endpoints `/api/jobs`.
- Mover OCR/transcripcion de accion manual a job automatico despues de subir un asset.

### 5. Notificaciones en 4 capas

Origen CLIO:
- Seccion 14 del blueprint.

Adaptacion para Experience Hub:
- Para el piloto web no necesitamos FCM completo.
- Si necesitamos tres capas ya:
  - Banner in-app.
  - Panel Admin de eventos recientes.
  - Badge de pendientes en Captura/Libreria/Activos.
- Push FCM queda para fase movil/PWA madura.

Accion inmediata:
- Crear `operation_events` o extender el log actual para registrar guardado, subida, fallo de upload, procesamiento y reintentos.

### 6. Edge Functions como muro de seguridad

Origen CLIO:
- `supabase/functions/_shared/cors.ts`
- Catalogo de 39 edge functions.
- Principio: secretos solo server-side.

Adaptacion para Experience Hub:
- Hoy usamos Node/Railway como backend. Eso esta bien para ir rapido.
- No debemos mover todo a Edge Functions todavia.
- Si debemos adoptar la separacion:
  - Cliente: UI, cache, formularios, subida via backend.
  - Backend: Storage, OCR/transcripcion, IA, reportes pesados, conectores.
  - Supabase: datos, RLS, Storage, Realtime.

Accion inmediata:
- Crear una capa `server/supabase-client` o modulo equivalente para centralizar headers, claves y errores de Supabase.
- Prohibir llamadas directas de cliente a Storage con claves secretas.

### 7. MCP y conectores

Origen CLIO:
- `skeleton/mcp-server`
- Seccion 16 del blueprint.

Adaptacion para Experience Hub:
- No es prioridad antes de cerrar Storage, Realtime y procesamiento.
- Si es buen camino para integracion futura con Obsidian, Codex, Google Drive, Calendar y dispositivos.

Accion recomendada:
- Mantenerlo como fase posterior a deploy estable.
- Primer MCP minimo: leer experiencias, buscar experiencias, crear experiencia, listar assets, crear job de procesamiento.

## Artefactos que no debemos copiar ahora

- App Flutter completa: reiniciaria el proyecto.
- Plugin Meta wearables: requiere SDK y fase nativa posterior.
- E2B sandbox completo: util para generacion avanzada, no para cerrar el MVP operativo.
- 39 Edge Functions completas: demasiado amplio; conviene extraer 4-6 funciones equivalentes segun necesidad.
- CI/CD Azure: usamos GitHub + Railway; solo copiamos la idea de stages paralelos.

## Orden recomendado para acelerar Experience Hub

### Bloque A: Cerrar persistencia y multimedia

1. Diagnostico real de `/api/media` y Storage.
2. `asset_upload_attempts` o registro equivalente.
3. Panel claro de pendientes por archivo.
4. Reintento por asset sin recrear experiencia.
5. Prueba cruzada desktop -> movil -> tablet.

### Bloque B: Realtime multidispositivo

1. Suscripcion a cambios en `experiences`.
2. Suscripcion a `assets`.
3. Refresco automatico de Libreria y Activos.
4. Indicador Admin de Realtime conectado.

### Bloque C: Procesamiento multimedia automatico

1. `processing_jobs`.
2. OCR/document extraction automatico al subir documento.
3. Transcripcion automatica al subir audio.
4. Descripcion guiada de imagen/video como fallback hasta conectar vision real.

### Bloque D: Dispositivos

1. Contrato unico de eventos y assets por dispositivo.
2. Importacion movil/PWA estable.
3. Wearables como integracion posterior.

### Bloque E: IA y automatizaciones

1. Registro unico de herramientas internas.
2. Jobs de analisis/reportes.
3. MCP minimo.
4. Conectores externos.

## Primer incremento concreto recomendado

Implementar inmediatamente:

1. `asset_upload_attempts` en SQL.
2. Endpoint backend que registre cada intento de subida con error sanitizado.
3. Panel Admin "Uploads de multimedia" con estado por archivo.
4. Boton "Reintentar adjunto" desde Libreria/Activos si existe cache local.
5. Prueba automatica: crear media temporal, subir, firmar URL, leer, registrar intento.

Este incremento ataca el problema actual: la experiencia replica, pero el adjunto queda pendiente sin causa visible.

## Criterio de cierre

No se considera cerrado el flujo multidispositivo hasta que:

- Una experiencia creada en desktop aparece en movil.
- Su imagen aparece y abre en movil.
- Su audio aparece y reproduce en movil.
- Su documento aparece y muestra texto extraido o estado de procesamiento.
- Libreria, Activos, Reporte y Publicaciones usan el mismo asset remoto.
- Admin muestra cero uploads pendientes o explica el motivo exacto.
