# Inventario de reestructuracion de VibePWA

Generado por `npm run audit:restructure`. Este documento no decide que se borra; identifica la superficie actual para revisar cada retiro con pruebas.

## Resumen

- Rutas API detectadas: 74.
- Vistas de navegacion detectadas: 14.
- Botones con identificador detectados: 62.
- Funciones escritoras o reconciliadoras detectadas: 27.
- Documentos candidatos a canonicos: 10.
- Documentos historicos o de soporte: 38.

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

- `/api/health` (server.js:309)
- `/api/config` (server.js:335)
- `/api/mobile/auth/sign-in` (server.js:346)
- `/api/mobile/assistant/message` (server.js:369)
- `/api/mobile/assistant/status` (server.js:376)
- `/api/mobile/ai/vision` (server.js:383)
- `/api/mobile/assistant/vision` (server.js:383)
- `/api/mobile/ai/messages` (server.js:392)
- `/api/mobile/ai/transcribe` (server.js:399)
- `/api/mobile/realtime/token` (server.js:405)
- `/api/mobile/participants` (server.js:419)
- `/api/mobile/context/daily` (server.js:425)
- `/api/mobile/context/health-summary` (server.js:431)
- `/api/integration/contract` (server.js:437)
- `/api/integration/samples` (server.js:442)
- `/api/integration/oura/manifest` (server.js:447)
- `/api/integration/oura/status` (server.js:452)
- `/api/integration/oura/preflight` (server.js:458)
- `/api/integration/oura/diagnostic-connect` (server.js:463)
- `/api/integration/oura/connect` (server.js:468)
- `/api/integration/oura/connect-url` (server.js:474)
- `/api/integration/oura/callback` (server.js:480)
- `/api/integration/oura/sync` (server.js:485)
- `/api/integration/oura/webhook` (server.js:492)
- `/api/integration/oura/normalize` (server.js:498)
- `/api/integration/apple-health/manifest` (server.js:505)
- `/api/integration/apple-health/normalize` (server.js:510)
- `/api/integration/health-connect/manifest` (server.js:517)
- `/api/integration/health-connect/normalize` (server.js:522)
- `/api/integration/meta-wearables/manifest` (server.js:529)
- `/api/integration/meta-wearables/normalize` (server.js:534)
- `/api/integration/device/selftest` (server.js:541)
- `/api/integration/validate` (server.js:547)
- `/api/integration/ingest` (server.js:554)
- `/api/vibeapp/simulate` (server.js:561)
- `/api/profile` (server.js:567)
- `/api/participants` (server.js:580)
- `/api/account/closure-request` (server.js:598)
- `/api/account/data-reset` (server.js:605)
- `/api/experiences` (server.js:612)
- `/api/agenda` (server.js:626)
- `/api/captures/status` (server.js:639)
- `/api/captures` (server.js:645)
- `/api/v2/status` (server.js:660)
- `/api/v2/evidence` (server.js:666)
- `/api/v2/experiences` (server.js:673)
- `/api/media` (server.js:689)
- `/api/assets` (server.js:704)
- `/api/assets/adopt` (server.js:710)
- `/api/assets/reassign` (server.js:717)
- `/api/upload-attempts` (server.js:731)
- `/api/transcribe` (server.js:746)
- `/api/extract-document` (server.js:753)
- `/api/ocr-image` (server.js:760)
- `/api/translate-text` (server.js:767)
- `/api/search/semantic` (server.js:774)
- `/api/embeddings/backfill` (server.js:781)
- `/api/workspace/backfill` (server.js:788)
- `/api/jobs` (server.js:794)
- `/api/sync/state` (server.js:800)
- `/api/supabase/diagnostics` (server.js:806)
- `/api/supabase/self-test` (server.js:812)
- `/api/routines` (server.js:818)
- `/api/jobs/embeddings` (server.js:824)
- `/api/jobs/asset-processing` (server.js:831)
- `/api/report/pdf` (server.js:857)
- `/api/insights/pdf` (server.js:864)
- `/api/publication/pdf` (server.js:871)
- `/api/manual/pdf` (server.js:878)
- `/api/exports/file` (server.js:885)
- `/api/obsidian/export` (server.js:891)
- `/api/context/impact` (server.js:898)
- `/api/daily-briefing` (server.js:908)
- `/api/daily-briefing/latest` (server.js:918)

## Escritores y reconciliadores

- `writeOuraTokenStore` (server.js:1620)
- `syncOuraApiData` (server.js:2146)
- `ingestIntegrationSignals` (server.js:2627)
- `ingestIntegrationSignal` (server.js:2664)
- `writeStore` (server.js:3669)
- `writeAgendaStore` (server.js:3728)
- `writeProfileParameters` (server.js:3740)
- `writeRoutineStore` (server.js:3759)
- `writeDailyBriefingStore` (server.js:3785)
- `upsertProfile` (server.js:4552)
- `upsertAgendaEvent` (server.js:4663)
- `upsertContextSignal` (server.js:4722)
- `upsertExperience` (server.js:4785)
- `upsertParticipantRecord` (server.js:4954)
- `syncExperienceEventsToSupabase` (server.js:5227)
- `syncExperienceAssetsToSupabase` (server.js:5269)
- `reconcileDeferredEvidenceForExperiences` (server.js:5298)
- `upsertAssetEvidence` (server.js:5651)
- `writeAssetEvidenceWithCompatibility` (server.js:5698)
- `saveMedia` (server.js:6532)
- `saveMediaBuffer` (server.js:6542)
- `receiveCapture` (server.js:6891)
- `receiveEvidenceV2` (server.js:7119)
- `saveExperienceV2` (server.js:7185)
- `saveStoredDailyBriefing` (server.js:10753)
- `saveExportFile` (server.js:11773)
- `saveObsidianExport` (server.js:11789)

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
- `exportAssetInventoryButton`: Exportar inventario (index.html:1274)
- `exportAssetInventoryCsvButton`: CSV inventario (index.html:1275)
- `exportAssetProcessingBacklogButton`: Exportar pendientes (index.html:1276)
- `exportAssetProcessingBacklogCsvButton`: CSV pendientes (index.html:1277)
- `exportAssetProcessingChecklistButton`: Checklist de revisión (index.html:1278)
- `exportAssetMetadataTemplateButton`: Plantilla CSV (index.html:1279)
- `exportAssetEditableMetadataCsvButton`: CSV edición (index.html:1280)
- `suggestFilteredAssetTextButton`: Sugerir texto filtrado (index.html:1281)
- `importAssetMetadataButton`: Importar metadatos (index.html:1282)
- `saveProfileButton`: Guardar perfil (index.html:1340)

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
