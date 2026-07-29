# Inventario de reestructuracion de VibePWA

Generado por `npm run audit:restructure`. Este documento no decide que se borra; identifica la superficie actual para revisar cada retiro con pruebas.

## Resumen

- Rutas API detectadas: 74.
- Vistas de navegacion detectadas: 14.
- Botones con identificador detectados: 62.
- Funciones escritoras o reconciliadoras detectadas: 27.
- Documentos candidatos a canonicos: 10.
- Documentos historicos o de soporte: 42.

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

- `/api/health` (server.js:327)
- `/api/config` (server.js:353)
- `/api/mobile/auth/sign-in` (server.js:364)
- `/api/mobile/assistant/message` (server.js:387)
- `/api/mobile/assistant/status` (server.js:394)
- `/api/mobile/ai/vision` (server.js:401)
- `/api/mobile/assistant/vision` (server.js:401)
- `/api/mobile/ai/messages` (server.js:410)
- `/api/mobile/ai/transcribe` (server.js:417)
- `/api/mobile/realtime/token` (server.js:423)
- `/api/mobile/participants` (server.js:437)
- `/api/mobile/context/daily` (server.js:443)
- `/api/mobile/context/health-summary` (server.js:449)
- `/api/integration/contract` (server.js:455)
- `/api/integration/samples` (server.js:460)
- `/api/integration/oura/manifest` (server.js:465)
- `/api/integration/oura/status` (server.js:470)
- `/api/integration/oura/preflight` (server.js:476)
- `/api/integration/oura/diagnostic-connect` (server.js:481)
- `/api/integration/oura/connect` (server.js:486)
- `/api/integration/oura/connect-url` (server.js:492)
- `/api/integration/oura/callback` (server.js:498)
- `/api/integration/oura/sync` (server.js:503)
- `/api/integration/oura/webhook` (server.js:510)
- `/api/integration/oura/normalize` (server.js:516)
- `/api/integration/apple-health/manifest` (server.js:523)
- `/api/integration/apple-health/normalize` (server.js:528)
- `/api/integration/health-connect/manifest` (server.js:535)
- `/api/integration/health-connect/normalize` (server.js:540)
- `/api/integration/meta-wearables/manifest` (server.js:547)
- `/api/integration/meta-wearables/normalize` (server.js:552)
- `/api/integration/device/selftest` (server.js:559)
- `/api/integration/validate` (server.js:565)
- `/api/integration/ingest` (server.js:572)
- `/api/vibeapp/simulate` (server.js:580)
- `/api/profile` (server.js:586)
- `/api/participants` (server.js:599)
- `/api/account/closure-request` (server.js:617)
- `/api/account/data-reset` (server.js:624)
- `/api/experiences` (server.js:631)
- `/api/agenda` (server.js:645)
- `/api/captures/status` (server.js:658)
- `/api/captures` (server.js:664)
- `/api/v2/status` (server.js:679)
- `/api/v2/evidence` (server.js:685)
- `/api/v2/experiences` (server.js:692)
- `/api/media` (server.js:708)
- `/api/assets` (server.js:734)
- `/api/assets/adopt` (server.js:740)
- `/api/assets/reassign` (server.js:747)
- `/api/upload-attempts` (server.js:761)
- `/api/transcribe` (server.js:776)
- `/api/extract-document` (server.js:783)
- `/api/ocr-image` (server.js:790)
- `/api/translate-text` (server.js:797)
- `/api/search/semantic` (server.js:804)
- `/api/embeddings/backfill` (server.js:811)
- `/api/workspace/backfill` (server.js:818)
- `/api/jobs` (server.js:824)
- `/api/sync/state` (server.js:830)
- `/api/supabase/diagnostics` (server.js:836)
- `/api/supabase/self-test` (server.js:842)
- `/api/routines` (server.js:848)
- `/api/jobs/embeddings` (server.js:854)
- `/api/jobs/asset-processing` (server.js:861)
- `/api/report/pdf` (server.js:887)
- `/api/insights/pdf` (server.js:894)
- `/api/publication/pdf` (server.js:901)
- `/api/manual/pdf` (server.js:908)
- `/api/exports/file` (server.js:915)
- `/api/obsidian/export` (server.js:921)
- `/api/context/impact` (server.js:928)
- `/api/daily-briefing` (server.js:938)
- `/api/daily-briefing/latest` (server.js:948)

## Escritores y reconciliadores

- `writeOuraTokenStore` (server.js:1650)
- `syncOuraApiData` (server.js:2176)
- `ingestIntegrationSignals` (server.js:2683)
- `ingestIntegrationSignal` (server.js:2720)
- `writeStore` (server.js:3725)
- `writeAgendaStore` (server.js:3784)
- `writeProfileParameters` (server.js:3796)
- `writeRoutineStore` (server.js:3815)
- `writeDailyBriefingStore` (server.js:3841)
- `upsertProfile` (server.js:4608)
- `upsertAgendaEvent` (server.js:4719)
- `upsertContextSignal` (server.js:4778)
- `upsertExperience` (server.js:4841)
- `upsertParticipantRecord` (server.js:5010)
- `syncExperienceEventsToSupabase` (server.js:5283)
- `syncExperienceAssetsToSupabase` (server.js:5325)
- `reconcileDeferredEvidenceForExperiences` (server.js:5354)
- `upsertAssetEvidence` (server.js:5707)
- `writeAssetEvidenceWithCompatibility` (server.js:5754)
- `saveMedia` (server.js:6588)
- `saveMediaBuffer` (server.js:6598)
- `receiveCapture` (server.js:7015)
- `receiveEvidenceV2` (server.js:7256)
- `saveExperienceV2` (server.js:7322)
- `saveStoredDailyBriefing` (server.js:10890)
- `saveExportFile` (server.js:11910)
- `saveObsidianExport` (server.js:11926)

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
- `capture-api-contract-20260728.md`
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
