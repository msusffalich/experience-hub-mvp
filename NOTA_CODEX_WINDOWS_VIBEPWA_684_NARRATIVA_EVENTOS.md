# NOTA CODEX WINDOWS VIBEPWA 684 - Narrativa en dos niveles

Fecha: 2026-07-22
Version: `20260722-event-narrative-rollup-684`

## Objetivo

Cerrar el matiz de narrativa humana a nivel de experiencia y a nivel de evento, sin reabrir el contrato de exportacion Obsidian.

## Decision funcional

- Una experiencia narra el episodio completo.
- Un evento puede narrar un submomento dentro de una experiencia larga.
- Un evento narrado sigue siendo evento; solo se promueve a experiencia si el usuario lo decide durante curacion.
- Una experiencia cuenta como narrada si tiene narrativa propia o si al menos uno de sus eventos tiene narrativa humana real.
- La metrica "narrativa real" cuenta experiencias narradas, no textos sueltos ni cantidad de eventos narrados.

## Cambios implementados

- VibePWA normaliza eventos con `narrativeText` y `narrativeStatus`.
- La regla `getExperienceNarrativeStatus()` ahora usa rollup: experiencia con relato propio o evento narrado.
- Las notas Obsidian muestran la narrativa del evento dentro de `## Eventos internos` cuando existe.
- El mapa sigue calculando narrativa sobre notas guardadas; al cambiar el frontmatter por rollup, el conteo queda alineado con notas exportables.
- Backend normaliza narrativa de evento y la conserva en `metadata.event`.
- Backend intenta escribir `experience_events.narrative_text` y `experience_events.narrative_status`; si Supabase aun no tiene esas columnas, reintenta sin romper el guardado y mantiene el dato en metadata.
- Manual de VibePWA actualizado en español e ingles.
- Contrato Vibeapp/VibePWA y blueprint de captura actualizados.

## SQL recomendado

Aplicar en Supabase cuando se quiera tener columnas consultables para eventos narrados:

`database/event-narrative-rollup.sql`

Es aditivo y seguro de reejecutar.

## Pendiente de producto

La UI de captura aun debe implementar el gesto humano para narrar un evento especifico dentro de una experiencia abierta. El modelo y la sincronizacion quedan preparados; la pantalla vendra en el bloque de rediseño de captura/adopcion.

## Prueba esperada

1. Crear una experiencia sin narrativa global.
2. Crear un evento interno con `narrativeText` humano real.
3. Exportar a Obsidian.
4. Confirmar que la nota queda con `narrative: "ok"`.
5. Confirmar que la narrativa aparece bajo `## Eventos internos`.
6. Confirmar que el mapa cuenta esa experiencia como una experiencia narrada, no como varios fragmentos.
