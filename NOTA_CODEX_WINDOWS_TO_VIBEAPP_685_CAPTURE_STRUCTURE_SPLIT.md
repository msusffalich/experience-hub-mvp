# Nota para Vibeapp - Build VibePWA 685

Fecha: 2026-07-22
Origen: Codex Windows / VibePWA
Destino: Codex Mac / Vibeapp
Estado: implementacion iniciada en VibePWA, pendiente de validar con captura real desde Vibeapp

## Decision de producto

El ecosistema queda separado en dos tiempos:

- Vibeapp captura hechos en el momento: texto, voz, foto, video, documento, ubicacion, biometria y contexto del dispositivo.
- VibePWA estructura historias despues: bandeja de evidencia, adopcion por tiempo, experiencias, eventos, reportes, publicaciones, hallazgos y Obsidian.

Esto no significa dos fuentes de verdad. La fuente de verdad sigue siendo Supabase/API. Vibeapp no debe mantener una experiencia paralela propia como verdad final.

## Cambios ya hechos en VibePWA 685

- Nuevo endpoint `GET /api/assets` para que la PWA lea evidencia intencional aun no adoptada en una experiencia.
- Captura muestra el bloque "Capturar ahora, estructurar despues".
- Captura muestra una "Bandeja de evidencia pendiente" con adjuntos locales y activos del servidor sin experiencia padre.
- Manual actualizado en ES/EN/FR/PT con la separacion capturar vs estructurar.
- Documento operativo creado: `docs/vibeapp-capture-structure-handoff-20260722.md`.

## Lo que debe enviar Vibeapp

Para evidencia intencional sin experiencia padre:

- Fotos, videos, audios y documentos se suben como activos.
- Deben conservar `capturedAt`, `participantId`, `sourceDevice`, `sourceType`, `payloadType`, `idempotencyKey`.
- Si todavia no hay experiencia padre, enviar `experienceId` vacio o nulo y `adoptionStatus: "inbox"`.
- Si es una narrativa humana hablada o escrita, marcar `targetLayer: "experience_candidate"` o `targetLayer: "event_candidate"`, segun el gesto usado.

Para contexto ambiente:

- Biometria, ubicacion, clima, noticias y entretenimiento no son experiencias.
- Se envian como contexto consultable por fecha/hora.
- No deben crear notas de experiencia ni publicaciones por si solos.

## Endpoints vigentes

- Binarios multimedia: `POST /api/media`.
- Ingesta estructurada movil/contexto: `POST /api/integration/ingest`.
- Experiencia canonica cuando el usuario decide armar historia: `POST /api/experiences`.
- Participantes/grupos: `GET /api/mobile/participants`.
- Evidencia visible para adopcion en PWA: `GET /api/assets`.

## Validacion esperada

1. Capturar una foto en Vibeapp sin crear experiencia.
2. Confirmar que aparece en VibePWA como evidencia pendiente, no como experiencia.
3. Capturar una nota de voz narrativa.
4. Confirmar que VibePWA puede usarla para crear o enriquecer una experiencia.
5. Subir biometria/contexto.
6. Confirmar que aparece como contexto del panel/reportes, no como nota narrativa.
7. Crear una experiencia en VibePWA con rango de tiempo.
8. Confirmar que la evidencia dentro del rango queda disponible para adopcion.

## Protocolo de regreso

Al devolver cambios desde Mac, incluir:

- Build exacto de Vibeapp.
- Capturas o logs de cada flujo validado.
- Payload real de ejemplo para foto, audio, video, biometria y ubicacion.
- Resultado de cola offline/reintento.
- Lista de endpoints usados y respuesta HTTP.
- Si algo queda pendiente, indicar si es UI, API, permisos iOS o dato de prueba.

