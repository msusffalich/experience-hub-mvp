# NOTA CODEX WINDOWS - VibePWA 676 - Reglas finales de exportacion Obsidian

Fecha: 2026-07-21
Version: `20260721-obsidian-export-rules-676`
Alcance: boton Markdown / Obsidian, mapa de conocimiento y notas de experiencias.

## Cambios ejecutados

1. Se corrigio el error runtime `EXPERIENCE_CATEGORIES is not defined`.
   - La validacion de categorias usa ahora el arreglo real `categories`.
   - `npm run check` falla si vuelve a aparecer `EXPERIENCE_CATEGORIES`.

2. Se unifico la regla de narrativa real.
   - Nueva regla compartida:
     - `isLowValueObsidianNarrative`
     - `getExperienceNarrativeTextForExport`
     - `getExperienceNarrativeStatus`
   - La misma regla alimenta:
     - frontmatter `narrative`
     - resumen de cada nota
     - metrica del mapa `Experiencias con narrativa real`
     - exclusion de capturas tecnicas.

3. Se evita que una foto, video, audio o archivo tecnico cuente como experiencia narrativa.
   - Se rechazan como narrativa:
     - nombres de archivo
     - `image_picker`
     - `native-media`
     - extensiones `.jpg`, `.heic`, `.mp4`, `.webm`, etc.
     - placeholders como `Dato del usuario`
     - textos automaticos tipo OCR/revision/boilerplate.

4. Se redujo el ruido tecnico en el mapa.
   - El mapa ya no repite textos genericos de OCR o revision multimodal.
   - Solo exporta `Lectura relevante de activos` cuando existe texto util.

5. Se protegio la energia de capturas tecnicas.
   - Si una captura tecnica tiene energia default `5` o `7`, no se exporta como energia confiable.

6. Se agrego herramienta segura para limpiar notas legacy.
   - Script: `scripts/clean-legacy-obsidian-notes.mjs`
   - Modo revision:
     ```bash
     node scripts/clean-legacy-obsidian-notes.mjs "C:\Users\msusf\Documents\Codex\2026-05-09\files-mentioned-by-the-user-meta\obsidian-vault-vibe"
     ```
   - Modo borrado:
     ```bash
     node scripts/clean-legacy-obsidian-notes.mjs "C:\Users\msusf\Documents\Codex\2026-05-09\files-mentioned-by-the-user-meta\obsidian-vault-vibe" --apply
     ```
   - Solo borra notas `.md` antiguas sin frontmatter, sin `<!-- vibe:auto -->` y sin zona de curaduria humana.

## Validacion ejecutada

Comando:

```bash
npm run check
```

Resultado:

- `node --check app.js`: OK
- `node --check server.js`: OK
- `scripts/smoke-check.mjs`: OK
- `scripts/audit-runtime-helpers.mjs`: OK
- `scripts/verify-obsidian-export-contract.mjs`: OK

## Limpieza de notas viejas

Se ejecuto revision seca sobre:

`C:\Users\msusf\Documents\Codex\2026-05-09\files-mentioned-by-the-user-meta\obsidian-vault-vibe`

Resultado:

`No legacy Obsidian experience notes found.`

Interpretacion: en esa ruta actual no quedan notas legacy detectables bajo la regla segura.

## Handcheck recomendado despues del deploy

1. Abrir VibePWA version 676.
2. Ir a Mapa de Experiencias.
3. Verificar que el panel de Obsidian muestre estado de conexion.
4. Presionar `Exportar mapa y notas`.
5. Confirmar mensaje final visible.
6. Revisar en Obsidian:
   - `05_Generated/mapa-de-conocimiento-vibe-obsidian.md`
   - notas nuevas en `02_Experiences`
   - cero archivos de 0 bytes
   - `narrative: pending` para capturas sin narrativa real
   - no repetir boilerplate OCR/revision
   - `## Curaduria humana` preservada.

## Pendiente no tecnico

Si una experiencia real fue capturada historicamente como foto suelta o con titulo pobre, la app ya no debe inventarle narrativa. Esa experiencia quedara como pendiente hasta que se agregue una nota humana o se recapture con narrativa real.
