# Blueprint de desarrollo: Vibeapp nativa

## Objetivo

Vibeapp sera la aplicacion nativa complementaria de Vibe. Su foco no es reemplazar la PWA, sino cubrir lo que el navegador no puede hacer de forma robusta: captura real desde camara, microfono, ubicacion, sensores, notificaciones, biometria y sincronizacion en segundo plano.

## Rol de cada pieza

| Pieza | Rol principal | Uso recomendado |
|---|---|---|
| Vibe PWA | Analisis, reportes, hallazgos, publicaciones, administracion y trabajo asincronico | Desktop, Mac, tablet y revision profunda |
| Vibeapp Flutter | Captura rapida, voz, camara, video, ubicacion, sensores, biometria y cola offline | iPhone, iPad, Android y, despues, conectores nativos |
| Supabase | Fuente de verdad compartida | Auth, Postgres, Storage privado, RLS, eventos, activos y auditoria |

## Flujo operativo esperado

1. El usuario abre Vibeapp o activa una accion rapida.
2. Vibeapp registra una experiencia, evento o activo con hora, ubicacion, dispositivo y participante.
3. Si hay conexion, sincroniza texto y metadatos con Supabase.
4. Los archivos se suben a Storage privado y se registran en `assets`.
5. La PWA lee la misma informacion y la usa en Libreria, Activos, Reportes, Hallazgos y Publicaciones.
6. Si no hay conexion, Vibeapp conserva cola local cifrada y reintenta sin obligar al usuario a administrar comandos.

## Contrato minimo de sincronizacion

Cada evento o activo debe enviar:

- `workspace_id`
- `user_id`
- `participant_id`
- `source_type`: `ios`, `android`, `tablet`, `wearable`, `camera`, `microphone`, `health_file`
- `source_device_id`
- `source_event_id`
- `captured_at`
- `timezone`
- `location`: latitud, longitud, ciudad o texto manual
- `experience_id` opcional
- `experience_event_id` opcional
- `payload_type`: `text`, `audio`, `image`, `video`, `document`, `biometric`, `calendar`
- `storage_path` si hay archivo
- `mime_type`
- `checksum`
- `processing_status`
- `privacy_level`
- `sync_status`: `local`, `queued`, `uploading`, `synced`, `failed`

## Pantallas iniciales de Vibeapp

1. **Inicio rapido**
   - Boton grande para grabar nota.
   - Acciones: foto, video, audio, nota, agenda.
   - Estado simple: sincronizado, pendiente o sin conexion.

2. **Captura viva**
   - Experiencia abierta.
   - Eventos internos por voz, foto, video o texto.
   - Cierre claro: terminar experiencia y revisar.

3. **Cola y sincronizacion**
   - Lista simple de pendientes.
   - Reintento automatico.
   - Resumen observable: listo para enviar, subiendo, esperando reintento, requiere accion, archivos pendientes y eventos pendientes.
   - Mensaje humano si algo falla, sin pedir al usuario que interprete logs.
   - Checklist de piloto movil: backend, sesion, cola, nota rapida, multimedia, contexto, fuentes externas y lectura en PWA.
   - Llaves de idempotencia para que reintentos de experiencia, agenda o media no creen duplicados.

4. **Permisos y privacidad**
   - Camara, microfono, ubicacion, fotos, notificaciones y salud.
   - Explicacion clara de para que se usa cada permiso.

5. **Ajustes**
   - Cuenta.
   - Participante activo.
   - Idioma.
   - Nivel de privacidad.
   - Diagnostico tecnico oculto bajo modo avanzado.

6. **Importar sesion externa**
   - Origen: Meta/Oakley/Ray-Ban, Oura, Apple Health, Samsung Health/Galaxy Watch, Health Connect, galeria del telefono u otro.
   - Seleccion de varios archivos en una sola accion.
   - Agrupacion automatica como una experiencia con eventos internos y activos vinculados.
   - Metadatos normalizados: origen, contrato, tipo de archivo, dispositivo, fecha de importacion y nombre original.
   - Perfil por fuente: fotos/videos de Meta se tratan como memoria visual; JSON/HTML de Meta se tratan como referencia de cuenta; CSV/JSON de Oura, Apple Health, Samsung Health y Health Connect se tratan como contexto biometrico transversal.
   - Lectura PWA: Activos, inventario y Reportes muestran perfil externo, intencion de procesamiento, privacidad y si el archivo se interpreta automaticamente o solo se conserva.
   - Uso recomendado para lentes Meta: capturar/importar primero en Meta AI o Fotos del telefono, luego traer el conjunto a Vibeapp.

## Recomendaciones tecnicas

- Flutter como base comun para iOS, Android, iPadOS y, si conviene, desktop.
- Supabase Flutter para Auth, Postgres y Storage.
- Base local: Drift, Isar o SQLite cifrado para cola offline.
- Subida de archivos en segundo plano con reintentos.
- Resumen de cola calculado desde estados reales, no desde un mensaje global: pendientes, reintentos, fallos definitivos, sesion requerida, plugin nativo pendiente, archivos y eventos.
- Checklist de preparacion calculado desde datos reales para decidir si una prueba en telefono/tablet puede iniciar.
- Idempotencia por registro: `vibeapp-capture`, `vibeapp-agenda` y `vibeapp-asset` via headers y metadatos.
- IDs locales estables para evitar duplicados.
- Storage privado con URLs firmadas, igual que la PWA.
- Procesamiento pesado en backend, no en el telefono.
- Logs de sincronizacion para auditoria, pero ocultos al usuario normal.

## Primer incremento viable

1. Crear proyecto Flutter `vibeapp`.
2. Pantalla de login Supabase.
3. Captura de nota de texto.
4. Cola local simple.
5. Escritura en tabla `experiences`.
6. Lectura desde la PWA para confirmar sincronizacion.

## Segundo incremento

1. Foto desde camara.
2. Subida a Storage privado.
3. Registro en `assets`.
4. Vista del activo en PWA.
5. Reintento si falla la red.

## Tercer incremento

1. Grabacion de audio nativa.
2. Transcripcion backend.
3. Creacion de evento interno.
4. Vinculo con agenda si el texto contiene una intencion clara.

## Cuarto incremento

1. Importar una sesion externa completa desde Meta/Oakley/Ray-Ban, Oura, Apple Health, Samsung Health/Galaxy Watch, Health Connect o galeria del telefono.
2. Seleccionar multiples archivos: imagenes, videos, audios, documentos, CSV/JSON o ZIP.
3. Crear una sola experiencia con una linea de eventos y activos vinculados, siguiendo el patron tipo Clio: captura nativa, Storage privado, metadatos normalizados y procesamiento posterior en backend.
4. Clasificar cada archivo por origen e intencion: memoria visual, registro de voz, referencia de cuenta, contexto biometrico, documento o ZIP de transporte.
5. Mantener claro que Meta/Oakley no se controla desde la PWA: Vibeapp recibe el resultado importado y lo convierte en memoria, reporte o publicacion.

## Criterio de calidad

Vibeapp solo debe considerarse lista para piloto cuando:

- La captura funciona sin que el usuario piense en Supabase.
- Los activos aparecen en otro dispositivo sin accion manual.
- La cola offline se recupera sola.
- La cola muestra el estado real de cada captura y separa reintentos automaticos de problemas que requieren accion humana.
- El piloto movil solo se inicia cuando el checklist distingue bloqueos reales de capacidades ya verificadas por pruebas.
- `npm run simulate:vibeapp` pasa sin telefono fisico y valida nota rapida, agenda, foto, video, audio, biometria, ubicacion e importacion Meta/Oakley contra el contrato PWA.
- Los errores son comprensibles.
- La PWA puede generar reportes, hallazgos y publicaciones con datos creados desde Vibeapp.
