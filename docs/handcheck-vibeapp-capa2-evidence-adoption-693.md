# Handcheck Vibeapp -> VibePWA - Capa 2 Evidence Adoption - 693

Fecha: 2026-07-22
Origen: Codex PC / VibePWA
Destino: Claude MAC / Vibeapp
Version VibePWA: 20260722-evidence-adoption-693

## Objetivo

Separar captura y estructuracion sin perder sincronizacion:

- Vibeapp captura hechos rapidos en el momento.
- VibePWA estructura esos hechos en experiencias, eventos, reportes, publicaciones y mapa.
- La evidencia intencional puede nacer sin experiencia padre.
- La experiencia adopta evidencia despues, por ventana de tiempo y confirmacion humana.

## Cambios hechos en VibePWA/backend

1. Capture ahora muestra una Bandeja de evidencia accionable.
2. VibePWA sugiere evidencia sin padre usando la fecha/hora y duracion de la experiencia actual, con margen de 30 minutos.
3. El usuario puede seleccionar evidencia sugerida o pendiente.
4. La evidencia seleccionada se adopta solo al guardar la experiencia; autosave no adopta nada.
5. El backend agrega `POST /api/assets/adopt`.
6. El endpoint actualiza filas existentes de `assets`; no crea duplicados.
7. Al adoptar se registran `experience_id`, `participant_id`, `adoption_status`, `adopted_at`, `adoption_method`, `adoption_confidence` y metadata equivalente.

## Lo que Vibeapp debe enviar

Para evidencia sin experiencia padre:

```json
{
  "type": "media",
  "payloadType": "image|video|audio|document",
  "name": "archivo.ext",
  "capturedAt": "ISO-8601",
  "participantId": "grupo/persona activo si existe",
  "sourceDevice": "iphone|ipad|android|watch|glasses",
  "sourceId": "id estable del dispositivo o captura",
  "idempotencyKey": "estable por captura",
  "metadata": {
    "adoptionStatus": "inbox",
    "evidenceType": "intentional"
  }
}
```

Para experiencia o evento narrado:

```json
{
  "type": "experience",
  "title": "titulo humano",
  "timestamp": "ISO-8601",
  "duration": 30,
  "notes": "narrativa humana si existe",
  "participantId": "grupo/persona activo",
  "events": [
    {
      "title": "submomento",
      "timestamp": "ISO-8601",
      "narrativeText": "texto humano del evento si existe"
    }
  ]
}
```

## Reglas que no deben romperse

- Vibeapp no debe forzar crear experiencia antes de tomar foto, video, audio o archivo.
- Una foto/video sin voz humana no es narrativa; es evidencia.
- Audio o video con voz humana puede ser narrativa despues de transcripcion.
- Biometria, GPS, clima y noticias son contexto, no experiencias.
- La cuenta/Supabase sigue siendo la fuente unica de verdad.
- La agenda no debe crear experiencias por si sola; solo agenda eventos.

## Pruebas esperadas

1. En Vibeapp tomar foto sin experiencia activa.
2. Confirmar que VibePWA la muestra en Bandeja de evidencia como pendiente.
3. En VibePWA crear experiencia con rango que cubra la hora de la foto.
4. Seleccionar evidencia sugerida.
5. Guardar experiencia.
6. Confirmar que el activo queda `adoption_status = adopted` y `experience_id` poblado.
7. Confirmar en otro dispositivo que Libreria/Activos muestran la relacion.
8. Exportar Obsidian y confirmar que la evidencia queda referenciada, pero no se crea nota falsa.

## Pendiente deliberado

La curacion avanzada aun no borra evidencia automaticamente. Si una evidencia queda huerfana u obsoleta, el pipeline debe marcarla para revision; el borrado sigue siendo humano o una herramienta revisada.
