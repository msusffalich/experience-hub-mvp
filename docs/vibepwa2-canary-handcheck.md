# VibePWA 2 - handcheck de canario

Estado: listo para canario, sin sustituir la interfaz productiva
Rama: `codex/vibepwa-2`
Acceso paralelo: `/apps/vibepwa-next/index.html`

## Objetivo

Validar con la cuenta de control que VibePWA 2 conserva cada hecho, permite
organizarlo visualmente y produce resultados sin alterar el flujo productivo
actual.

## Puertas previas

1. Ejecutar `database/capture-pipeline.sql` en el proyecto Supabase de Vibe.
2. Confirmar que las cinco columnas del `SELECT` final devuelven `true`.
3. Configurar en Railway:

```text
CAPTURE_PIPELINE_MODE=canary
CAPTURE_PIPELINE_CANARY_USERS=msusffalich@gmail.com
CAPTURE_PIPELINE_BUCKET=experience-media
CAPTURE_MAX_FILE_BYTES=104857600
CAPTURE_STORAGE_TIMEOUT_MS=30000
```

4. Mantener `ARNES_ASSISTANT_ENABLED=false` durante este canario.
5. No cambiar todavía el `start_url`, `/index.html` ni el enlace principal.

## Prueba funcional

### Sesión

1. Iniciar sesión.
2. Dejar expirar el token o restaurar una sesión con token vencido.
3. Abrir o actualizar la interfaz.

Resultado: el servidor renueva la sesión una sola vez y las solicitudes
paralelas continúan. Una falla temporal de red no cierra la sesión.

### Texto y contexto

Enviar, uno por uno:

- texto;
- biometría;
- ubicación;
- agenda;
- clima;
- noticias;
- sensor.

Resultado: cada elemento recibe estado `complete`. Los elementos de contexto
enriquecen análisis, pero no crean historias.

### Archivos

Enviar:

- foto;
- audio;
- video menor de 6 MiB;
- video mayor de 6 MiB;
- documento;
- archivo biométrico.

Resultado:

- los archivos pequeños usan carga firmada directa;
- el video grande usa TUS en bloques de 6 MiB;
- Storage es privado;
- el registro visible aparece solo después de verificar tamaño y MIME;
- cada archivo queda en Evidencia como `Por organizar`.

### Red intermitente

1. Iniciar una carga grande.
2. Desconectar la red.
3. Cerrar y volver a abrir la interfaz.
4. Recuperar la red y reintentar.

Resultado: se reutilizan `captureId` e `idempotencyKey`, TUS continúa desde el
desplazamiento confirmado y no se duplica el archivo ni el catálogo.

### Historias

1. Crear una historia sin evidencia.
2. Editarla y añadir evidencia desde la galería.
3. Quitar un archivo.
4. Borrar la historia.

Resultado: quitar o borrar una historia nunca destruye el archivo. La evidencia
regresa a la bandeja.

### Inteligencia y publicación

1. Aplicar un rango de fechas y un área de vida.
2. Generar reporte y hallazgos.
3. Elegir historias y generar una publicación.
4. Repetir con una historia que incluya video.

Resultado: los filtros son consistentes; los datos ausentes no se convierten en
cero; la publicación sin video descarga PDF y la publicación con video descarga
ZIP con PDF y videos.

### Presentación

Verificar escritorio, iPhone, iPad y emulador Android:

- seis espacios visibles y navegables;
- español, inglés, francés y portugués completos;
- tema claro y oscuro legibles;
- sin texto desbordado ni controles superpuestos;
- Operación y diagnóstico plegado dentro de Cuenta.

## Evidencia automática ya superada

```text
npm run check
npm run verify:direct-upload
npm run verify:capture-core
npm run verify:vibepwa-next
node scripts/verify-vibepwa-next-browser.mjs
```

La batería cubre tipos, aislamiento, idempotencia, reintentos, carga directa,
reanudación TUS, renovación de sesión, seis espacios, editor de historias,
cuatro idiomas, temas y diseño responsive.

## Criterio de promoción

Promover solo si:

- todos los tipos terminan en `complete`;
- no hay archivos duplicados, truncados o sin catálogo;
- los conteos de Storage, catálogo y UI coinciden;
- el flujo funciona en los dispositivos disponibles;
- no hay regresiones en reportes, hallazgos, publicación u Obsidian.

## Rollback

Desactivar el canario:

```text
CAPTURE_PIPELINE_MODE=off
```

El rollback no borra datos. La interfaz anterior continúa en `/index.html` y
los registros del ledger permanecen auditables.
