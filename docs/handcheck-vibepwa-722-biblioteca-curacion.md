# Handcheck VibePWA 722: Biblioteca y curación visual

Fecha: 2026-07-28  
Versión: `20260728-library-curation-722`

## Objetivo

Convertir Historias y su curación en un flujo comprensible para una persona
común, sin modificar el modelo de datos ni las operaciones ya validadas.

## Cambios

- El encabezado principal ahora dice **Historias**.
- El panel se presenta como **Tus historias**.
- Las tarjetas priorizan portada, fecha, Área de vida, título y relato.
- Se muestran conteos simples de eventos y archivos.
- Las acciones principales son **Editar** y **Reorganizar**.
- Línea de tiempo, procedencia y borrado están bajo **Más opciones**.
- En móvil, los filtros quedan plegados bajo **Filtrar historias**.
- Reorganizar comienza con cuatro decisiones:
  - mover archivos;
  - unir historias;
  - dividir historia;
  - cambiar nivel entre historia y evento.
- Solo aparece la herramienta correspondiente a la decisión elegida.
- Los archivos vinculados muestran miniatura o reproductor durante la
  reorganización.
- La misma estructura está disponible en español, inglés, francés y portugués.

## Integridad funcional

No se modificaron los controladores de persistencia para:

- mover o liberar evidencia;
- unir historias;
- dividir una historia;
- promover un evento;
- degradar una historia a evento.

La nueva capa visual continúa llamando a esos mismos controladores. Cada acción
mantiene confirmación y registro de curación.

## Verificación ejecutada

- `node --check app.js`
- `npm run verify:product-shell`
- `VIBE_E2E_VISUAL_AUDIT=1 npm run verify:e2e`
- `git diff --check`

El E2E comprobó captura, edición, borrado, Biblioteca, Evidencia, Agenda,
alcance compartido, selector de curación, sus cuatro rutas y generación final
de Reporte, Hallazgos y Publicación PDF.

Capturas revisadas:

- `output/playwright/vibe-library-desktop.png`
- `output/playwright/vibe-library-mobile.png`
- `output/playwright/vibe-library-curation-desktop.png`
- `output/playwright/vibe-library-curation-mobile.png`

## Criterio de aceptación

1. Las historias aparecen antes que los filtros en móvil.
2. Ninguna tarjeta ni panel desborda horizontalmente.
3. Reorganizar abre cuatro decisiones legibles.
4. No se muestran controles de operaciones no elegidas.
5. Los archivos se reconocen visualmente.
6. Editar, mover, liberar, unir, dividir, promover y degradar conservan sus
   rutas funcionales.

