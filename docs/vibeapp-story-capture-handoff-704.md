# Encargo Vibeapp: captura de hechos y relatos

Fecha: 2026-07-23  
Destino: Claude MAC / Vibeapp  
Origen: Codex PC / VibePWA  
Contrato relacionado: `vibeapp-capture-structure-handoff-20260722.md`,
`capture-adoption-blueprint-20260721.md`,
`story-curation-operations-20260723.md`

## Decision de producto

Vibeapp es la interfaz nativa para capturar lo que ocurre en el momento.
VibePWA es la interfaz amplia para estructurar, curar y analizar la memoria.
Ambas escriben en el mismo backend/Supabase; no existen copias independientes
de experiencias.

## Alcance que Vibeapp debe implementar

### Capturar hecho, sin padre obligatorio

La accion principal movil debe permitir texto, voz, foto, video, audio,
documento, ubicacion y senales de dispositivo sin obligar a definir una
experiencia antes.

- Foto, video, audio y documento binarios: `POST /api/media`.
- Evidencia sin `experienceId`: debe quedar en `assets` con
  `adoptionStatus: inbox`.
- Texto o voz humana: `POST /api/integration/ingest`, con identificadores
  estables y hora de captura.
- Biometria, ubicacion, clima, noticias, actividad y sueno: contexto por
  `/api/integration/ingest`; nunca experiencia.
- Agenda: `targetLayer: agenda`; nunca experiencia ni evento vivido.

Todo envio conserva `sourceId`, `idempotencyKey`, `capturedAt`,
`participantId`, `sourceDevice` y el estado de la cola local.

### Marcar experiencia breve o activa

Vibeapp puede crear o cerrar una experiencia cuando el usuario lo decide
expresamente. Debe pedir un relato humano por texto o voz: que ocurrio, no solo
un titulo ni nombre de archivo.

Campos minimos:

- titulo humano;
- hora/rango;
- grupo/persona;
- categoria solo si es actividad vivida;
- `notes` o narrativa humana;
- eventos internos opcionales.

### Evento narrado dentro de una experiencia abierta

Vibeapp puede agregar un evento a una experiencia abierta. Cada evento debe
usar un ID estable y, cuando haya relato humano, enviar:

```json
{
  "id": "event-local-stable-id",
  "title": "Momento con sentido",
  "timestamp": "ISO-8601",
  "narrativeText": "Lo que la persona conto que vivio",
  "sourceType": "voice_transcript|manual_note",
  "sourceDevice": "iPhone|iPad|Android"
}
```

`narrativeText` no puede ser OCR, vision IA, biometria, GPS, clima, un nombre
de archivo ni un texto de relleno.

## Lo que Vibeapp no debe implementar

No agregar en la interfaz movil:

- fusionar o dividir historias;
- mover o soltar evidencia entre varias historias;
- promover/degradar entre historia y evento;
- borrar evidencia durante una reorganizacion;
- operar el Mapa de experiencias u Obsidian.

Esas acciones requieren comparacion, rango temporal y confirmacion amplia. Son
responsabilidad de `Libreria > Organizar` en VibePWA.

## UI movil requerida

Dos gestos principales, con lenguaje final y sin controles tecnicos:

1. `Capturar ahora`: captura rapida; confirma que se guardo o que queda en cola.
2. `Marcar experiencia`: abre relato, rango, grupo/persona y eventos opcionales.

Si hay una experiencia activa, Vibeapp puede ofrecer `Agregar momento` y
`Cerrar experiencia`. La cola solo debe mostrar `Listo`, `Sincronizando` o
`Requiere accion`, junto con un motivo entendible.

## Criterios de aceptacion para devolver a Codex PC

1. Foto sin experiencia -> Bandeja de evidencia VibePWA.
2. Nota de voz con relato -> experiencia o evento narrado con
   `narrativeText` real.
3. Evento narrado dentro de experiencia -> VibePWA/Obsidian aplican rollup de
   narrativa a la experiencia.
4. Biometria y ubicacion -> contexto, no experiencia.
5. Agenda -> solo Agenda.
6. Sin red, reiniciar, recuperar red -> cola reintenta con los mismos IDs y no
   duplica registros.
7. Grupo/persona seleccionado en Vibeapp llega a evidencia, contexto, evento y
   experiencia.

## Respuesta requerida de Claude MAC

Devolver en el handcheck:

- version/build y dispositivos probados;
- endpoints y payloads anonimizados usados;
- capturas de `Capturar ahora`, `Marcar experiencia` y cola;
- resultado de los siete criterios de aceptacion;
- cualquier bloqueo real de iOS/Android que requiera una decision de producto.
