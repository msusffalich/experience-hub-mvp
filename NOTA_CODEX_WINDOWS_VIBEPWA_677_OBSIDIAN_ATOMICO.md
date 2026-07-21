# NOTA CODEX WINDOWS - VibePWA 677 - Exportacion Obsidian atomica

Fecha: 2026-07-21
Version: `20260721-obsidian-export-atomic-677`

## Problema corregido

La version anterior podia actualizar el mapa de Obsidian sin regenerar las notas de experiencia. Eso dejaba una boveda incoherente: mapa nuevo, notas viejas y fotos antiguas marcadas como `narrative: ok`.

## Cambios

1. La exportacion ahora exige boveda local conectada antes de empezar.
2. Las notas de experiencia se guardan antes que el mapa.
3. Si las notas no se guardan completas, el flujo falla con mensaje visible.
4. El mapa solo se guarda despues de confirmar que todas las notas exportables se guardaron.
5. Las notas antiguas de experiencias que ahora no son exportables se eliminan por nombre exacto.
6. Se agrego `DELETE /api/obsidian/export` para limpiar tambien el volumen del servidor cuando exista `OBSIDIAN_VAULT_PATH`.
7. `npm run check` valida que no vuelva el caso "solo mapa actualizado".

## Validacion

Comando ejecutado:

```bash
npm run check
```

Resultado:

- Sintaxis `app.js`: OK
- Sintaxis `server.js`: OK
- Smoke check: OK
- Auditoria runtime: OK
- Contrato Obsidian: OK

## Prueba esperada en produccion

1. Abrir VibePWA version 677.
2. Conectar la boveda local Obsidian del PC.
3. Presionar `Exportar mapa y notas`.
4. El mensaje final debe decir:
   - mapa guardado
   - notas de experiencia guardadas
   - notas obsoletas retiradas o sin notas obsoletas
5. En Obsidian:
   - el mapa debe estar actualizado en `05_Generated`
   - las notas deben estar actualizadas en `02_Experiences`
   - las fotos/videos sin narrativa real no deben quedar como notas narrativas antiguas.
