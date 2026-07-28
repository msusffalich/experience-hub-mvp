# Inventario de reestructuracion de VibePWA

Generado por `npm run audit:restructure`. Este documento no decide que se borra; identifica la superficie actual para revisar cada retiro con pruebas.

## Resumen

- Rutas API detectadas: 74.
- Vistas de navegacion detectadas: 14.
- Botones con identificador detectados: 62.
- Funciones escritoras o reconciliadoras detectadas: 27.
- Documentos candidatos a canonicos: 10.
- Documentos historicos o de soporte: 41.

## Vistas

- `dashboard` (index.html:44)
- `library` (index.html:45)
- `assetLibrary` (index.html:46)
- `report` (index.html:47)
- `publications` (index.html:48)
- `auth` (index.html:49)
- `agenda` (index.html:87)
- `capture` (index.html:88)
- `timeline` (index.html:89)
- `insights` (index.html:90)
- `experienceMap` (index.html:91)
- `manual` (index.html:92)
- `admin` (index.html:93)
- `automation` (index.html:94)

## Rutas API

- `/api/health` (server.js:316)
- `/api/config` (server.js:342)
- `/api/mobile/auth/sign-in` (server.js:353)
- `/api/mobile/assistant/message` (server.js:376)
- `/api/mobile/assistant/status` (server.js:383)
- `/api/mobile/ai/vision` (server.js:390)
- `/api/mobile/assistant/vision` (server.js:390)
- `/api/mobile/ai/messages` (server.js:399)
- `/api/mobile/ai/transcribe` (server.js:406)
- `/api/mobile/realtime/token` (server.js:412)
- `/api/mobile/participants` (server.js:426)
- `/api/mobile/context/daily` (server.js:432)
- `/api/mobile/context/health-summary` (server.js:438)
- `/api/integration/contract` (server.js:444)
- `/api/integration/samples` (server.js:449)
- `/api/integration/oura/manifest` (server.js:454)
- `/api/integration/oura/status` (server.js:459)
- `/api/integration/oura/preflight` (server.js:465)
- `/api/integration/oura/diagnostic-connect` (server.js:470)
- `/api/integration/oura/connect` (server.js:475)
- `/api/integration/oura/connect-url` (server.js:481)
- `/api/integration/oura/callback` (server.js:487)
- `/api/integration/oura/sync` (server.js:492)
- `/api/integration/oura/webhook` (server.js:499)
- `/api/integration/oura/normalize` (server.js:505)
- `/api/integration/apple-health/manifest` (server.js:512)
- `/api/integration/apple-health/normalize` (server.js:517)
- `/api/integration/health-connect/manifest` (server.js:524)
- `/api/integration/health-connect/normalize` (server.js:529)
- `/api/integration/meta-wearables/manifest` (server.js:536)
- `/api/integration/meta-wearables/normalize` (server.js:541)
- `/api/integration/device/selftest` (server.js:548)
- `/api/integration/validate` (server.js:554)
- `/api/integration/ingest` (server.js:561)
- `/api/vibeapp/simulate` (server.js:569)
- `/api/profile` (server.js:575)
- `/api/participants` (server.js:588)
- `/api/account/closure-request` (server.js:606)
- `/api/account/data-reset` (server.js:613)
- `/api/experiences` (server.js:620)
- `/api/agenda` (server.js:634)
- `/api/captures/status` (server.js:647)
- `/api/captures` (server.js:653)
- `/api/v2/status` (server.js:668)
- `/api/v2/evidence` (server.js:674)
- `/api/v2/experiences` (server.js:681)
- `/api/media` (server.js:697)
- `/api/assets` (server.js:723)
- `/api/assets/adopt` (server.js:729)
- `/api/assets/reassign` (server.js:736)
- `/api/upload-attempts` (server.js:750)
- `/api/transcribe` (server.js:765)
- `/api/extract-document` (server.js:772)
- `/api/ocr-image` (server.js:779)
- `/api/translate-text` (server.js:786)
- `/api/search/semantic` (server.js:793)
- `/api/embeddings/backfill` (server.js:800)
- `/api/workspace/backfill` (server.js:807)
- `/api/jobs` (server.js:813)
- `/api/sync/state` (server.js:819)
- `/api/supabase/diagnostics` (server.js:825)
- `/api/supabase/self-test` (server.js:831)
- `/api/routines` (server.js:837)
- `/api/jobs/embeddings` (server.js:843)
- `/api/jobs/asset-processing` (server.js:850)
- `/api/report/pdf` (server.js:876)
- `/api/insights/pdf` (server.js:883)
- `/api/publication/pdf` (server.js:890)
- `/api/manual/pdf` (server.js:897)
- `/api/exports/file` (server.js:904)
- `/api/obsidian/export` (server.js:910)
- `/api/context/impact` (server.js:917)
- `/api/daily-briefing` (server.js:927)
- `/api/daily-briefing/latest` (server.js:937)

## Escritores y reconciliadores

- `writeOuraTokenStore` (server.js:1639)
- `syncOuraApiData` (server.js:2165)
- `ingestIntegrationSignals` (server.js:2672)
- `ingestIntegrationSignal` (server.js:2709)
- `writeStore` (server.js:3714)
- `writeAgendaStore` (server.js:3773)
- `writeProfileParameters` (server.js:3785)
- `writeRoutineStore` (server.js:3804)
- `writeDailyBriefingStore` (server.js:3830)
- `upsertProfile` (server.js:4597)
- `upsertAgendaEvent` (server.js:4708)
- `upsertContextSignal` (server.js:4767)
- `upsertExperience` (server.js:4830)
- `upsertParticipantRecord` (server.js:4999)
- `syncExperienceEventsToSupabase` (server.js:5272)
- `syncExperienceAssetsToSupabase` (server.js:5314)
- `reconcileDeferredEvidenceForExperiences` (server.js:5343)
- `upsertAssetEvidence` (server.js:5696)
- `writeAssetEvidenceWithCompatibility` (server.js:5743)
- `saveMedia` (server.js:6577)
- `saveMediaBuffer` (server.js:6587)
- `receiveCapture` (server.js:6939)
- `receiveEvidenceV2` (server.js:7167)
- `saveExperienceV2` (server.js:7233)
- `saveStoredDailyBriefing` (server.js:10801)
- `saveExportFile` (server.js:11821)
- `saveObsidianExport` (server.js:11837)

## Controles identificados

- `contextNavigationRootButton`: Volver (index.html:86)
- `togglePasswordButton`: Mostrar (index.html:122)
- `signInButton`: Entrar (index.html:125)
- `signUpButton`: Crear cuenta (index.html:126)
- `resetPasswordButton`: Recuperar contraseña (index.html:127)
- `resendConfirmationButton`: Reenviar confirmación (index.html:128)
- `dailyRefreshButton`: Actualizar diario (index.html:252)
- `contextPrimaryButton`: Usar ubicación principal (index.html:286)
- `captureQuickGroupAddButton`: Crear y seleccionar (index.html:379)
- `recordAudioButton`: Grabar audio (index.html:434)
- `clearFormButton`: Limpiar (index.html:442)
- `clearAssetFiltersButton`: Limpiar filtros (index.html:517)
- `importBiometricAssetButton`: Importar histórico (index.html:542)
- `exportAgendaIcsButton`: Exportar calendario (index.html:580)
- `importAgendaIcsButton`: Importar .ics (index.html:581)
- `agendaSaveBlockedDatesButton`: Guardar bloqueos (index.html:589)
- `agendaClearButton`: Limpiar (index.html:656)
- `agendaSaveButton`: Guardar evento (index.html:657)
- `experienceMapExportButton`: Exportar mapa y notas (index.html:722)
- `connectLocalObsidianVaultButton`: Conectar bóveda del PC (index.html:726)
- `forgetLocalObsidianVaultButton`: Quitar conexión local (index.html:727)
- `experienceMapAskButton`: Consultar (index.html:733)
- `resetReportScopeInlineButton`: Limpiar filtros (index.html:824)
- `generateReportButton`: Generar reporte (index.html:830)
- `downloadEditedReportPdfButton`: Descargar PDF (index.html:831)
- `resetReportScopeButton`: Restaurar vista (index.html:832)
- `clearInsightsScopeButton`: Limpiar filtros (index.html:918)
- `exportInsightsPdfButton`: Descargar PDF de hallazgos (index.html:924)
- `exportInsightsHtmlButton`: Descargar HTML (index.html:925)
- `exportInsightsMarkdownButton`: Exportar Markdown (index.html:926)
- `askButton`: Consultar (index.html:939)
- `clearPublicationScopeButton`: Limpiar filtros (index.html:1019)
- `generatePublicationButton`: Generar PDF revista premium (index.html:1056)
- `exportPublicationPdfButton`: Descargar PDF revista premium (index.html:1057)
- `exportPublicationPackageButton`: Descargar PDF + videos (index.html:1058)
- `launchPublicationChannelButton`: Preparar canal (index.html:1059)
- `previewPublicationHtmlButton`: Vista imprimible (index.html:1067)
- `exportPublicationHtmlButton`: Exportar HTML (index.html:1068)
- `exportPublicationMarkdownButton`: Exportar Markdown (index.html:1069)
- `copyPublicationTextButton`: Copiar texto (index.html:1070)
- `copyPublicationHtmlButton`: Copiar HTML (index.html:1071)
- `manualClearSearchButton`: Limpiar búsqueda (index.html:1155)
- `manualExportPdfButton`: Descargar manual PDF (index.html:1156)
- `manualExportHtmlButton`: HTML imprimible (index.html:1157)
- `manualExportMarkdownButton`: Exportar Markdown (index.html:1174)
- `manualMarkAllButton`: Marcar todo (index.html:1175)
- `manualResetReviewButton`: Reiniciar revisión (index.html:1176)
- `openAdvancedDiagnosticsButton`: Diagnostico avanzado (index.html:1193)
- `privacyRecommendedButton`: Aplicar recomendado (index.html:1219)
- `toggleLocalKeyButton`: Mostrar clave (index.html:1220)
- `rotateLocalKeyButton`: Aplicar clave (index.html:1221)
- `unlockLocalButton`: Desbloquear local (index.html:1222)
- `exportAssetInventoryButton`: Exportar inventario (index.html:1269)
- `exportAssetInventoryCsvButton`: CSV inventario (index.html:1270)
- `exportAssetProcessingBacklogButton`: Exportar pendientes (index.html:1271)
- `exportAssetProcessingBacklogCsvButton`: CSV pendientes (index.html:1272)
- `exportAssetProcessingChecklistButton`: Checklist de revisión (index.html:1273)
- `exportAssetMetadataTemplateButton`: Plantilla CSV (index.html:1274)
- `exportAssetEditableMetadataCsvButton`: CSV edición (index.html:1275)
- `suggestFilteredAssetTextButton`: Sugerir texto filtrado (index.html:1276)
- `importAssetMetadataButton`: Importar metadatos (index.html:1277)
- `saveProfileButton`: Guardar perfil (index.html:1335)

## Documentacion candidata a canonica

- `arquitectura-v2-evidencia-vibeapp-servidor.md`
- `blueprint-produccion-ecosistema-vibe-20260723.md`
- `capture-adoption-blueprint-20260721.md`
- `current-evidence-inbox-sync.md`
- `guia-arquitectura-v2-y-flujos-por-activo.md`
- `manual-usuario-vibe-20260723.md`
- `plan-maestro-reestructuracion-ecosistema-vibe-20260726.md`
- `product-gap-register.md`
- `vibe-operating-contract-20260727.md`
- `vibeapp-vibepwa-operating-contract.md`

## Documentacion historica o de soporte

Debe conservarse fuera del recorrido normal del usuario y no presentarse como contrato vigente.

- `agent-coordination-protocol.md`
- `auditoria-integral-vibeapp-servidor-20260726.md`
- `blueprint-flow-audit-20260605.md`
- `clio-adoption-plan.md`
- `code-audit-20260523.md`
- `deploy-publicacion.md`
- `evidence-adoption-obsidian-acceptance.md`
- `experience-model-glossary-20260723.md`
- `guia-arquitectura-y-flujos-por-activo-20260727.md`
- `guia-integral-ecosistema-vibe-20260723.md`
- `guia-prueba-mvp.html`
- `guia-prueba-mvp.md`
- `handcheck-codex-pc-to-vibeapp-704-clarification.md`
- `handcheck-curacion-dividir-degradar-20260723.md`
- `handcheck-story-curation-e2e-704.md`
- `handcheck-vibeapp-capa2-evidence-adoption-693.md`
- `handcheck-vibeapp-media-assets-required-696.md`
- `handcheck-vibeapp-media-attempt-repair-697.md`
- `handcheck-vibeapp-pipeline-v2-offline.md`
- `handcheck-vibepwa-718-integridad-producto.md`
- `handcheck-vibepwa-719-cuenta-operacion.md`
- `handcheck-vibepwa-720-evidencia-visual.md`
- `handcheck-vibepwa-721-editor-historias.md`
- `handcheck-vibepwa-722-biblioteca-curacion.md`
- `handcheck-vibepwa-723-inteligencia-publicacion.md`
- `handcheck-vibepwa-724-navegacion-limpieza.md`
- `handcheck-vibepwa-725-modulo-producto.md`
- `handcheck-vibepwa-726-cuenta-modular.md`
- `handcheck-vibepwa-727-observador-capturas.md`
- `inventory-restructure-20260727.md`
- `oura-openapi-connector.md`
- `README.md`
- `runbook-canario-evidence-pipeline-v2.md`
- `story-curation-operations-20260723.md`
- `ux-ui-audit.md`
- `ux-ui-integrity-audit.md`
- `vibeapp-android-pilot-release.md`
- `vibeapp-capture-structure-handoff-20260722.md`
- `vibeapp-compatibility-matrix.md`
- `vibeapp-native-blueprint.md`
- `vibeapp-story-capture-handoff-704.md`

## Reglas de limpieza

1. No retirar una ruta, vista o escritor hasta que una prueba demuestre que no participa en el flujo estable.
2. Toda captura nueva tendra una sola puerta de entrada; las rutas anteriores quedaran en compatibilidad temporal y luego se retiraran.
3. La complejidad tecnica se concentra en Operacion. El usuario ve Inicio, Historias, Evidencia, Inteligencia, Publicar y Cuenta.
4. Los documentos historicos no se borran durante la migracion; se apartan del manual y de la fuente de verdad.
