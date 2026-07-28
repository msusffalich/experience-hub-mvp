# Handcheck VibePWA 721: editor visual de historias

Fecha: 2026-07-27
Versión: `20260727-story-editor-721`

## Objetivo

Convertir Nueva historia en un recorrido visual de tres pasos sin alterar el
guardado, la adopción de evidencia ni los contratos móviles.

## Cambios

1. **Contar**
   - título, narrativa, momento, área de vida y persona/grupo;
   - validación antes de avanzar;
   - no exige evidencia ni inventa narrativa.
2. **Elegir**
   - bandeja visual con miniaturas y vistas previas;
   - selección explícita;
   - regreso al relato sin perder datos.
3. **Revisar**
   - resumen legible del relato y sus datos esenciales;
   - tira visual de evidencia elegida;
   - advertencia humana cuando falta relato o evidencia;
   - contexto opcional plegado;
   - guardado desde una sola acción final.

## Compatibilidad preservada

- creación y edición de historias;
- historias con o sin evidencia;
- adjuntos locales y evidencia adoptada;
- eventos, agenda, energía opcional y biometría contextual;
- Biblioteca y reorganización;
- Reportes, Hallazgos y Publicaciones;
- ES, EN, FR y PT;
- escritorio y móvil.

## Validación automatizada

- `node --check app.js`
- `npm run check`
- `npm run verify:product-shell`
- E2E local con navegador real y auditoría visual

El E2E confirmó:

- navegación Contar > Elegir > Revisar;
- resumen final con título y evidencia;
- creación, edición y eliminación;
- activo vinculado visible;
- agenda;
- alcance compartido;
- Reportes, Hallazgos y Publicaciones en PDF.

## Evidencia visual

- `output/playwright/vibe-new-story-desktop.png`
- `output/playwright/vibe-new-story-mobile.png`
- `output/playwright/vibe-new-story-evidence-desktop.png`
- `output/playwright/vibe-new-story-evidence-mobile.png`
- `output/playwright/vibe-new-story-review-desktop.png`
- `output/playwright/vibe-new-story-review-mobile.png`

## Fuera de alcance

No se modificaron servidor, Supabase, Storage, sincronización, Vibeapp,
Obsidian ni el modelo de datos.
