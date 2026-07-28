# Handcheck VibePWA 723: Inteligencia y publicación

Fecha: 2026-07-28  
Versión: `20260728-intelligence-publishing-723`

## Objetivo

Cerrar la Fase 5 del plan maestro con una interacción simple y coherente para
Reportes, Hallazgos y Publicaciones, sin cambiar la base de datos ni los
generadores existentes.

## Cambios realizados

### Reportes

- La pantalla pregunta primero qué se desea revisar.
- Hay tres lecturas visibles: Balance completo, Balance de vida y Mediciones.
- Persona o grupo y período permanecen como controles principales.
- Los filtros finos quedan plegados.
- Antes de leer el resultado se muestran historias, evidencias y contextos
  incluidos.

### Hallazgos

- Hay tres lecturas visibles: Patrones respaldados, Patrones de vida y Señales
  observadas.
- Se agregó un período rápido: historial, 7, 30 o 90 días.
- Persona o grupo permanece visible.
- Área de vida, origen y fechas exactas quedan como filtros opcionales.

### Publicaciones

- El recorrido visible tiene tres etapas: elegir material, elegir formato y
  generar o revisar.
- El material puede ser Historia completa, Solo relatos o Álbum de evidencias.
- Persona o grupo y período son controles principales.
- El PDF continúa siendo la salida principal; el paquete PDF + videos conserva
  el contrato existente.

### Contrato común

- La evidencia sin historia sigue aportando valor en mediciones, señales y
  álbumes.
- Reportes y Hallazgos no inventan historias.
- Publicaciones solo narra cuando existen relatos confirmados; el álbum de
  evidencia es cronológico y factual.
- Obsidian sigue recibiendo únicamente historias confirmadas.
- Español, inglés, francés y portugués comparten el mismo recorrido.

## Validación ejecutada

- `npm run check`: aprobado.
- Auditoría de runtime: 3345 declaraciones, 0 llamadas sin resolver.
- Contrato de evidencia V2: aprobado.
- Contrato de captura: aprobado.
- Alcance común de salidas: aprobado.
- UI de Inteligencia y Publicación: aprobado.
- Terminología Área de vida: aprobada.
- E2E local completo: aprobado.
- PDF de Reportes: generado.
- PDF de Hallazgos: generado.
- PDF de Publicaciones: generado.
- Vistas de escritorio y móvil: sin desbordes detectados por la prueba.

## Prueba de aceptación posterior al despliegue

1. Abrir Reportes y cambiar entre las tres lecturas. Confirmar que cambian el
   resumen y los conteos.
2. Elegir una persona o grupo y un período. Generar y descargar el PDF.
3. Abrir Hallazgos, elegir Señales observadas y descargar el PDF.
4. Abrir Publicaciones, elegir Álbum de evidencias, un período y un formato.
   Generar el PDF.
5. Cambiar el idioma a inglés, francés y portugués y confirmar que títulos,
   etapas y opciones aparecen traducidos.

## Resultado esperado

La persona entiende qué salida está creando sin interpretar controles
técnicos. Las tres superficies usan la misma selección de persona y tiempo,
pero mantienen su finalidad: medir, comprender o publicar.
