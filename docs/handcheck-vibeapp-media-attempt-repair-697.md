# Handcheck VibePWA 697 - reparacion de evidencia ya subida

Fecha: 2026-07-22
Responsable: Codex PC
Destino: Claude MAC / Vibeapp
Version VibePWA: `20260722-media-attempt-repair-697`

## Diagnostico

La foto de Vibeapp llego correctamente a `POST /api/media` y el servidor respondio 2xx limpio, pero VibePWA seguia mostrando:

```text
Bandeja de evidencia
0 en servidor
```

El arreglo 696 evita futuros falsos positivos, pero no necesariamente recupera fotos aceptadas antes de que existiera la fila consultable en `assets`.

## Cambio adicional aplicado en 697

`GET /api/assets` ahora repara automaticamente subidas previas:

1. Lee las filas reales de `assets`.
2. Lee `asset_upload_attempts`.
3. Busca intentos `uploaded` que tienen blob en Storage pero no tienen fila `assets`.
4. Reconstruye una evidencia intencional con:
   - `adoptionStatus: inbox`
   - `experienceId: null` si no venia experiencia padre
   - `targetLayer: evidence`
   - `storagePath` del intento original
5. Escribe la fila faltante en `assets`.
6. Devuelve esa evidencia en la respuesta de `/api/assets`.

Esto significa que al pulsar `Actualizar bandeja`, el servidor debe poder recuperar tambien fotos que Vibeapp ya habia subido antes de 696.

## Cambio de robustez futura

Los registros `asset_upload_attempts` ahora conservan mas metadata de adopcion:

- `participantId`
- `adoptionStatus`
- `targetLayer`
- `payloadType`
- `capturedAt`
- metadata original enviada por Vibeapp

## Pruebas locales

- `node --check server.js`: OK
- `npm run simulate:vibeapp`: OK
- `npm run audit:blueprint`: OK
- `npm run check`: OK

## Prueba post-deploy

1. Publicar 697.
2. Abrir:

```text
https://experience-hub-web-production.up.railway.app/index.html?v=20260722-media-attempt-repair-697&view=capture
```

3. Pulsar `Actualizar bandeja`.
4. Resultado esperado:
   - si habia fotos subidas antes, aparecen como evidencia pendiente;
   - si no aparecen, tomar una foto nueva desde Vibeapp y repetir;
   - si el servidor no puede escribir `assets`, Vibeapp debe recibir error explicito, no "Sincronizado" falso.

## Criterio de cierre

Cerrar cuando una foto de Vibeapp aparezca en `Bandeja de evidencia` como pendiente o cuando el servidor devuelva error real de persistencia. El estado `Sincronizado` + bandeja vacia ya no es aceptable.
