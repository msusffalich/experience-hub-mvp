# VibePWA 683 - Validacion blueprint captura, adopcion y evidencia

Fecha: 2026-07-21  
Estado: validacion tecnica y contrato de implementacion

## Veredicto

El blueprint es viable y corrige la causa raiz del problema del mapa: una evidencia o una senal de contexto no debe convertirse automaticamente en experiencia.

La base actual ya soporta una parte importante: `assets.experience_id` y `assets.event_id` son opcionales, por lo que un activo puede nacer sin experiencia padre. Sin embargo, el flujo actual no esta completamente alineado porque `/api/integration/ingest` todavia convierte contexto ambiente en experiencias `ctx-*`.

## Jerarquia aceptada

1. Persona: dueno de cuenta y grupo/persona seleccionada.
2. Experiencia: episodio vivido con rango de tiempo, sentido y narrativa humana.
3. Evento: submomento opcional dentro de una experiencia.
4. Evidencia / dato:
   - Evidencia intencional: foto, audio, video, documento, nota rapida.
   - Contexto ambiente: biometria, GPS, clima, noticias, entretenimiento, senales del dispositivo.

## Cambio de registro requerido

### Antes

- Texto validado puede crear experiencia.
- Agenda crea evento de agenda.
- Multimedia queda pendiente por `/api/media`.
- Contexto de salud, actividad, sueno, ubicacion o clima puede terminar como experiencia tecnica `ctx-*`.

### Despues

- Texto o voz humana con intencion narrativa puede crear experiencia.
- Foto, video, audio, documento o nota rapida sin experiencia activa entra a bandeja de evidencia en `assets` con `adoption_status = inbox`.
- Contexto ambiente se guarda en `context_signals`, no en `experiences`.
- Una experiencia nueva adopta evidencia por ventana de tiempo/persona/lugar.
- El contexto ambiente no se adopta ni se borra; se referencia por tiempo.

## Esquema propuesto

Se agrega `database/evidence-adoption-context-signals.sql`.

Cambios principales:

- `assets.evidence_type`: `intentional`, `ambient_snapshot`, `reference`, `generated`.
- `assets.adoption_status`: `inbox`, `adopted`, `suggested`, `ignored`, `pruned`, `context_reference`.
- `assets.adopted_at`, `adoption_method`, `adoption_confidence`.
- `context_signals`: tabla nueva para biometria, ubicacion, clima, noticias, entretenimiento y contexto de dispositivo.

## Endpoints a ajustar en el siguiente bloque

- `POST /api/integration/ingest`
  - `text`, `voice_transcript`, `narrative` con gesto de experiencia: `experiences`.
  - `image`, `video`, `audio`, `document`, `file`: `assets` en bandeja si no traen `experienceId`.
  - `biometric`, `activity`, `sleep`, `location`, `weather`, `news`, `entertainment`: `context_signals`.
- `POST /api/media`
  - Debe aceptar carga binaria sin `experienceId`.
  - Si llega `experienceId`, queda adoptado.
  - Si no llega, queda `inbox`.
- `POST /api/experiences`
  - Debe aceptar `startedAt`, `endedAt` o `occurredAt + duration`.
  - Al crear/actualizar experiencia puede adoptar activos de la ventana.
- Nuevo:
  - `GET /api/evidence/inbox`
  - `POST /api/experiences/:id/adopt-evidence`
  - `GET /api/context/window`

## Impacto en UI/UX

La captura debe separar dos gestos:

1. Capturar evidencia: rapido, sin obligar a definir experiencia.
2. Marcar experiencia: narrativa humana + rango de tiempo + adopcion sugerida.

La pantalla no debe mostrar una foto o GPS como experiencia. Debe mostrar:

- "Evidencia pendiente de organizar".
- "Contexto disponible para cruzar por fecha/hora".
- "Experiencia sugerida por ventana de tiempo".

## Impacto en Obsidian

Obsidian recibe solo experiencias narrativas y sus referencias. No recibe:

- Biometrics/GPS/clima como nota de experiencia.
- Fotos o documentos sin narrativa como experiencias falsas.

Las evidencias intencionales se enlazan desde la experiencia cuando fueron adoptadas. El contexto ambiente se resume como snapshot, sin destruir la serie original.

## Riesgos si no se cambia

- Fotos, ubicaciones o biometria seguiran creando nodos falsos.
- El conteo de narrativa nunca cuadrara.
- La boveda de Obsidian volvera a mezclar experiencias reales con activos.
- Reportes y hallazgos podran inferir patrones sobre datos que no son episodios vividos.

## Plan de implementacion recomendado

1. Aplicar la migracion `database/evidence-adoption-context-signals.sql` en Supabase.
2. Modificar `/api/integration/ingest` para guardar contexto en `context_signals`.
3. Modificar `/api/media` para soportar activos sin experiencia padre.
4. Agregar bandeja de evidencia en VibePWA.
5. Agregar adopcion por ventana al crear experiencia.
6. Actualizar Vibeapp para distinguir:
   - captura rapida de evidencia;
   - cierre/marcado de experiencia;
   - contexto ambiente continuo.
7. Actualizar manuales y pruebas E2E.

## Decision

El cambio es viable y necesario. No debe implementarse como filtro visual: debe cambiar el contrato de escritura para que la base de datos deje de crear experiencias falsas desde evidencia o contexto.
