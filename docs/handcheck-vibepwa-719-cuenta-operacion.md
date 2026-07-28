# Handcheck VibePWA 719 - Cuenta y Operación

Fecha: 2026-07-27
Versión: `20260727-account-operation-719`

## Objetivo

Presentar Cuenta y Operación como espacios comprensibles para una persona
usuaria, manteniendo los controles avanzados disponibles sin exponerlos todos
al mismo tiempo.

## Cambios

- **Cuenta** sustituye el título técnico Acceso seguro.
- Si existe una sesión activa, se oculta el formulario de acceso.
- Se muestran correo, estado de sincronización, idioma y privacidad.
- Cuenta ofrece accesos a Perfil y dispositivos, Privacidad y respaldos, y
  Salir.
- Perfil y Privacidad abren el punto correspondiente de Operación.
- Todas las secciones operativas comienzan plegadas.
- Privacidad conserva texto legible y controles alineados en móvil.
- Los textos nuevos están definidos en ES, EN, FR y PT.

## Fuera de alcance

- No se modifican rutas de Vibeapp.
- No se modifica autenticación, Supabase ni sincronización.
- No se eliminan diagnósticos ni controles operativos; se organizan bajo
  demanda.

## Verificación automática

- `node --check app.js`
- `npm run verify:product-shell`
- `npm run verify:e2e` con auditoría visual
- `npm run check`
- `npm run verify:release`

La auditoría E2E debe confirmar:

1. el formulario de acceso queda oculto con sesión activa;
2. el resumen de Cuenta es visible;
3. Privacidad abre Operación;
4. ningún panel técnico se abre automáticamente;
5. no hay desbordamiento horizontal;
6. el texto de Privacidad conserva al menos 180 px de ancho en móvil.

## Prueba humana posterior al deploy

1. Abrir **Cuenta** con una sesión activa.
2. Confirmar que aparece el correo y no el formulario de contraseña.
3. Pulsar **Perfil y dispositivos** y confirmar que abre Operación en Perfil.
4. Volver a Cuenta y pulsar **Privacidad y respaldos**.
5. Confirmar que Privacidad aparece legible y que los demás temas siguen
   plegados.
6. Repetir en móvil y cambiar entre ES, EN, FR y PT.

## Resultado esperado

Cuenta sirve para orientarse y Operación para actuar cuando hace falta. El uso
diario deja de parecer un tablero técnico, sin perder ninguna capacidad.

## Resultado ejecutado

- `npm run check`: aprobado.
- `npm run verify:release`: aprobado.
- Auditoría visual E2E de Cuenta y Operación en escritorio y 390 x 844:
  aprobada.
- Seis PDFs, cuatro endpoints PDF, flujo operativo local y PWA: aprobados.
- Versión y caché verificadas: `20260727-account-operation-719`.
