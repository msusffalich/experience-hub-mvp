# Inventario de reestructuracion de VibePWA

Generado por `npm run audit:restructure`. Este documento no decide que se borra; identifica la superficie actual para revisar cada retiro con pruebas.

## Resumen

- Rutas API detectadas: 77.
- Vistas de navegacion detectadas: 14.
- Botones con identificador detectados: 62.
- Funciones escritoras o reconciliadoras detectadas: 28.
- Documentos candidatos a canonicos: 11.
- Documentos historicos o de soporte: 54.

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

- `/api/health` (server.js:367)
- `/api/config` (server.js:400)
- `/api/mobile/auth/sign-in` (server.js:411)
- `/api/mobile/auth/refresh` (server.js:434)
- `/api/mobile/assistant/message` (server.js:456)
- `/api/mobile/assistant/status` (server.js:463)
- `/api/mobile/ai/vision` (server.js:470)
- `/api/mobile/assistant/vision` (server.js:470)
- `/api/mobile/ai/messages` (server.js:479)
- `/api/mobile/ai/transcribe` (server.js:486)
- `/api/mobile/realtime/token` (server.js:492)
- `/api/mobile/participants` (server.js:506)
- `/api/mobile/context/daily` (server.js:512)
- `/api/mobile/context/health-summary` (server.js:518)
- `/api/integration/contract` (server.js:524)
- `/api/integration/samples` (server.js:529)
- `/api/integration/oura/manifest` (server.js:534)
- `/api/integration/oura/status` (server.js:539)
- `/api/integration/oura/preflight` (server.js:545)
- `/api/integration/oura/diagnostic-connect` (server.js:550)
- `/api/integration/oura/connect` (server.js:555)
- `/api/integration/oura/connect-url` (server.js:561)
- `/api/integration/oura/callback` (server.js:567)
- `/api/integration/oura/sync` (server.js:572)
- `/api/integration/oura/webhook` (server.js:579)
- `/api/integration/oura/normalize` (server.js:585)
- `/api/integration/apple-health/manifest` (server.js:592)
- `/api/integration/apple-health/normalize` (server.js:597)
- `/api/integration/health-connect/manifest` (server.js:604)
- `/api/integration/health-connect/normalize` (server.js:609)
- `/api/integration/meta-wearables/manifest` (server.js:616)
- `/api/integration/meta-wearables/normalize` (server.js:621)
- `/api/integration/device/selftest` (server.js:628)
- `/api/integration/validate` (server.js:634)
- `/api/integration/ingest` (server.js:641)
- `/api/vibeapp/simulate` (server.js:649)
- `/api/profile` (server.js:655)
- `/api/participants` (server.js:668)
- `/api/account/closure-request` (server.js:686)
- `/api/account/data-reset` (server.js:693)
- `/api/experiences` (server.js:700)
- `/api/agenda` (server.js:714)
- `/api/captures/status` (server.js:727)
- `/api/captures/uploads` (server.js:733)
- `/api/captures/commit` (server.js:741)
- `/api/captures` (server.js:749)
- `/api/v2/status` (server.js:782)
- `/api/v2/evidence` (server.js:788)
- `/api/v2/experiences` (server.js:795)
- `/api/media` (server.js:811)
- `/api/assets` (server.js:837)
- `/api/assets/adopt` (server.js:843)
- `/api/assets/reassign` (server.js:850)
- `/api/upload-attempts` (server.js:864)
- `/api/transcribe` (server.js:879)
- `/api/extract-document` (server.js:886)
- `/api/ocr-image` (server.js:893)
- `/api/translate-text` (server.js:900)
- `/api/search/semantic` (server.js:907)
- `/api/embeddings/backfill` (server.js:914)
- `/api/workspace/backfill` (server.js:921)
- `/api/jobs` (server.js:927)
- `/api/sync/state` (server.js:933)
- `/api/supabase/diagnostics` (server.js:939)
- `/api/supabase/self-test` (server.js:945)
- `/api/routines` (server.js:951)
- `/api/jobs/embeddings` (server.js:957)
- `/api/jobs/asset-processing` (server.js:964)
- `/api/report/pdf` (server.js:990)
- `/api/insights/pdf` (server.js:997)
- `/api/publication/pdf` (server.js:1004)
- `/api/manual/pdf` (server.js:1011)
- `/api/exports/file` (server.js:1018)
- `/api/obsidian/export` (server.js:1024)
- `/api/context/impact` (server.js:1031)
- `/api/daily-briefing` (server.js:1041)
- `/api/daily-briefing/latest` (server.js:1051)

## Escritores y reconciliadores

- `writeOuraTokenStore` (server.js:1775)
- `syncOuraApiData` (server.js:2301)
- `ingestIntegrationSignals` (server.js:2808)
- `ingestIntegrationSignal` (server.js:2845)
- `writeStore` (server.js:3850)
- `writeAgendaStore` (server.js:3909)
- `writeProfileParameters` (server.js:3921)
- `writeRoutineStore` (server.js:3940)
- `writeDailyBriefingStore` (server.js:3966)
- `upsertProfile` (server.js:4765)
- `upsertAgendaEvent` (server.js:4876)
- `upsertContextSignal` (server.js:4935)
- `upsertExperience` (server.js:4998)
- `upsertParticipantRecord` (server.js:5167)
- `syncExperienceEventsToSupabase` (server.js:5440)
- `syncExperienceAssetsToSupabase` (server.js:5482)
- `reconcileDeferredEvidenceForExperiences` (server.js:5511)
- `upsertAssetEvidence` (server.js:5864)
- `writeAssetEvidenceWithCompatibility` (server.js:5911)
- `saveMedia` (server.js:6771)
- `saveMediaBuffer` (server.js:6781)
- `commitDirectCaptureUpload` (server.js:7322)
- `receiveCapture` (server.js:7345)
- `receiveEvidenceV2` (server.js:7758)
- `saveExperienceV2` (server.js:7824)
- `saveStoredDailyBriefing` (server.js:11594)
- `saveExportFile` (server.js:12644)
- `saveObsidianExport` (server.js:12660)

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
- `manual-vibepwa2.md`
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
- `capture-guardian-729.md`
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
- `handcheck-vibepwa-728-capture-canary.md`
- `handcheck-vibepwa-729-capture-guardian.md`
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
- `vibeapp-v2-capture-contract.md`
- `vibepwa2-architecture.md`
- `vibepwa2-backend2-architecture.md`
- `vibepwa2-backend2-release-validation.md`
- `vibepwa2-canary-handcheck.md`
- `vibepwa2-decision-log.md`
- `vibepwa2-migration-runbook.md`
- `vibepwa2-operational-flows.md`
- `vibepwa2-vibeapp-contract.md`

## Reglas de limpieza

1. No retirar una ruta, vista o escritor hasta que una prueba demuestre que no participa en el flujo estable.
2. Toda captura nueva tendra una sola puerta de entrada; las rutas anteriores quedaran en compatibilidad temporal y luego se retiraran.
3. La complejidad tecnica se concentra en Operacion. El usuario ve Inicio, Historias, Evidencia, Inteligencia, Publicar y Cuenta.
4. Los documentos historicos no se borran durante la migracion; se apartan del manual y de la fuente de verdad.
