# Laboratorio CLIO Patterns

Este laboratorio permite probar patrones tomados de la radiografia de CLIO sin tocar la aplicacion principal. La idea es validar primero y migrar despues.

## Objetivo

Probar de forma aislada:

- Compatibilidad Supabase `sb_secret` / `service_role` para Storage.
- Registro de intentos de upload por archivo.
- Contrato unico de assets.
- Jobs de procesamiento asincrono.
- Base para Realtime multidispositivo.

## Estructura

```text
experiments/clio-patterns/
  .env.example
  package.json
  sql/
    001_asset_upload_attempts.sql
    002_processing_jobs.sql
  scripts/
    storage-smoke.mjs
    mock-asset-pipeline.mjs
    validate-env.mjs
```

## Regla de seguridad

No pongas claves reales en este directorio. Copia `.env.example` a un archivo local fuera de Git o usa variables de entorno de la terminal.

Las pruebas usan solo Node.js nativo. No instalan dependencias y no modifican la app principal.

## Pruebas

Desde este directorio:

```bash
npm run check
npm run mock:pipeline
```

Para probar Supabase Storage real:

```bash
$env:SUPABASE_URL="https://tu-proyecto.supabase.co"
$env:SUPABASE_SERVER_KEY="sb_secret_o_service_role"
$env:SUPABASE_BUCKET="experience-media"
npm run smoke:storage
```

## Criterio de aprobacion

Un patron esta listo para migrar a Experience Hub solo si:

- Tiene prueba local o smoke test.
- Registra error claro y sanitizado.
- No expone secretos al cliente.
- No requiere cambios manuales del usuario final.
- Tiene SQL reversible o idempotente.

## Orden de adopcion sugerido

1. `asset_upload_attempts`
2. `processing_jobs`
3. Reintento de upload por asset
4. Realtime de `experiences` y `assets`
5. Procesamiento automatico OCR/transcripcion
