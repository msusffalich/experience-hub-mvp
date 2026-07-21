# Handcheck VibePWA 670 - Exportacion real a Obsidian

Fecha: 2026-07-21
Version: 20260721-obsidian-polish-670
Origen: VibePWA Windows
Objetivo: generar una exportacion real desde la data local sincronizada hacia la boveda Obsidian, sin tocar contenido humano curado.

## Resultado

Exportacion ejecutada correctamente.

Fuente de datos:

- `data/experience-store.json`

Boveda usada:

- `C:\Users\msusf\Documents\Codex\2026-05-09\files-mentioned-by-the-user-meta\obsidian-vault-vibe`

Resumen:

- 6 archivos exportados.
- 5 experiencias reales exportadas.
- 1 mapa de conocimiento generado.
- 2 senales de contexto/biometria excluidas porque no son experiencias narrativas.
- 0 archivos vacios detectados.
- Validacion real de archivos: OK.
- `npm run check`: OK.

## Archivos generados o actualizados

- `05_Generated/mapa-de-conocimiento-vibe-obsidian.md`
- `02_Experiences/2026-05-05 - sesion-de-prototipado-visual.md`
- `02_Experiences/2026-05-06 - cena-familiar.md`
- `02_Experiences/2026-05-07 - entrenamiento-ligero-y-caminata.md`
- `02_Experiences/2026-05-08 - lectura-sobre-memoria-autobiografica.md`
- `02_Experiences/2026-05-09 - revision-de-arquitectura-del-ecosistema.md`

## Contrato validado

Cada nota de experiencia real cumple:

- `type: experience`
- `created_at`
- `updated_at`
- `date`
- `datetime_local`
- `timezone`
- `narrative`
- `learnings`
- `multimodal`
- `sync_status: exported`
- bloque automatico `<!-- vibe:auto --> ... <!-- /vibe:auto -->`
- seccion humana `## Curaduria humana`
- `people` se omite cuando no hay personas; no se emite `people: []`
- `## Enlaces` queda dentro del bloque automatico, porque lo genera VibePWA

## Reglas de preservacion

El export mantiene separadas dos zonas:

- Zona automatica: VibePWA la puede regenerar.
- Zona humana: Obsidian/curador la puede editar sin que VibePWA la pise.

Si una nota antigua existe sin marcadores automaticos, el servidor/script no la pisa directamente: la versiona antes de escribir la nueva nota.

Si la zona humana contiene aprendizajes reales bajo `### Aprendizajes`, la reexportacion cambia el frontmatter a:

```yaml
learnings: "ok"
```

Esto evita que una nota ya curada siga apareciendo como pendiente en los MOC.

## Validaciones ejecutadas

Comandos ejecutados:

```powershell
$env:DIRECT_OBSIDIAN_EXPORT='1'
$env:OBSIDIAN_VAULT_PATH=(Resolve-Path '.\obsidian-vault-vibe').Path
node scripts/export-obsidian-from-local-store.mjs
npm.cmd run check
```

Resultado de `npm run check`:

- Sintaxis `app.js`: OK.
- Sintaxis `server.js`: OK.
- Smoke check: OK.
- Auditoria runtime helpers: OK.
- Verificacion contrato Obsidian: OK.

Validacion adicional sobre archivos reales:

- 6 archivos encontrados.
- 0 archivos vacios.
- campos obligatorios presentes.
- marcadores automaticos presentes.
- zona humana presente.
- `## Enlaces` dentro del bloque automatico.
- sin `people: []`.

## Nota operativa

La exportacion se ejecuto en modo directo a filesystem porque el sandbox de esta sesion no permitio iniciar el servidor en segundo plano. El script conserva tambien el modo API contra `/api/obsidian/export` para uso normal desde VibePWA/Railway/local server.

## Pendientes no bloqueantes

- Prueba humana final: escribir manualmente un aprendizaje bajo `### Aprendizajes`, reexportar y confirmar que el texto sobrevive y que `learnings` queda en `ok`.
- Crear notas de categoria si se quiere que todos los wikilinks de categoria resuelvan como paginas completas, no solo como enlaces futuros.
