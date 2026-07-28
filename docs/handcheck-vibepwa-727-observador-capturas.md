# Handcheck VibePWA 727 - Observador de capturas

Fecha: 2026-07-28
Version: `20260728-capture-compat-observer-727`
Responsable: Codex PC

## Objetivo

Medir la distancia real entre las rutas que usa Vibeapp hoy y el contrato unico
`POST /api/captures`, sin enviar una segunda copia y sin cambiar todavia el
guardado de produccion.

## Que cambia

1. Se agrega `lib/capture/capture-compatibility.mjs`.
2. `/api/integration/ingest` y `/api/media` siguen guardando por su ruta actual.
3. En paralelo, cada entrada se traduce solo en memoria al contrato canonico.
4. El resultado se agrega a un monitor sin contenido personal:
   - compatible;
   - medio sin archivo completo;
   - referencia anterior a una historia o evento que debe ignorarse al migrar;
   - tipo no soportado;
   - campo obligatorio ausente.
5. `/api/captures/status` devuelve el bloque `compatibility`.

## Garantias

- `mode` es `observe_only`.
- `writesDuplicated` es `false`.
- No se llama al orquestador canonico desde una ruta anterior.
- No cambia el HTTP de Vibeapp ni el resultado visible para el usuario.
- No se guardan textos, fotos, biometria ni otros datos personales en el
  resumen del monitor.
- Cada usuario autenticado tiene un contador aislado; una cuenta no ve la
  actividad de otra.
- El servidor conserva como maximo 250 contadores temporales y descarta el
  mas antiguo antes de crear otro; no acumula monitores sin limite.
- Agenda, biometria, actividad, sueno, ubicacion, clima y noticias se clasifican
  como contexto, nunca como historias.
- Texto humano se clasifica como evidencia de texto.
- Imagen, audio, video y documento requieren bytes completos para ser
  compatibles.
- Cualquier `experienceId` o `eventId` enviado por Vibeapp se excluye del
  comando canonico y queda como diagnostico `compatible_with_loss`.
- CSV, JSON o ZIP reconocidos como salud se clasifican como contexto
  biometrico, no como documentos narrativos.
- El observador no calcula hashes de archivos grandes dentro de la peticion;
  el hash real queda reservado para la escritura canonica.

## Como leer el estado

Con sesion autenticada:

```text
GET /api/captures/status
```

El bloque esperado:

```json
{
  "compatibility": {
    "mode": "observe_only",
    "writesDuplicated": false,
    "observed": 0,
    "compatible": 0,
    "compatibleWithLoss": 0,
    "incompatible": 0,
    "migratable": 0,
    "compatiblePercent": null,
    "byRoute": {},
    "byCode": {},
    "recent": []
  }
}
```

Los conteos comienzan de nuevo si Railway reinicia el proceso. Sirven para
observar un lote controlado y decidir el siguiente corte; no son una nueva
fuente de verdad.

## Pruebas

- `node --check lib/capture/capture-compatibility.mjs`
- `npm run verify:capture-compatibility`
- `npm run verify:capture-core`
- `npm run check`
- `npm run verify:release`

La prueba automatica cubre texto, agenda, biometria, CSV/ZIP de salud, archivo
completo, medio sin bytes, enlace antiguo a experiencia, discrepancia de claves,
archivo grande y resumen de observacion.

Resultado final:

- `npm run verify:release`: verde.
- Capturas, sincronizacion, automatizaciones, Obsidian, PDFs, flujos E2E y PWA:
  verdes.
- Auditoria cruzada: los hallazgos sobre biometria, historias anteriores,
  idempotencia, archivos grandes, version movil y aislamiento por usuario fueron
  corregidos antes de publicar.

## Lo que no se hace en 727

- No se activa `CAPTURE_PIPELINE_MODE`.
- No se cambia Vibeapp.
- No se retiran `/api/integration/ingest` ni `/api/media`.
- No se migra ni borra informacion.
- No se declara terminado el corte movil.

## Condicion previa del siguiente bloque

La copia `vibeapp/` incluida en este repositorio declara `0.4.7+568`, mientras
los handchecks mas recientes describen builds instaladas `0.5.34+656/660`.
Antes de cambiar el endpoint movil, Claude Mac debe entregar la fuente exacta de
la build vigente. No se migrara Vibeapp contra una copia atrasada.

## Siguiente decision

Despues de observar trafico real:

1. corregir en Vibeapp los payloads incompatibles;
2. sincronizar la copia fuente de la build movil vigente y validar su matriz;
3. activar `/api/captures` para un usuario canario;
4. comparar inventario local, recibos y registros remotos;
5. retirar rutas anteriores solo cuando la equivalencia sea completa.
