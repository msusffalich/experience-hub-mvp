# NOTA CODEX WINDOWS -> MAC/CLAUDE

Fecha: 2026-06-08  
Frente: VibePWA  
Version objetivo: `20260608-vibepwa-clean-product-558`

## Objetivo del intercambio

Sincronizar que Windows avanzo una limpieza de producto en VibePWA antes de continuar con cambios de Vibeapp. Esta nota no reemplaza la version iOS 548/563 del frente movil; solo documenta el estado de VibePWA.

## Cambios aplicados en VibePWA

- Version/cache alineados en `app.js`, `index.html`, `service-worker.js` y `reset.html`.
- Navegacion de usuario simplificada:
  - Inicio
  - Capturar
  - Libreria
  - Archivos
  - Agenda
  - Reportes
  - Publicar
  - Hallazgos
  - Ayuda
  - Diagnostico
- Topbar limpia: se retiraron acciones operativas dispersas del encabezado.
- Controles tecnicos agrupados en Diagnostico.
- Privacidad movida desde el panel lateral a Diagnostico.
- Eliminado el bloque viejo lateral de privacidad para evitar IDs duplicados y acciones ambiguas.
- Lenguaje visible del avance global ajustado de MVP/piloto a producto:
  - Base operativa
  - Validacion de producto
  - Producto final
- Manual: primera seccion actualizada a VibePWA y lenguaje de producto.
- Centro de mando y avance global: textos visibles ajustados para hablar de producto, validacion y cierre operativo, no de MVP/piloto como estado vigente.

## Validaciones ejecutadas

- `npm.cmd run check`: OK
- `node --check app.js`: OK
- `node --check server.js`: OK
- `scripts/smoke-check.mjs`: OK
- `scripts/audit-runtime-helpers.mjs`: OK
- Verificacion HTTP local con `node server.js`: HTTP 200
- Verificacion de IDs duplicados en `index.html`: sin duplicados
- `npm.cmd run audit:control`: OK
- `npm.cmd run audit:blueprint`: OK

## Pendiente de limpieza controlada

Quedan modulos historicos no expuestos en la navegacion diaria:

- `timelineView`
- `experienceMapView`
- `automationView`

No se eliminaron todavia porque tienen dependencias directas en render, reportes, hallazgos y listeners. El siguiente paso correcto es desacoplarlos de forma controlada o reubicarlos como diagnostico/analitica avanzada, evitando borrar funciones que aun alimentan reportes.

## Regla para Mac/Claude

No mezclar este cambio con Vibeapp iOS/Android salvo que sea estrictamente necesario. Si Vibeapp necesita leer estado de producto, asumir que la PWA publica version 558 y que Diagnostico es el unico lugar para controles tecnicos.
