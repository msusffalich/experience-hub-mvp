# VibePWA 2 - migracion y rollback

## Fase 1 - local

- Ejecutar pruebas de contrato, matriz de activos y UI.
- No cambiar el `start_url` productivo.
- Acceso de prueba: `/apps/vibepwa-next/index.html`.

## Fase 2 - canario

- Ejecutar `database/capture-pipeline.sql` y confirmar que todas las columnas
  del `SELECT` final sean `true`.
- Configurar `CAPTURE_PIPELINE_MODE=canary`.
- Configurar `CAPTURE_PIPELINE_CANARY_USERS=msusffalich@gmail.com`.
- Mantener la aplicación principal en `/index.html`.
- Activar el pipeline solo para el usuario de control.
- Validar una captura de cada tipo.
- Simular perdida de red y reanudar.
- Confirmar visibilidad en Evidencia, adopcion en Historia y generacion PDF.
- Seguir la lista completa de `docs/vibepwa2-canary-handcheck.md`.

## Fase 3 - comparacion

- Mantener enlaces a ambas interfaces.
- Comparar conteos de historias y activos contra Supabase.
- Probar escritorio, iPhone, iPad y emulador Android.

## Fase 4 - promocion

- Cambiar el acceso principal solo cuando todas las puertas esten verdes.
- Mantener la aplicacion anterior disponible durante una ventana de rollback.

## Rollback

El rollback no modifica datos. Solo restaura `/index.html` como interfaz
principal y desactiva el canario de carga directa. Los registros del ledger y
catalogo permanecen auditables.
