# Handcheck VibePWA 725 - modulo de producto

Fecha: 2026-07-28
Version: `20260728-product-shell-module-725`
Responsable: Codex PC

## Objetivo

Reducir acoplamiento tecnico sin cambiar datos, rutas de Vibeapp, persistencia ni
comportamiento funcional. Limpiar el flujo normal de Operacion sin destruir
trazabilidad historica que todavia tiene consumidores.

## Cambios realizados

1. Se creo `product-shell.js` como unico propietario de:
   - validacion del contrato DOM de una vista;
   - resolucion del espacio principal de cada herramienta;
   - activacion visual y `aria-current`;
   - navegacion contextual y retorno al espacio padre.
2. `app.js` conserva la orquestacion y delega la navegacion al modulo.
3. `product-shell.js` carga antes de `app.js` y usa la misma version de release.
4. El service worker trata `product-shell.js` como archivo de red sin cache
   obsoleta, igual que `app.js`, `styles.css` e `index.html`.
5. Los controles historicos de validacion se movieron a:
   `Cuenta > Operacion > Diagnostico avanzado > Registro historico de validacion`.
6. Los paneles de Sincronizacion, Grupos y Calidad quedaron dedicados al producto
   operativo actual.

## Decision de limpieza

No se borraron los paneles internos cuyos identificadores contienen `pilot` o
`mvp`. La auditoria encontro listeners, renderizadores, exportaciones y datos
persistidos que todavia los consumen. Borrarlos en este bloque habria roto
Operacion.

Su ubicacion visible si cambio: quedaron fuera del flujo cotidiano, cerrados por
defecto y rotulados como registro historico. Una eliminacion posterior exige
prueba de cero consumidores y migracion de cualquier dato persistido.

## Controles agregados

- `npm run check` valida sintaxis de `product-shell.js`.
- `scripts/smoke-check.mjs` verifica carga/version/cache del modulo.
- `scripts/verify-product-shell.mjs` verifica contrato, orden de carga y
  delegacion desde `app.js`.
- `scripts/audit-control.mjs` verifica que el modulo forme parte del release.
- `scripts/verify-pwa-release.mjs` verifica el modulo en la compuerta PWA.

## Criterios de aceptacion

- Se mantienen exactamente seis espacios principales.
- Una herramienta secundaria abre y regresa a su espacio padre.
- Cambiar de vista conserva URL, titulo, render diferido y estado.
- Cuenta y Operacion siguen accesibles.
- Los controles historicos no aparecen en el flujo normal.
- No cambia ningun endpoint, tabla, payload, clave local o contrato Vibeapp.
- La verificacion completa de release queda verde.
