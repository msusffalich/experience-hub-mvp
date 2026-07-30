# VibePWA 2 y Backend 2 - validacion de lanzamiento

Fecha: 2026-07-30

Commit local validado: `e41cd74`

Este documento registra la evidencia de salida de la nueva aplicacion y su
servidor. No reemplaza la verificacion de produccion: Railway verde solo prueba
que el proceso responde; la aprobacion exige tambien Database, Storage,
autenticacion y un flujo real de usuario.

## Arquitectura cerrada

- Vibeapp captura hechos sin crear historias.
- Backend 2 recibe todos los tipos de captura por `/api/v2`.
- Supabase conserva identidad, archivos, catalogo, contexto e historias.
- VibePWA 2 permite revisar evidencia, armar historias y producir salidas.
- Obsidian recibe una exportacion curada; no es la base operativa.
- La version anterior permanece aislada durante la promocion y sirve como
  rollback, no como ruta interna de VibePWA 2.

## Pruebas locales aprobadas

El comando `npm run check` termino correctamente.

Cobertura comprobada:

- 43 rutas de Backend 2 y autenticacion estricta;
- texto, imagen, audio, video, documento, biometria y sensor;
- ubicacion, clima, noticias y agenda como contexto;
- archivos pequenos y carga reanudable;
- idempotencia, reintento y captura sin conexion;
- aislamiento por usuario y grupo/persona;
- historias transaccionales y evidencia adoptada;
- energia ausente conservada como dato ausente;
- Oura con OAuth, trabajo durable y firma HMAC;
- reportes, hallazgos, publicaciones, ZIP con videos y manual;
- exportacion Obsidian;
- ES, EN, FR y PT;
- escritorio y movil sin desbordamiento horizontal;
- compatibilidad con la aplicacion anterior durante la promocion.

Resultado de la matriz automatica: `READY TO RECONNECT`.

## Puertas de produccion

La promocion solo queda aprobada cuando todas estas puertas estan verdes:

1. `database/vibe-api-v2.sql` aplicado y sus seis verificaciones en `true`.
2. `GET /api/v2/health/live` devuelve HTTP 200.
3. `GET /api/v2/health/ready?force=1` devuelve `ready: true`.
4. Inicio de sesion real y salud autenticada correctos.
5. Una nota y una imagen nuevas aparecen una sola vez en la bandeja.
6. La imagen se abre, se adopta y permanece vinculada a la historia.
7. Un envio sin red conserva su hora original y sincroniza al volver la red.
8. Reporte, hallazgo, publicacion y ZIP se descargan y abren.
9. Oura conecta, sincroniza y conserva la sesion de Vibe.
10. No hay errores criticos o altos en logs.

## Rollback

Si una puerta falla:

- no se promueve VibePWA 2 como acceso principal;
- se conserva la version anterior disponible;
- no se eliminan capturas, archivos ni historias completas;
- se detienen trabajos incompatibles;
- se corrige Backend 2 antes de repetir la prueba.

No se acepta un estado parcialmente sincronizado como exito.
