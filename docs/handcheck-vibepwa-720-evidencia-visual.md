# Handcheck VibePWA 720 - Evidencia visual

Fecha: 2026-07-27
Versión: `20260727-evidence-gallery-720`
Alcance: presentación de Evidencia; sin cambios de servidor, Supabase, Storage,
sincronización ni procesamiento.

## Objetivo

Convertir Evidencia en una galería de uso cotidiano. El contenido debe
reconocerse antes que sus metadatos técnicos.

## Cambios confirmados

- La vista se llama Evidencia en ES, EN, FR y PT.
- Las métricas visibles resumen total, imágenes, videos, audios, documentos y
  archivos por sincronizar.
- Las tarjetas muestran vista previa, fecha, historia, síntesis y acciones
  cotidianas.
- Abrir, descargar y editar historia siguen disponibles.
- Revisión, texto extraído, traducción, etiquetas, procesamiento y
  almacenamiento están plegados.
- ID, nombre de archivo, dispositivo, origen y trazabilidad están en Detalles
  técnicos.
- No hay control `onclick` nuevo en la tarjeta.
- Los filtros técnicos siguen disponibles en Opciones avanzadas.
- Los filtros activos no ocupan espacio cuando no existe ningún filtro.
- El manual PDF incluye la nueva galería y renderiza énfasis y listas sin
  mostrar marcas Markdown.

## Pruebas automatizadas

- `node --check app.js`: OK.
- `verify:product-shell`: OK.
- E2E local: OK.
- Captura, edición y eliminación: OK.
- Imagen, video, audio y documento con vista previa: OK.
- Detalles cerrados por defecto: OK.
- Formulario y trazabilidad presentes al desplegar: OK.
- Sin desbordamiento horizontal en escritorio y móvil: OK.
- Reporte, Hallazgos y Publicación PDF: OK.
- Manual PDF ReportLab regenerado y revisado visualmente: OK, 7 páginas.

Capturas:

- `output/playwright/vibe-evidence-gallery-desktop.png`
- `output/playwright/vibe-evidence-gallery-mobile.png`

## Prueba humana posterior al deploy

1. Abrir Evidencia.
2. Confirmar versión `20260727-evidence-gallery-720`.
3. Verificar que las primeras tarjetas muestran miniaturas o reproductores.
4. Abrir una imagen, un video, un audio y un documento.
5. Desplegar Revisar y ver detalles en una tarjeta.
6. Confirmar que Detalles técnicos permanece cerrado hasta elegirlo.
7. Probar búsqueda, tipo y fechas.
8. Confirmar que Abrir, Descargar y Editar historia responden.

## Criterio de cierre

La pantalla es una galería visual y no un tablero técnico; todo el detalle
operativo sigue accesible bajo demanda.
