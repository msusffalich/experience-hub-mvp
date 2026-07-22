# VibePWA 681 - definicion de narrativa humana

Fecha: 2026-07-21

## Contrato congelado

Documento de referencia unico. VibePWA, Claude y el humano trabajan contra esta definicion. No se relitiga: si aparece un caso nuevo, se clasifica con el discriminador de abajo.

## La regla en una frase

Narrativa = lenguaje del humano que cuenta que vivio. El contenedor no decide nada: texto, audio, video, foto o documento pueden participar. Decide el origen del significado.

## El discriminador

- Si cuenta que viviste un momento, es narrativa. Va a `02_Experiences` y puede marcar `narrative: ok`.
- Si es algo que produjiste o recogiste, como paper, informe o fuente, es artefacto. Va a `40_Publications`, `50_Reference` o como activo adjunto.
- Si lo derivo la maquina de un activo, o es metadato de captura, es contexto/evidencia. Va como adjunto o senal contextual y no alimenta `narrative`.

Una experiencia puede tener las tres cosas: relato humano, artefacto adjunto y contexto de ese momento.

## Si cuenta como narrativa humana

- Texto que escribes describiendo que paso.
- Voz que hablas y queda transcrita a texto.
- Video narrado: la pista de voz transcrita cuenta como narrativa; la imagen del video queda como activo/contexto.
- Nota manual agregada a un activo, si realmente explica que viviste.

Regla operativa para audio y video: se transcribe la voz y se aplica al texto resultante el mismo test de una nota escrita.

## No cuenta como narrativa humana

### Contexto o evidencia

- Descripcion por vision IA de una foto.
- OCR de documento, menu, cartel o imagen.
- Video sin narracion humana.
- Biometria, ubicacion, clima, noticias, ambiente o metadatos.

Esto puede enriquecer la experiencia, pero no crea narrativa por si solo.

### Artefacto

- Paper, informe, ensayo, documento o fuente escrita por el usuario sobre un tema.
- Si existe una reflexion humana sobre haber producido ese artefacto, esa reflexion si es narrativa y el artefacto queda como adjunto.

### Marcador tecnico o relleno

- Nombre de archivo.
- Placeholder: "Narrativa pendiente", "Sin resumen narrativo suficiente".
- Boilerplate tecnico o estado MVP.
- Etiqueta suelta que no relata un momento, por ejemplo "celebracion".

## Casos cerrados

- Foto descrita por IA: contexto, no narrativa.
- Video narrado: narrativa por su voz transcrita.
- Video sin voz: evidencia.
- Paper sin reflexion vivencial: artefacto.
- Paper con reflexion de haberlo escrito: reflexion narrativa + paper adjunto.
- Nota de voz: narrativa.
- Biometria, ubicacion y ambiente: contexto.

## Cambios ejecutados

- `getExperienceNarrativeCandidates` dejo de usar OCR, captions, traducciones, resumenes genericos y analisis automatico como narrativa.
- Se agrego `isHumanVoiceAsset` para aceptar transcripciones solo cuando el activo es audio/voz.
- El mapa de conocimiento ahora guarda primero las notas de experiencia.
- El mapa se calcula despues, usando unicamente el conjunto real de notas guardadas.
- Las rutas, linea cronologica, backlinks y conteo de narrativa usan ese mismo conjunto guardado.
- Si las notas no se guardan completas, el mapa no se escribe.
- La version queda normalizada como `20260721-obsidian-human-narrative-681`.

## Consecuencia operativa

`narrative: ok` si y solo si existe lenguaje humano con contenido real. Todo lo demas queda `pending` o se trata como contexto/evidencia. El conteo "narrativa real" del mapa usa esta misma funcion sobre las notas exportables de `02_Experiences`.

La exportacion queda congelada: path, atomicidad, cero borrado automatico, zona humana preservada y contexto clasificado. No hay mas rondas de reglas de export.

## Taxonomia de dominios aplicada

La tabla de `90_System/tabla-dominios-y-narrativa.md` queda incorporada como criterio operativo para VibePWA:

- Categorias narrativas principales: `Trabajo`, `Viajes / Paseos`, `Aprendizaje`, `Social`, `Entretenimiento`, `Creatividad`, `Espiritualidad` y `Salud` cuando describe un evento vivido.
- `Hogar` deja de operar como categoria narrativa principal. Se trata como lugar/contexto: una experiencia puede ocurrir en casa, pero la categoria debe describir que paso.
- `Bienestar` deja de operar como categoria narrativa principal. Se trata como dimension/estado, igual que energia, calma, estres o recuperacion.
- La biometria de `Salud` es contexto de sensor; no crea experiencia por si sola.
- `Compras` es categoria debil: solo cuenta como experiencia si hay vivencia, decision, aprendizaje, emocion o contexto humano. Una compra rutinaria queda como log o evidencia.

Cambios aplicados en VibePWA:

- `Hogar` ya no aparece en la lista principal de categorias seleccionables.
- Las experiencias historicas con `Hogar` se normalizan como `Social` para evitar notas vacias, manteniendo el lugar real en el campo de ubicacion.
- `Bienestar` se normaliza como `Salud` cuando llega desde agenda o datos antiguos, pero el manual aclara que su uso correcto es dimension/estado.
- La inferencia por texto ya no crea categoria `Hogar` por palabras como casa u hogar.
- Agenda personal ya no cae por defecto en `Hogar`; usa una categoria narrativa revisable.

## Siguiente bloque real

El trabajo siguiente es captura: VibePWA debe pedir narracion humana al guardar una experiencia, con campo de texto y boton de voz tipo "Que paso?".
