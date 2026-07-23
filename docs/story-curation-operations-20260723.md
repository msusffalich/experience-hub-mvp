# Curacion de historias y evidencia

Fecha: 2026-07-23  
Estado: contrato de producto aprobado  
Relacion: `capture-adoption-blueprint-20260721.md`

## Proposito

Una experiencia no queda congelada por la primera interpretacion del usuario.
Vibe conserva el registro de lo ocurrido y permite cambiar la historia que lo
organiza sin convertir evidencia, contexto o archivos tecnicos en experiencias
falsas.

La jerarquia es:

`Persona -> Experiencia -> Evento -> Evidencia intencional`

El contexto ambiente (biometria, GPS, clima y noticias) no se adopta como un
archivo narrativo. La experiencia lo referencia por su rango temporal.

## Distinciones obligatorias

| Accion | Que cambia | Que no cambia |
| --- | --- | --- |
| Editar historia | Titulo, relato, categoria, rango, lugar o personas | La trazabilidad del registro |
| Adoptar o soltar evidencia | El vinculo entre una historia y una foto, audio, video o documento | El archivo fuente |
| Borrar evidencia | El archivo y sus referencias, con confirmacion expresa | No aplica |
| Reorganizar historias | El alcance de experiencias y eventos | El registro de la operacion |
| Revisar contexto | La vista de biometria, GPS, clima o noticias en la historia | El flujo continuo de contexto |

## Operaciones validas

### Editar una experiencia

Es valido corregir el relato, titulo, categoria de actividad, fecha, rango de
tiempo, lugar, personas, estado o proposito. La edicion debe conservar el
identificador de la experiencia y registrar `updatedAt`.

### Adoptar, soltar o mover evidencia

- Agregar una foto, audio, video o documento la vincula como evidencia
  intencional.
- Quitarla de una experiencia la devuelve a la Bandeja de evidencia. No borra
  el archivo.
- Moverla a otra experiencia cambia el vinculo; no duplica el binario.
- Borrar definitivamente un archivo es una accion distinta, con confirmacion y
  advertencia de las historias afectadas.

### Fusionar experiencias

Es valido cuando dos historias describen el mismo episodio. La operacion debe:

1. Pedir una experiencia principal.
2. Mostrar antes de confirmar el relato, fechas, eventos y evidencia que se
   combinaran.
3. Unir los rangos temporales y conservar los eventos y adjuntos sin
   duplicarlos.
4. Marcar la experiencia secundaria como `merged` con referencia a la
   principal; nunca eliminarla silenciosamente.

### Dividir una experiencia

Es valido cuando un episodio largo contiene historias independientes. La
operacion crea dos o mas experiencias por rango temporal y permite asignar
eventos y evidencia a cada una. La evidencia no asignada vuelve a Bandeja de
evidencia para revision.

### Promover o degradar eventos

- Un evento puede promoverse a experiencia cuando sostiene una historia propia.
- Una experiencia puede degradarse a evento cuando se entiende como parte de
  otra historia mayor.
- Un evento puede tener narrativa propia. Una experiencia cuenta como narrada
  si tiene relato humano o si alguno de sus eventos lo tiene.

## Operaciones no validas

- Una foto, un nombre de archivo, OCR, vision IA, biometria, GPS o clima no
  crean una experiencia sin un relato humano.
- No se borra biometria, GPS, clima o noticias porque no aporten a una historia
  actual. Se deja de referenciar el contexto, pero se preserva el flujo fuente.
- No se reemplaza una experiencia curada por una exportacion automatica.
- Hogar no es una categoria de experiencia nueva: es lugar. Bienestar no es una
  categoria nueva: es una dimension o estado. Salud solo es experiencia cuando
  describe un evento vivido; sus mediciones son contexto. Compras requiere una
  vivencia o decision relevante, no un registro rutinario.

## Estado actual

## Alcance por producto

### Vibeapp: captura, no curaduria extensa

Vibeapp prioriza el momento vivido y la captura confiable en telefono o tableta.
Puede crear evidencia sin padre, capturar voz, texto, foto, video, ubicacion y
sensores, y cerrar una experiencia breve o agregar un evento a una experiencia
abierta. Tambien muestra el estado de sincronizacion.

No es el lugar para fusionar historias, dividir rangos, reorganizar evidencia
entre varias experiencias, borrar archivos ni operar el mapa. Esas operaciones
requieren pantalla, comparacion y confirmacion, y pertenecen a VibePWA.

### VibePWA: estructurar y curar

VibePWA organiza la bandeja de evidencia, adopta, suelta o mueve adjuntos,
revisa y edita historias, fusiona o divide experiencias, promueve o degrada
eventos, revisa contexto y produce reportes, publicaciones y mapa. Las dos
interfaces escriben en la misma base de datos y nunca mantienen copias
independientes de una experiencia.

Disponible hoy:

- Crear una historia con o sin evidencia inicial.
- Editar una experiencia desde Libreria.
- Adjuntar evidencia posteriormente a la misma experiencia.
- Adoptar evidencia suelta desde la Bandeja de evidencia.
- Soltar evidencia a la Bandeja o moverla a otra historia desde Libreria.
- Fusionar historias, dividir una historia por un momento elegido, promover un
  evento y degradar una historia a evento con confirmacion expresa.
- Conservar el antecedente de una historia fusionada, dividida o degradada y
  excluirlo de los conteos operativos para no duplicar reportes.
- Exportar evidencia adoptada como archivos reales a Obsidian.

La confirmacion explica el destino de cada accion antes de cambiar la historia.
El historial de curacion se conserva dentro del registro de la experiencia; la
vista de historial detallado se incorporara cuando el producto exponga una
linea de auditoria para usuarios finales.

## Criterio de experiencia

Una experiencia es un episodio vivido con sentido coherente. Requiere lenguaje
humano que relate lo vivido, ya sea texto escrito, nota manual, voz transcrita o
voz de un video narrado. La evidencia puede llegar antes o despues; la historia
es quien le da sentido.
