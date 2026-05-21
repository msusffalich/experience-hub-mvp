# Auditoría de integridad UX/UI, navegación, flujo y PWA

Versión auditada: 20260521-admin-manual-cleanup-359
Fecha: 2026-05-21

## Resumen ejecutivo

La aplicación ya tiene una estructura mucho más clara para uso diario: Panel, Captura, Librería, Activos, Reportes, Publicaciones, Agenda y Manual separan mejor el flujo principal de controles técnicos.

Administración fue reorganizada en secciones desplegables por tema para evitar la lectura tipo sábana infinita. El Manual ahora muestra la versión vigente y una tarjeta de orientación.

## Estado de integridad

- Sintaxis JavaScript: aprobada con `node --check app.js`.
- Sintaxis servidor: aprobada con `node --check server.js`.
- Smoke test funcional: aprobado con `npm run check`.
- Navegación principal: todas las rutas `data-view` tienen sección correspondiente.
- Duplicidad de IDs HTML: no se detectaron IDs duplicados.
- PWA: service worker y versión de caché alineados con `APP_VERSION`.
- Manifest: corregido `start_url`; ya no apunta a una versión vieja.

## Correcciones aplicadas durante la auditoría

- `manifest.webmanifest`: se reemplazó el `start_url` versionado antiguo por `/index.html?view=dashboard`.
- `manifest.webmanifest`: se agregó `id` de aplicación y `display_override`.
- `app.js`: se protegió la referencia a `dataQualityTitle`, porque ese panel ya no está visible en Panel.
- `app.js`: se corrigieron textos con codificación dañada en mensajes críticos de validación y guardado.
- `scripts/smoke-check.mjs`: se agregaron validaciones permanentes para PWA estable y detección de caracteres con codificación dañada.
- `Activos multimodales`: las herramientas técnicas de inventario, CSV, importación y procesamiento masivo se movieron a Administración para preservar una pantalla de usuario más limpia.

## Navegación

Resultado: sólida para el alcance actual.

Todas las vistas del menú existen en HTML:

- Acceso
- Panel
- Captura
- Librería
- Activos multimodales
- Agenda
- Línea de tiempo
- Mapa de Experiencias
- Reporte
- Publicaciones
- Hallazgos
- Automatizaciones
- Manual del Usuario
- Administración

Riesgo residual: algunas funciones siguen creando paneles dinámicos dentro de `app.js`. Esto es válido, pero exige que los smoke tests sigan verificando los IDs críticos cuando se muevan paneles.

## Flujo operacional

Resultado: mejorado, pero aún debe seguir simplificándose.

Flujo recomendado para usuario:

1. Panel: ver estado y entrar a la acción principal.
2. Captura: crear experiencia y adjuntar evidencia.
3. Librería: buscar, revisar y editar.
4. Activos: visualizar multimedia y metadatos.
5. Reportes: elegir alcance, generar, revisar y exportar.
6. Publicaciones: generar borrador, editar, revisar y exportar.
7. Administración: solo para operación, diagnóstico, respaldo, piloto y configuración.

Riesgo residual: Activos, Reportes y Publicaciones aún tienen controles avanzados dentro de la pantalla, aunque ahora están plegados. Próximo paso recomendado: mover herramientas altamente técnicas a Administración si siguen confundiendo.

## Sintaxis y lenguaje

Resultado: aceptable con correcciones aplicadas.

Se detectaron y corrigieron textos con codificación dañada en mensajes de validación de Captura. Estos mensajes son críticos porque aparecen cuando algo falla y deben ser impecables.

Recomendación: mantener una regla de calidad para revisar textos visibles nuevos antes de cada versión.

## Solidez frontend

Resultado: buena para MVP, con una alerta.

No hay IDs duplicados y las vistas del menú están completas. Algunas referencias a IDs aparecen como faltantes porque son paneles dinámicos creados por funciones de render, por ejemplo reporte, cierre de piloto y vista imprimible de publicaciones.

Alerta corregida: `dataQualityTitle` era una referencia directa a un panel ya retirado de Panel. Quedó protegida.

## PWA y multidispositivo

Resultado: base PWA correcta para MVP.

Activo:

- `manifest.webmanifest`.
- `service-worker.js`.
- caché versionado.
- `theme-color`.
- soporte `apple-mobile-web-app-capable`.
- `display: standalone`.
- `start_url` estable.

Pendiente recomendado:

- agregar iconos PNG reales de 192x192 y 512x512 además del SVG.
- agregar `screenshots` al manifest para mejorar instalación en plataformas compatibles.
- probar instalación real en iPhone, iPad, Android, Windows y Mac desde la URL Railway.
- validar comportamiento offline parcial: shell carga, pero APIs y Supabase requieren conexión.

## Prioridades siguientes

1. Verificación visual en navegador móvil/tablet/desktop con capturas reales.
2. Segunda limpieza de Activos: mover importaciones/exportaciones técnicas a Administración si siguen generando ruido.
3. Segunda limpieza de Manual: convertir secciones largas en guías por rol y flujos paso a paso.
4. PWA completa: iconos PNG, screenshots, prueba de instalación y checklist por dispositivo.
5. Pruebas operativas end-to-end: captura con adjunto, sincronización, reporte y publicación desde al menos dos dispositivos.
