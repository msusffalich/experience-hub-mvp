# Current: sincronizacion de evidencia Vibeapp -> VibePWA

Estado: abierto
Fecha: 2026-07-22
Responsable principal: Codex PC

## Sintoma reportado

Vibeapp envia una foto al servidor, pero VibePWA muestra:

- Bandeja de evidencia: `0 en servidor`
- Activos: no confirma evidencia pendiente
- Libreria: no debe mostrar la foto hasta que sea adoptada por una experiencia

## Regla funcional

Una foto, video, audio o documento capturado por Vibeapp sin experiencia padre debe quedar como evidencia intencional pendiente:

- tabla destino: `assets`
- `adoption_status`: `inbox`
- `experience_id`: `null`
- visible en VibePWA: `Captura > Bandeja de evidencia`
- visible en Activos
- no visible en Libreria hasta adopcion

Si Vibeapp ya manda `linkedExperienceId`, entonces la evidencia puede quedar adoptada y no debe aparecer en la bandeja. Eso solo es valido cuando existe una experiencia padre real.

## Estado Codex PC

### Version local

`20260722-ingest-assets-inbox-695`

### Commits locales

- `97fbfdf Refresh evidence inbox from server`
- `6710ead Store ingested media as evidence assets`

### Cambios hechos

1. VibePWA refresca `/api/assets` al entrar a Captura.
2. VibePWA agrega boton `Actualizar bandeja`.
3. `/api/integration/ingest` ya no deja multimedia solo como `accepted_pending_media`.
4. Para payloads `media`, `image`, `audio`, `video`, `document`, el servidor llama:

`upsertAssetEvidence(buildAssetEvidenceFromIntegrationSignal(...))`

5. Se crea fila real en `assets` con `adoptionStatus: inbox` si no hay `linkedExperienceId`.
6. El simulador exige que ingest multimedia cree una fila `assets`.

### Pruebas locales

- `npm run check`: OK
- `npm run simulate:vibeapp`: OK
- `npm run audit:blueprint`: OK

### Bloqueo actual

El commit 695 esta local, pero esta sesion no pudo hacer `git push` a GitHub por red:

`Failed to connect to github.com port 443`

Si Railway todavia no corre 695, la bandeja seguira vacia aunque el codigo local este corregido.

## Solicitud a Claude/Codex MAC

Para cerrar sin especulacion, registrar en este archivo o en una nota de respuesta:

1. Version de Vibeapp probada.
2. Endpoint usado al enviar foto:
   - `/api/media`
   - o `/api/integration/ingest`
3. Status HTTP.
4. JSON de respuesta relevante:
   - `asset.id` o `results[0].asset.id`
   - `adoptionStatus`
   - `experienceId`
   - `sourceId`
   - `idempotencyKey`
5. Confirmar si Vibeapp mando `linkedExperienceId`.

## Prueba de aceptacion

Despues de deploy 695:

1. Enviar foto nueva desde Vibeapp sin experiencia padre.
2. Abrir VibePWA:

`/index.html?v=20260722-ingest-assets-inbox-695&view=capture`

3. Pulsar `Actualizar bandeja`.
4. Resultado esperado:

- Bandeja: `1 en servidor`
- aparece la foto
- se puede seleccionar
- al guardar experiencia, se adopta
- luego deja de estar pendiente

## Criterio de cierre

Cerrar solo si una foto nueva post-695 aparece en Bandeja y se adopta correctamente.
