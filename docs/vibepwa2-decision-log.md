# VibePWA 2 - registro de decisiones

Este archivo evita que decisiones estructurales vuelvan a discutirse o se
pierdan entre handchecks.

## ADR-001 - Implementacion paralela

**Decision:** construir VibePWA 2 en `apps/vibepwa-next` y conservar la
aplicacion actual durante validacion.

**Motivo:** aislar riesgo funcional y permitir comparacion/rollback inmediato.

## ADR-002 - Una sola ruta de binarios

**Decision:** los binarios van del dispositivo a Supabase Storage mediante URL
firmada o TUS. Railway autoriza y confirma, pero no transporta el archivo.

**Motivo:** evitar timeouts, limites de memoria y respuestas 502 por archivos
grandes.

## ADR-003 - Guardado antes que enriquecimiento

**Decision:** ninguna llamada de IA, clima, noticias, OCR o analisis bloquea el
recibo durable de una captura.

**Motivo:** el dato primario no puede perderse por un proveedor secundario.

## ADR-004 - Capturar no es estructurar

**Decision:** Vibeapp captura hechos; VibePWA arma historias. Vibeapp puede
enviar texto humano y metadatos, pero no necesita crear una experiencia para que
el dato tenga valor.

**Motivo:** simplificar sincronizacion movil y concentrar la complejidad donde
el usuario puede ver todas las piezas.

## ADR-005 - Areas de vida y experiencias son conceptos distintos

**Decision:** una historia puede clasificarse por area de vida. Reportes y
hallazgos agregan por area; Obsidian y publicaciones explotan historias.

**Motivo:** conservar el balance analitico sin confundir una taxonomia con un
episodio vivido.

## ADR-006 - Cuatro idiomas

**Decision:** espanol, ingles, frances y portugues son idiomas de producto.

**Motivo:** evitar componentes parciales o divergentes.

## ADR-007 - Operacion fuera del flujo principal

**Decision:** controles y diagnostico viven bajo Cuenta.

**Motivo:** el usuario final no debe navegar una consola tecnica.

## ADR-008 - Sin reemplazo por antiguedad

**Decision:** VibePWA 2 reemplaza la anterior por puertas de calidad, no por
fecha ni porcentaje declarado.

**Motivo:** el estado real se demuestra con pruebas funcionales.

## ADR-009 - Entrada publica y reversión

**Decision:** `/` e `/index.html` abren VibePWA 2. La interfaz anterior queda
disponible exclusivamente en `/legacy`, que redirige a
`/index.html?legacy=1`.

**Motivo:** el usuario debe encontrar un solo producto al abrir la URL
principal, sin perder una vía de reversión operativa mientras se completa el
seguimiento en producción.
