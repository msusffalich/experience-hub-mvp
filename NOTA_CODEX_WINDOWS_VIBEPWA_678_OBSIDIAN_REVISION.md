# NOTA CODEX WINDOWS - VibePWA 678 - Obsidian atomico sin borrado automatico

Fecha: 2026-07-21
Version: `20260721-obsidian-export-review-678`

## Decision corregida

La exportacion debe ser atomica en escritura, pero no debe borrar automaticamente notas en `02_Experiences`.

Regla final:

- VibePWA guarda notas exportables primero.
- Si las notas no se guardan completas, el mapa no se guarda.
- El mapa se guarda solo despues de confirmar notas completas.
- Las notas antiguas o huerfanas se reportan como candidatas a revisar.
- Ninguna nota de experiencia se borra automaticamente desde la app ni desde el servidor.

## Cambios frente a 677

1. Se retiro el borrado automatico de notas locales.
2. Se retiro el endpoint servidor `DELETE /api/obsidian/export`.
3. Se reemplazo la limpieza automatica por `buildObsidianExcludedExperienceNoteCandidates`.
4. El mapa generado incluye una seccion:
   - `Notas candidatas a revisar`
5. El mensaje final indica:
   - mapa guardado
   - notas guardadas
   - notas obsoletas requieren revision, si existen.

## Validacion ejecutada

Comando:

```bash
npm run check
```

Resultado:

- Sintaxis app: OK
- Sintaxis servidor: OK
- Smoke check: OK
- Auditoria runtime: OK
- Contrato Obsidian: OK

## Handcheck sugerido

1. Publicar 678.
2. Conectar boveda local.
3. Ejecutar `Exportar mapa y notas`.
4. Confirmar que el mapa no se actualiza si las notas fallan.
5. Confirmar que el mapa enumera candidatas a revisar sin borrarlas.
6. El borrado de huerfanos queda para revision manual o para `scripts/clean-legacy-obsidian-notes.mjs --apply`, despues de verificar que no haya curaduria humana.
