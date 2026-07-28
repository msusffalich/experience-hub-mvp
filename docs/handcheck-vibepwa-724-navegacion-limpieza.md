# Handcheck VibePWA 724: navegación y limpieza

Versión: `20260728-product-navigation-724`

## Objetivo

Cerrar la navegación cotidiana como producto final sin cambiar datos,
sincronización, historias ni generación de documentos.

## Cambios

1. La navegación principal conserva exactamente seis espacios: Inicio,
   Historias, Evidencia, Inteligencia, Publicar y Cuenta.
2. La barra secundaria permanece oculta en las seis pantallas principales.
3. Agenda, Nueva historia, Línea de tiempo, Hallazgos, Mapa, Ayuda, Operación y
   Automatizaciones muestran una ruta corta para volver a su espacio padre.
4. Inicio incluye acceso directo a Agenda.
5. Historias incluye Nueva historia, Línea de tiempo y Mapa dentro de su propia
   pantalla.
6. Cuenta incluye Perfil, Privacidad, Ayuda, Automatizaciones, Operación y
   Salir.
7. El espacio activo expone `aria-current="page"`.
8. `docs/README.md` define la documentación canónica.

## Prueba funcional

1. Abrir Inicio: no debe aparecer una segunda barra de navegación.
2. Pulsar Ver Agenda: debe abrir Agenda y mostrar Volver a Inicio.
3. Volver a Inicio.
4. Abrir Historias: deben verse Nueva historia, Línea de tiempo y Explorar
   mapa.
5. Abrir Línea de tiempo: debe aparecer Volver a Historias y Nueva historia.
6. Abrir Cuenta: deben verse Ayuda, Perfil, Privacidad, Automatizaciones y
   Operación.
7. Abrir Operación: debe aparecer Volver a Cuenta.
8. Repetir el recorrido en ES, EN, FR y PT.

## Validación automatizada

- `node --check app.js`
- `node scripts/verify-product-shell.mjs`
- E2E local completo con auditoría visual
- `npm run verify:release`

El bloque no cambia rutas API, Supabase, Storage, Obsidian ni contratos de
Vibeapp.
