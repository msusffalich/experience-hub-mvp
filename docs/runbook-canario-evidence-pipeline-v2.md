# Runbook: despliegue canario del canal de evidencia V2

Fecha: 2026-07-26  
Responsable del deploy: Codex PC  
Canario: Miguel  
Regla: V1 permanece activa hasta la aceptación final

## Objetivo

Activar V2 para una sola cuenta después de comprobar esquema, bucket, API y
Vibeapp. Ningún paso elimina datos ni cambia las rutas V1.

## Fase A. Preparación local

Debe estar verde:

```powershell
npm.cmd run check
npm.cmd run verify:e2e
npm.cmd run verify:evidence:v2
```

Resultado esperado:

- diez suites de comportamiento V2;
- adaptador transaccional;
- contrato de aislamiento;
- compuerta HTTP;
- flujos V1 y PDF sin regresión.

## Fase B. Supabase

1. Abrir el proyecto Supabase usado por `experience-hub-web`.
2. Abrir SQL Editor.
3. Ejecutar completo:

   `database/evidence-pipeline-v2.sql`

4. Ejecutar después:

   `database/evidence-pipeline-v2-readiness.sql`

5. Verificar:

   - `operation_ledger_ready = true`;
   - `claim_function_ready = true`;
   - `graph_function_ready = true`;
   - bucket `experience-media-v2`;
   - `public = false`;
   - columnas de adopción y Storage presentes.

No insertar datos de prueba desde SQL.

## Fase C. Primer deploy, todavía apagado

Variables Railway:

```text
EVIDENCE_PIPELINE_MODE=off
EVIDENCE_PIPELINE_V2_BUCKET=experience-media-v2
```

No configurar aún la lista canaria. Publicar el bloque completo una sola vez.

Después del deploy:

1. `/api/health` debe responder.
2. VibePWA V1 debe iniciar sesión.
3. Biblioteca, Bandeja, Activos y reportes deben seguir funcionando.
4. Con sesión autenticada, `/api/v2/status` debe mostrar:
   - `ready: true`;
   - `mode: off`;
   - todos los controles `ok: true`.

Si `ready` es falso, no continuar. Corregir la migración o configuración.

## Fase D. Activación canaria

Variables Railway:

```text
EVIDENCE_PIPELINE_MODE=canary
EVIDENCE_PIPELINE_CANARY_USERS=msusffalich@gmail.com
EVIDENCE_PIPELINE_V2_BUCKET=experience-media-v2
```

La cuenta exacta debe coincidir con el login de Supabase. Ningún otro usuario
puede escribir por V2.

## Fase E. Vibeapp canaria

Requisitos previos:

- V1 disponible;
- bandera móvil `evidencePipeline=v2`;
- cola durable;
- identificadores y fecha de captura estables.

Orden de prueba:

1. nota escrita suelta;
2. foto suelta;
3. audio suelto;
4. video corto suelto;
5. documento suelto;
6. historia creada después de sus archivos;
7. archivo llegado después de su historia;
8. archivo asociado a evento;
9. repetición de una operación;
10. captura sin señal, cierre de app y sincronización posterior.

## Fase F. Aceptación

Confirmar para cada activo:

- una fila en `assets`;
- un objeto en `experience-media-v2`;
- una operación durable;
- hora de captura conservada;
- ningún duplicado;
- Bandeja correcta para sueltos;
- Biblioteca correcta para adoptados;
- Activos coincide con ambas vistas;
- contexto fuera de Bandeja;
- ninguna experiencia incompleta declarada como lista.

## Reversión

Si falla cualquier criterio:

```text
EVIDENCE_PIPELINE_MODE=off
```

La reversión no borra V2 ni modifica V1. Las operaciones V2 quedan disponibles
para diagnóstico y recuperación. No eliminar manualmente activos u objetos.

## Paso a producción

`EVIDENCE_PIPELINE_MODE=on` solo después de:

- prueba física de iPhone/iPad;
- revisión de logs sin operaciones atascadas;
- validación de VibePWA;
- aprobación explícita de Miguel.

La retirada de V1 ocurre en otro release, después de una ventana de observación.
