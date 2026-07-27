# Handcheck 711 - Alcance comun de salidas

Fecha: 2026-07-27
Estado: validado localmente; pendiente de despliegue y comprobacion en produccion.
Responsable: Codex PC / VibePWA y servidor.

## Decision confirmada

Vibeapp captura evidencia y contexto. VibePWA organiza historias y produce las salidas. Reportes, Hallazgos y Publicaciones usan el mismo alcance:

1. Periodo de fechas, por defecto los ultimos siete dias.
2. Persona o grupo.
3. Base de contenido: historias y evidencia, solo historias o solo evidencia.
4. Filtros opcionales: categoria, origen, ubicacion, tipo de activo y texto.

La categoria filtra historias clasificadas y los activos vinculados. La evidencia suelta no recibe una categoria inventada; cuando queda fuera se declara de forma visible.

## Tratamiento por salida

| Salida | Uso principal | Tratamiento |
| --- | --- | --- |
| Reportes | Comprender hechos y mediciones | Organizan datos, tendencias y contexto; no inventan una historia editorial. |
| Hallazgos | Detectar patrones y proponer una siguiente accion | Distinguen hechos, senales e inferencias con su nivel de confianza. |
| Publicaciones | Crear una pieza editorial PDF | Las narrativas de experiencias y eventos forman el hilo editorial; activos y contexto lo enriquecen. Con solo evidencia crea un dossier cronologico sin inventar relato, categoria ni hechos. |

## Cambio realizado en este bloque

El alcance de Reportes ahora gobierna todo su resultado: estadisticas, tablas, analisis, visualizaciones, JSON, CSV, HTML, PDF y auditoria. Antes, al elegir `Solo evidencia`, el panel podia seguir analizando historias fuera del alcance. Ese desajuste fue corregido.

Las Publicaciones conservan el uso de experiencias y eventos como hilo narrativo, porque esa es precisamente su funcion editorial.

## Validacion local realizada

- `npm run check`: correcto.
- `npm run verify:e2e`: correcto, incluidos Reportes, Hallazgos y Publicaciones.
- `npm run verify:outputs`: correcto; PDFs de reporte, hallazgos, publicaciones y manual generados.
- Revision visual de las tres pantallas de salida en escritorio: alcance visible y sin desbordes detectados.

## Comprobacion posterior al despliegue

1. En Reportes, elegir `Solo evidencia` y generar PDF: no debe incluir metricas, tabla ni conclusiones de historias.
2. En Hallazgos, elegir `Historias y evidencia`: deben diferenciarse historias, evidencia y contexto.
3. En Publicaciones, elegir `Historias y evidencia`: el borrador debe indicar que las narrativas organizan la pieza.
4. En Publicaciones, elegir `Solo evidencia`: debe generar un dossier cronologico y no inventar historia, categoria o relato.
5. Cambiar periodo y persona/grupo en las tres pantallas: el mismo alcance debe respetarse en pantalla y exportacion.

## Acuerdo para Vibeapp / MAC

No requiere cambio de codigo en Vibeapp para este bloque. Vibeapp sigue capturando evidencia y contexto con hora y persona/grupo. No crea experiencias ni eventos como parte de esta decision. VibePWA es dueno de organizar, curar y filtrar historias para las salidas.

## Siguiente bloque

Tras validar este despliegue en produccion, se inicia en paralelo seguro la nueva ruta de captura: cola durable, recibo de servidor, reintentos transparentes y adopcion posterior de evidencia. Se prueba aislada antes de sustituir la ruta vigente.
