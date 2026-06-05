# Auditoria blueprint vs flujos reales

Fecha: 2026-06-05  
Version auditada: `20260605-post-ingest-automation-531`

## Conclusion ejecutiva

La app ya no debe tratar una carga o sincronizacion como un simple traslado de datos. El ajuste 531 agrega una compuerta post-ingesta: cada señal validada por `/api/integration/ingest` devuelve que paneles quedan afectados, que acciones se dispararon y si el contexto biometrico fue recalculado.

La revision confirma que la PWA tiene buena base operativa, pero aun hay dos brechas de arquitectura que deben tratarse como prioritarias antes de hablar de solidez comercial completa:

1. **Realtime multidispositivo verificable**: existe persistencia Supabase, pero la auditoria no detecta una suscripcion Realtime obligatoria y probada para refrescar experiencias, activos, agenda y contexto en otros dispositivos sin recarga manual.
2. **Procesamiento asincrono central**: OCR, transcripcion, analisis documental y procesamiento multimedia necesitan una cola de jobs explicita con estado, progreso, reintento y resultado. Hoy hay procesamiento y reportes, pero no una compuerta unica de jobs para todo.

## Matriz de flujos

| Flujo blueprint | Implementacion actual | Estado | Riesgo | Prueba/control |
|---|---|---:|---|---|
| Captura PWA crea experiencia y activo | Captura, Libreria y Activos pasan E2E local; edicion y borrado tambien | Listo | Medio si cambia UI sin prueba | `npm run verify:e2e` |
| Ingesta externa normalizada | `/api/integration/ingest` valida y enruta texto, agenda, contexto y media | Listo | Bajo | `npm run simulate:vibeapp`, `npm run verify:integrations` |
| Post-ingesta interpreta y actualiza impacto | 531 agrega `buildPostIngestAutomation`, paneles afectados y `biometric_impact_recomputed` | Listo inicial | Medio: necesita ampliarse a jobs | `npm run audit:blueprint` |
| Biometria desde archivo | Activos acepta CSV, JSON y `export.xml`; sincroniza señal al servidor | Listo inicial | Medio: Apple Health ZIP requiere descomprimir antes | `npm run audit:blueprint` + prueba manual con archivo real |
| Biometria en reportes/hallazgos/captura | Se cruza por fecha/hora y actualiza resumen central | Listo inicial | Medio: requiere datos reales ricos | `npm run check` + validacion visual |
| Agenda | Señales `calendar` van a Agenda; Daily/contexto puede refrescarse si hay ubicacion | Parcial | Medio: conectores calendario reales pendientes | E2E local cubre vista Agenda |
| Diario/noticias/clima/contexto | Backend usa providers server-side; refresh manual/rutina | Parcial | Alto si el usuario espera ubicacion diaria automatica por dispositivo | Pendiente: prueba de rutina por usuario |
| Multimedia multidispositivo | Storage privado, URLs firmadas y assets compartidos validados antes | Listo base | Medio: procesamiento automatico pendiente | Supabase self-test + E2E assets |
| OCR/transcripcion/documentos | Hay extraccion y reportes, pero no job central robusto | Pendiente prioritario | Alto | Pendiente: `processing_jobs` |
| Reportes/Hallazgos/Publicaciones | PDFs y filtros compartidos cubiertos por E2E local/produccion | Listo base | Medio: calidad editorial sigue iterando | `npm run verify:outputs`, `npm run verify:e2e` |
| Vibeapp nativa | Contrato, simulacion, iOS build y captura base probados | Parcial | Alto en UX/HealthKit real | `npm run simulate:vibeapp`, `npm run verify:flutter` |
| Sincronizacion transparente | Cola y persistencia existen, pero Realtime verificable no queda garantizado | Pendiente prioritario | Alto | Pendiente: prueba Realtime multi-cliente |

## Controles agregados

- `npm run audit:blueprint`: valida que los flujos centrales del blueprint sigan conectados.
- `npm run verify:release`: ahora incluye `audit:blueprint`.
- La simulacion Vibeapp ahora falla si desaparece la automatizacion post-ingesta o el soporte de Apple Health XML.

## Brechas que no deben disfrazarse como terminadas

### 1. Realtime multidispositivo

Debe existir una prueba que abra dos clientes, guarde o ingeste en uno, y confirme que el otro actualiza sin recarga manual:

- Libreria
- Activos
- Agenda
- contexto biometrico
- panel de avance/estado

### 2. Processing jobs

Debe existir una tabla/cola `processing_jobs` o equivalente para:

- OCR de documentos e imagenes
- transcripcion de audio/video
- resumen audiovisual
- procesamiento de biometria pesada
- generacion pesada de reportes/publicaciones

Cada job debe tener `status`, `progress`, `error`, `result`, `createdAt`, `completedAt` y reintento.

### 3. Vibeapp UX y conectores reales

La app nativa ya valida contratos basicos, pero todavia requiere:

- UI/UX rediseñada de captura rapida
- HealthKit directo en iOS
- Health Connect real en Android
- cola offline observable sin lenguaje tecnico
- apertura limpia de Libreria/Panel o una explicacion clara de que Vibeapp es captura rapida y PWA es analisis

## Siguiente bloque recomendado

1. Implementar Realtime/polling verificable para PWA multidispositivo.
2. Implementar `processing_jobs` como cola unica de procesamiento.
3. Conectar OCR/transcripcion/analisis de activos a esa cola.
4. Crear E2E de dos clientes para confirmar sincronizacion sin recarga.
5. Mejorar Vibeapp UX en paralelo, pero sin mezclarlo con la solidez del backend.
