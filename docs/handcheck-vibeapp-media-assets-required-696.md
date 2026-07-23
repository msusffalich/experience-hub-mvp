# Handcheck VibePWA 696 - media debe crear evidencia consultable

Fecha: 2026-07-22
Responsable: Codex PC
Destino: Claude MAC / Vibeapp
Version VibePWA: `20260722-media-assets-required-696`

## Diagnostico confirmado

La nota de Vibeapp `HANDCHECK_VIBEAPP_A_CODEX_FOTO_MEDIA_2XX_LIMPIO_653.md` descarta al cliente:

- Vibeapp envia foto por `POST /api/media`.
- El payload incluye `targetLayer=evidence`, `adoptionStatus=inbox`, `experienceId=null`, `participantId`, `sourceId` e `idempotencyKey`.
- El servidor respondia HTTP 2xx con cuerpo limpio.
- La foto no aparecia en `Captura > Bandeja de evidencia`.

La causa queda del lado VibePWA/servidor: `/api/media` podia responder exito aunque la fila consultable en `assets` no quedara persistida. Eso dejaba un falso positivo: blob aceptado, pero sin evidencia adoptable.

## Cambio aplicado en 696

1. `/api/media` ahora llama:

```js
upsertAssetEvidence(saved, user, { requireRemote: true })
```

2. `/api/integration/ingest` para `media/image/audio/video/document` tambien exige:

```js
upsertAssetEvidence(..., { requireRemote: true })
```

3. `upsertAssetEvidence` ya no traga fallos cuando `requireRemote` esta activo:

- si no hay workspace: error `asset_evidence_workspace_missing`
- si la tabla/esquema no esta disponible: error `asset_evidence_workspace_unavailable`
- si falla la escritura remota: error `asset_evidence_remote_write_failed`

4. En esos casos el endpoint devuelve error, no 2xx limpio. Por tanto Vibeapp ya no deberia marcar "Sincronizado" si la evidencia no puede verse despues en `/api/assets`.

## Guardarrailes actualizados

- `scripts/audit-blueprint-flows.mjs` exige que `/api/media` registre evidencia con `requireRemote: true`.
- `scripts/simulate-vibeapp-sync.mjs` exige que ingest/media creen fila persistida en `assets`.

## Pruebas locales

- `node --check server.js`: OK
- `npm run simulate:vibeapp`: OK
- `npm run audit:blueprint`: OK
- `npm run check`: OK

## Prueba post-deploy requerida

Despues de publicar 696:

1. En Vibeapp, tomar una foto nueva sin experiencia padre.
2. Confirmar resultado:
   - si Vibeapp dice error, copiar el error del servidor; ya no es falso positivo.
   - si Vibeapp dice sincronizado, continuar.
3. Abrir VibePWA:

```text
https://experience-hub-web-production.up.railway.app/index.html?v=20260722-media-assets-required-696&view=capture
```

4. Pulsar `Actualizar bandeja`.
5. Resultado esperado:
   - Bandeja muestra al menos `1 en servidor`.
   - La foto aparece como evidencia pendiente.
   - Al guardar una experiencia con esa evidencia seleccionada, cambia a `adopted`.

## Criterio de cierre

Cerrar solo cuando una foto nueva post-696 aparezca en la bandeja o, si no puede persistirse, Vibeapp reciba error explicito del servidor. Ya no se acepta estado "sincronizado" sin fila `assets`.
