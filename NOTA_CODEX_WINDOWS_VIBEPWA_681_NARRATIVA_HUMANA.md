# VibePWA 681 - cierre de narrativa humana para Obsidian

Fecha: 2026-07-21

## Decisión cerrada

Para el mapa de experiencia y las notas de Obsidian, `narrative: "ok"` significa únicamente que la experiencia tiene narrativa humana real:

- texto escrito por el usuario;
- nota manual escrita por el usuario;
- voz hablada por el usuario y transcrita.

No cuentan como narrativa humana:

- OCR de documentos o imágenes;
- traducciones automáticas;
- visión IA o captions de fotos;
- análisis multimodal automático;
- biometría;
- ubicación;
- clima, noticias o contexto externo;
- nombres de archivo o títulos técnicos de captura.

Estos datos siguen siendo valiosos, pero se exportan como evidencia, contexto o lectura automática.

## Cambios ejecutados

- `getExperienceNarrativeCandidates` dejó de usar OCR, captions, traducciones y análisis automático como narrativa.
- Se agregó `isHumanVoiceAsset` para aceptar transcripciones solo cuando el activo es audio/voz.
- El mapa de conocimiento ahora guarda primero las notas de experiencia.
- El mapa se calcula después, usando únicamente el conjunto real de notas guardadas.
- Las rutas, línea cronológica, backlinks y conteo de narrativa usan ese mismo conjunto guardado.
- Si las notas no se guardan completas, el mapa no se escribe.
- La versión queda normalizada como `20260721-obsidian-human-narrative-681`.

## Contrato congelado

El flujo Obsidian queda congelado con estas reglas:

- la ruta local debe ser una bóveda real con `.obsidian/`;
- no se escriben carpetas sueltas fuera de la bóveda;
- la exportación es atómica: notas primero, mapa después;
- VibePWA no borra automáticamente notas append-only;
- la zona humana se preserva al reexportar;
- el estado `learnings` se deriva de contenido humano real bajo `### Aprendizajes`;
- el mapa no inventa energía ni categoría si no hay fuente confiable.

## Siguiente bloque real

El siguiente trabajo no es seguir tocando el export. El cuello de botella está en captura: VibePWA debe pedir narración humana al guardar una experiencia, con campo de texto y botón de voz tipo "¿Qué pasó?".

