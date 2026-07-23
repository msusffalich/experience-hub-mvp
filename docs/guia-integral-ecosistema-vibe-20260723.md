# Guía integral del ecosistema Vibe

Fecha: 2026-07-23
Estado: índice de navegación y lectura amigable del ecosistema.

## Cómo leer el ecosistema

Vibe no es un conjunto de aplicaciones independientes. Es un único sistema de memoria y comprensión personal con diferentes espacios de trabajo. El usuario no necesita conocer la infraestructura para usarlo; esta guía explica cómo encajan las piezas y dónde encontrar cada respuesta.

## El recorrido principal

1. **Vive y captura:** Vibeapp guarda palabras, imágenes, video, audio, documentos y datos autorizados del momento.
2. **Sincroniza:** la misma cuenta Vibe conserva el registro común en la nube.
3. **Da sentido:** VibePWA convierte una selección de evidencias y una narración humana en experiencia.
4. **Organiza:** la Biblioteca permite ajustar la historia sin borrar la memoria accidentalmente.
5. **Comprende:** Reportes, Hallazgos y Mapa leen las experiencias y su contexto.
6. **Comparte:** Publicaciones crea un PDF editorial; VibePub puede refinarlo.
7. **Profundiza:** Obsidian recibe notas curadas para conexiones y aprendizajes de largo plazo.

## Mapa de responsabilidades

| Espacio | Hace | No hace |
| --- | --- | --- |
| Vibeapp | Captura móvil, permisos, cola local y sincronización. | Curación compleja ni administración de datos. |
| VibePWA | Historias, eventos, evidencia, análisis, PDFs y operación. | Control físico completo del dispositivo. |
| API y Supabase | Fuente única de datos, acceso privado, automatización. | Interpretar un archivo como experiencia sin relato humano. |
| Obsidian y Claude PC | Curación de conocimiento y auditoría de la bóveda. | Sustituir la base de datos de Vibe. |
| VibePub | Edición y adaptación editorial posterior. | Cambiar el registro de experiencias de origen. |

## Reglas que mantienen el sistema coherente

- Capturar no equivale a crear una experiencia.
- Una historia nace de un relato humano, no de un nombre de archivo ni de una señal de sensor.
- La evidencia se puede adoptar después por fecha, rango y selección.
- El contexto se referencia por tiempo; no se convierte en historia por sí solo.
- Curar reorganiza y deja antecedentes; no destruye silenciosamente.
- Vibe es la fuente de verdad. Obsidian es una vista de conocimiento curada.
- Las cuatro lenguas del producto son español, inglés, francés y portugués.

## Preguntas rápidas

### ¿Dónde creo una experiencia?

En VibePWA, desde Captura o Biblioteca. Vibeapp puede crear una experiencia simple cuando ya tienes el relato, pero su uso principal es capturar rápido.

### ¿Qué hago con una foto que no pertenece todavía a nada?

Déjala en la Bandeja. No se pierde ni se convierte en una historia vacía. Más adelante la adoptas desde la experiencia correcta.

### ¿Qué hace Meta AI glasses dentro de Vibe?

Las fotos y videos se importan al teléfono a través de Meta AI y luego se capturan desde Vibeapp. Los lentes son una fuente de evidencia; Vibe no controla directamente su almacenamiento.

### ¿El clima, las noticias y la biometría son experiencias?

No. Son contexto. Ayudan a comprender un episodio real cuando existe una historia y un rango de tiempo.

### ¿Qué documentos debo consultar?

| Necesidad | Documento |
| --- | --- |
| Aprender a usar Vibe | `manual-usuario-vibe-20260723.md` y su PDF. |
| Entender el producto completo | `blueprint-produccion-ecosistema-vibe-20260723.md` y su PDF. |
| Implementar captura/adopción | `capture-adoption-blueprint-20260721.md`. |
| Coordinar Vibeapp con VibePWA | `vibeapp-vibepwa-operating-contract.md`. |
| Reorganizar historias | `story-curation-operations-20260723.md`. |
| Auditar Obsidian | `obsidian-vault-vibe/90_System/`. |

## Estado de verificación

La adopción de evidencia y la reorganización básica ya cuentan con pruebas E2E. Queda una validación registrada de las operaciones de dividir y degradar una historia para confirmar el antecedente en Biblioteca, productos de salida y Obsidian. La guía de prueba es `handcheck-curacion-dividir-degradar-20260723.md`.

Esta guía se mantiene como puerta de entrada. El blueprint explica por qué existe cada capa; el manual explica cómo usarla sin tecnicismos.
