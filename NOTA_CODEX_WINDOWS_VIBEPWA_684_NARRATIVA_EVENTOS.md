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
- Manual de VibePWA actualizado en espanol e ingles.
- Contrato Vibeapp/VibePWA y blueprint de captura actualizados.

## Estado de validacion

684 queda validado en codigo, SQL, contrato Obsidian, auditoria de blueprint e integracion simulada.

No queda validado aun con dato real de usuario porque la UI actual no permite crear honestamente el caso necesario: experiencia sin narrativa global, con un evento interno narrado por voz o texto. No se debe fingir ese test con datos fabricados.

La validacion real queda diferida al bloque de limpieza de captura: `capturar != estructurar`.

## SQL recomendado

Aplicar en Supabase cuando se quiera tener columnas consultables para eventos narrados:

`database/event-narrative-rollup.sql`

Es aditivo y seguro de reejecutar.

## Pendiente de producto

La UI de captura aun debe implementar el gesto humano para narrar un evento especifico dentro de una experiencia abierta. El modelo y la sincronizacion quedan preparados; la pantalla vendra en el bloque de rediseno de captura/adopcion.

La decision de producto es separar dos flujos que ocurren en tiempos diferentes:

1. Captura de hechos en el momento: narrativas fragmentarias, fotos, videos, audios, documentos, notas rapidas, ubicacion y contexto de dispositivo. Este flujo debe ser barato, rapido y puede quedar sin experiencia padre.
2. Armado de historias: revisar lo capturado, crear o confirmar experiencias, definir rango de tiempo, promover eventos, adoptar evidencia y completar narrativa global o de evento.

No deben ser una sola pantalla ni un solo paso obligatorio, porque la secuencia real no coincide: primero suelen aparecer los hechos; la experiencia se entiende despues.

Orientacion por plataforma:

- Vibeapp captura primero. Es la superficie principal para hechos del momento: voz, texto rapido, camara, video, audio, archivos, ubicacion, biometria, wearables y contexto movil.
- VibePWA estructura primero. Es la superficie principal para revisar bandeja de evidencia, armar experiencias, promover eventos, adoptar evidencia, analizar, reportar, publicar y exportar a Obsidian.
- No es una frontera rigida. Vibeapp puede cerrar una experiencia simple si el usuario lo pide, y VibePWA puede crear una experiencia manual completa en desktop. Pero la UI principal de cada plataforma debe respetar su rol.

Regla de dueno unico:

- La experiencia canonica vive en backend/Supabase.
- Vibeapp y VibePWA pueden originar o actualizar una experiencia, pero siempre contra el mismo registro canonico.
- Las colas locales son transporte y resiliencia, no una segunda verdad del producto.
- Los blueprints no deben divergir: `docs/capture-adoption-blueprint-20260721.md` manda para implementacion; la version de Obsidian en `90_System` es el espejo conceptual para trabajo de conocimiento.

El proximo bloque debe separar tres gestos operativos:

1. Capturar evidencia rapida, barata y sin padre obligatorio.
2. Marcar experiencia con rango, grupo/persona y narrativa humana.
3. Narrar evento dentro de una experiencia abierta, sin promoverlo automaticamente.

## Prueba esperada

1. Crear una experiencia sin narrativa global.
2. Crear un evento interno con `narrativeText` humano real.
3. Exportar a Obsidian.
4. Confirmar que la nota queda con `narrative: "ok"`.
5. Confirmar que la narrativa aparece bajo `## Eventos internos`.
6. Confirmar que el mapa cuenta esa experiencia como una experiencia narrada, no como varios fragmentos.
