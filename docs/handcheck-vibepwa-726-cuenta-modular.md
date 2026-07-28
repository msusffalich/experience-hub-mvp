# Handcheck VibePWA 726 - Cuenta modular

Fecha: 2026-07-28
Version: `20260728-account-shell-module-726`
Responsable: Codex PC

## Objetivo

Extraer la presentacion estable de Cuenta sin mover autenticacion, tokens,
sincronizacion, privacidad, Supabase ni persistencia fuera de `app.js`.

## Contrato

`account-shell.js` recibe un modelo ya autorizado y solo puede:

- renderizar el resumen de una cuenta conectada;
- renderizar la introduccion de una cuenta desconectada;
- resolver acciones permitidas hacia Ayuda, Operacion, Privacidad, Perfil y
  Automatizaciones;
- devolver la accion explicita de salida a `app.js`.

El modulo no conoce `access_token`, `refresh_token`, `apiRequest`, `localStorage`
ni funciones de escritura.

## Cambios

1. Cuenta ya no construye su HTML principal dentro de `app.js`.
2. El mapa de destinos de Cuenta vive en un contrato inmutable.
3. Los textos siguen definidos en ES, EN, FR y PT desde la capa de idioma.
4. Los valores dinamicos se escapan dentro del modulo antes de insertarse.
5. `product-shell.js`, `account-shell.js` y `app.js` cargan en ese orden.
6. Los tres archivos evitan cache obsoleta mediante la politica de red del
   service worker.

## Verificacion agregada

- `node --check account-shell.js`
- `npm run verify:account-shell`
- smoke check de version, carga y cache
- auditoria de control de release
- verificacion PWA

## Criterios de aceptacion

- Una cuenta conectada muestra correo, idioma, privacidad y estado de conexion.
- Perfil, Privacidad, Ayuda, Automatizaciones y Operacion abren su destino.
- Salir sigue controlado por `app.js`.
- Una cuenta desconectada conserva el formulario y la orientacion inicial.
- Cuenta funciona en los cuatro idiomas.
- No cambia ningun contrato de Vibeapp, servidor, Supabase ni datos locales.
