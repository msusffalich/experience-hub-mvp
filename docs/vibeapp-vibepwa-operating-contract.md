# Vibeapp / VibePWA Operating Contract

Version: 2026-06-24

Current native reference: Vibeapp iOS build `0.5.33+646`.

Latest sync notes:

- 2026-07-22: the implementation handoff for the new capture/structure split is documented in `docs/vibeapp-capture-structure-handoff-20260722.md`.
- Vibeapp build 646 is installed on a physical iPhone and includes **Probar Arnes** in `Cuenta -> Asistente V`.
- `GET /api/mobile/assistant/status` is the read-only diagnostic endpoint used by that button. It must require the user's Supabase bearer and must not spend LLM tokens.
- Arnes key rotation was completed on 2026-06-19. VibePWA must never receive, store, or write that key in notes, USB files, or chat.
- Android remains in standby until a real device is available.

## Product Roles

Vibeapp is the native capture and mobile context app. It is responsible for data that requires device control or mobile proximity:

- Text notes, voice notes, camera photos, gallery images, video, audio, and quick commands through V.
- Location, movement context, device-local time, and mobile situation.
- Weather, news, and daily context derived from the user's current mobile context.
- Apple Health, Health Connect, Oura, Samsung/Galaxy, Meta/Oakley visual media, and other device or wearable sources.
- Local queue, retry, and idempotency for native captures.

VibePWA is the web analysis and operations surface. It is responsible for:

- Dashboard, Library, Assets, Timeline, Map, Agenda review, Reports, Findings, Publications, Manual, and Administration.
- Reading synchronized server data and turning it into memory, analytics, reports, outputs, and operational checks.
- Manual imports only for historical backfill, backup, recovery, or administration.
- Connector diagnostics and self-tests, not ordinary user capture.

Supabase and the backend are the single source of truth. Both apps must converge there before a flow is considered complete.

## Platform Orientation

Vibeapp captures first. It is optimized for the moment when the user is living something and needs fast capture: voice, text fragments, photo, video, audio, documents, location, biometrics, wearable signals, and daily mobile context.

VibePWA structures first. It is optimized for the later work of turning captured facts into experience memory: evidence inbox, experience creation, event promotion, evidence adoption, reports, findings, publications, knowledge map, Obsidian, manual, and operations.

This orientation is not a hard permission boundary:

- Vibeapp may close a quick experience when the user explicitly wants to finish it on the phone or tablet.
- VibePWA may create a complete experience from keyboard/manual input, especially for desktop work or historical backfill.
- The primary UI must still keep the jobs clear: Vibeapp should not become a complex analysis cockpit, and VibePWA should not pretend to replace native device capture.

Single ownership rule:

- The backend/Supabase model owns the canonical experience record.
- Vibeapp can originate or close a simple experience, but it writes through the same backend contract and idempotency rules.
- VibePWA can create or restructure experiences, but it must update the same canonical records.
- No platform may keep a private parallel experience copy as product truth. Local queues and caches are temporary transport/resilience layers only.

## Data Flow

1. Vibeapp captures or reads native/mobile data.
2. Vibeapp normalizes the payload locally and assigns a stable idempotency key.
3. Vibeapp sends the signal to the backend.
4. Backend writes the normalized record to the correct layer: experience, event, evidence asset, or ambient context signal.
5. VibePWA reads the server state and refreshes Dashboard, Library, Assets, Reports, Findings, Publications, and Manual-facing status.

## Capture Hierarchy

Vibe uses the hierarchy `person -> experience -> event -> evidence/data`.

- Person: signed-in owner and selected group/person.
- Experience: a lived episode with time range and human narrative.
- Event: optional meaningful submoment inside a long experience.
- Evidence/data:
  - Intentional evidence: photo, audio, video, document, quick note, or file captured by the user.
  - Ambient context: biometrics, GPS, weather, news, entertainment, and device context.

Intentional evidence is allowed to exist before its parent experience. It starts in an evidence inbox with timestamp, person, source, and idempotency. Later, an experience adopts evidence by time window, place, group/person, or explicit user selection.

Ambient context is different: it is stored as a time-based signal and referenced by experiences. It must not create an experience note by itself.

Narrative can exist at the experience level or event level:

- Experience narrative describes the full lived episode.
- Event narrative describes one meaningful submoment inside a longer experience.
- A narrated event remains an event; promotion to experience is a curation decision, not an automatic consequence of having text.
- An experience is considered narrated when it has its own human narrative or at least one narrated event.
- Metrics such as "real narrative" count narrated experiences, not the number of event narratives.

## Canonical Event Contract

Vibe uses two different concepts that must not be mixed:

- Lived event: an optional meaningful submoment inside an experience. This is stored in `experience_events` and always has an `experience_id`.
- Agenda event: a scheduled calendar item. This is stored through the Agenda/calendar path and remains separate from lived experience events.

The structuring output shown in VibePWA or Obsidian uses the lived event model after curation. It is not a third table and must not create a parallel event truth.

A narrated moment captured without an open experience is still not a loose lived event. It is intentional evidence or an `experience_candidate` until VibePWA adopts it into an experience. It becomes a lived event only when it receives a parent experience.

Canonical lived event fields:

- `id`: stable local or server event id.
- `title`: short human label.
- `description`: brief context or label; not used as narrative.
- `order`: position inside the parent experience.
- `timestamp` or `occurredAt`: when the submoment happened.
- `duration`: optional minutes.
- `sourceType`: source of the event/narrative signal, such as `manual`, `text_note`, `voice_transcript`, `video_transcript`, `vibeapp-native`, or `vibeapp-native-audio`.
- `sourceDevice` and `sourceId`: optional native traceability.
- `narrativeText`: canonical human narrative for the submoment.
- `linkedAssetIds`: optional evidence already associated with the event.

`narrativeText` is the canonical narrative field. The backend accepts legacy aliases such as `narrative_text`, `narrative`, `humanNarrative`, `manualNote`, `voiceTranscript`, `transcript`, and `notes` during transition. `description` is intentionally not treated as narrative, because descriptions often contain labels, filenames, or short operational notes.

Loose media or sensor/context data must not create lived events by itself. Without a parent experience, intentional media goes to the evidence inbox; ambient signals go to context. VibePWA owns later adoption: attach evidence to the whole experience, attach it to an existing event, or create a new event during human-confirmed structuring.

When Vibeapp creates an event inside an explicit experience flow, it must keep stable identity and parentage. Obsidian and the VibePWA map may later render that event as a child node when it has narrative/evidence weight, or inline inside the parent experience when it is only a light label. That rendering decision belongs to the map/curation layer, not to native capture.

## API Responsibilities

- `POST /api/integration/ingest`
  - The endpoint acknowledges validated writes quickly. Slow enrichment such as climate, news, daily briefing, and location impact runs as deferred post-ingest automation unless `awaitAutomation`, `awaitPostIngestAutomation`, or `inlineAutomation` is explicitly requested for diagnostics.
  - Text or transcribed human narrative may create/update an experience when the payload represents a lived episode.
  - Agenda events create/update Agenda.
  - Agenda payloads must use `targetLayer: "agenda"` and `payloadType: "calendar"`. They schedule or organize future commitments; they do not create experience events or narrative memory until the user later converts/links them after the moment is lived.
  - Location, weather/news summaries, biometric summaries, Oura/Health Connect/Samsung context, and entertainment summaries are ambient context signals, not experiences.
  - Meta/Oakley visual media metadata and other media metadata are evidence descriptors; the binary file goes through `/api/media`.
- `POST /api/media`
  - Binary photo, video, audio, document, and other files before or during experience consolidation.
  - Media without `experienceId` stays in the evidence inbox until adopted.
- `POST /api/experiences`
  - Rich experiences with multiple events and already-linked or adoptable assets.
  - Experiences should provide a time range (`startedAt`/`endedAt` or `occurredAt` plus duration) so the backend can propose/adopt evidence and reference ambient context.
  - Events may include `narrativeText` and `narrativeStatus`. The backend derives the status from human text when possible and stores it in event metadata, and in `experience_events.narrative_text/status` after the Supabase migration is applied.
- `GET /api/mobile/participants`
  - Groups/persons visible to the signed-in account so Vibeapp can attach every capture to the correct group/person.
- `POST /api/participants`
  - VibePWA creates or updates a group/person for the signed-in account.
- `PATCH /api/participants/{participantId}`
  - VibePWA archives or reactivates a group/person.
  - Archiving removes the group from new captures and normal filters, but does not delete saved experiences, assets, reports, or audit history.
- `POST /api/account/closure-request`
  - VibePWA records a user-requested account closure request.
  - This is not immediate destructive deletion; backup, identity confirmation, and server-side review are required before final deletion.
- `POST /api/mobile/assistant/message`
  - Server-side assistant calls for Vibeapp.
  - The backend must preserve the native `system`, `text`, and `history` fields when proxying to Arnes or the native provider.
  - When the native `system` requests JSON/actions mode, the backend reinforces the JSON-only instruction and normalizes the response to the stable shape `{ actions: [], answer: "" }`, even if the provider wraps JSON in text or Arnes returns `actions` as a separate field.
  - If Arnes is enabled but responds with prose or an incompatible contract in JSON/actions mode, the backend treats that as `arnes_assistant_contract_invalid` and falls back to the native provider.
  - If the model fails to return valid agent JSON, the backend returns an explicit fallback action `answer` instead of silent prose-only ambiguity.
  - Free Q&A mode must remain conversational. The backend only enters JSON/actions mode when the native `system` contains the action schema and an explicit JSON-only instruction.
- `GET /api/mobile/assistant/status`
  - Protected status endpoint for Vibeapp to confirm whether Arnes is enabled, whether Arnes `/health` responds, and which `source` value should appear in assistant responses.
  - Does not expose secrets or full service URLs.
- `POST /api/mobile/ai/transcribe`
  - Server-side audio transcription for Vibeapp.
- `POST /api/mobile/realtime/token`
  - Server-side OpenAI Realtime ephemeral token minting for Vibeapp voice through glasses or phone/tablet audio.
  - Requires the signed-in user's bearer token.
  - Vibeapp receives only the short-lived client secret/token, never the OpenAI API key.
  - Defaults are server-controlled with `OPENAI_REALTIME_MODEL` and `OPENAI_REALTIME_VOICE`.
  - Use `OPENAI_REALTIME_API_KEY` for a dedicated voice/realtime key when available; otherwise the backend falls back to `OPENAI_API_KEY`.
- `POST /api/mobile/ai/vision`
  - Server-side image interpretation for Vibeapp.
  - Canonical route for new Vibeapp builds. The backend also accepts legacy `POST /api/mobile/assistant/vision` temporarily so installed builds do not break during the transition.
- `GET /api/mobile/context/daily?lat={lat}&lon={lon}&lang={es|en|fr}`
  - Server-side daily context summary for Vibeapp/Arnes when the phone or tablet provides current location.
  - Requires the signed-in user's bearer token.
- `GET /api/mobile/context/health-summary?from={iso-date}&to={iso-date}&lang={es|en|fr}`
  - Server-side read endpoint for normalized biometric, activity, and sleep context already ingested from Vibeapp or device connectors.
  - This is the endpoint Arnes should use for health context. It returns a privacy-limited summary and recent signal previews, not raw complete health exports.
- `GET /api/mobile/oura/{collection}`
  - Server-side Oura proxy, when OAuth/token storage is active.
  - Supported collections follow the backend Oura manifest, currently: `daily_readiness`, `daily_sleep`, `sleep`, `daily_activity`, `daily_stress`, `daily_resilience`, `daily_spo2`, `heartrate`, `workout`, `daily_cardiovascular_age`, `vo2_max`, and `ring_battery_level`.

## Current Mobile Endpoint Matrix

| Endpoint | Method | Auth | Current contract status |
|---|---:|---|---|
| `/api/config` | GET | Public | Available. Exposes safe runtime configuration only. |
| `/api/health` | GET | Public | Available. Health/status endpoint. |
| `/api/mobile/auth/sign-in` | POST | Email/password | Available. Returns Supabase access/refresh token for Vibeapp. |
| `/api/mobile/assistant/message` | POST | Supabase bearer | Available. Routes to Arnes when enabled, otherwise `native-provider`. |
| `/api/mobile/assistant/status` | GET | Supabase bearer | Available. Read-only Arnes diagnostic for Vibeapp build 646. |
| `/api/mobile/ai/vision` | POST | Supabase bearer | Available. Backend-only provider key; returns `{ text }`. Legacy `/api/mobile/assistant/vision` remains accepted temporarily. |
| `/api/mobile/ai/transcribe` | POST | Supabase bearer | Available. Multipart audio proxy; provider key remains backend-only. |
| `/api/mobile/realtime/token` | POST | Supabase bearer | Available. Returns OpenAI Realtime ephemeral token and `wsUrl`; provider key remains backend-only. |
| `/api/mobile/context/daily` | GET | Supabase bearer | Available. Requires `lat` and `lon`; returns mobile daily context. |
| `/api/mobile/context/health-summary` | GET | Supabase bearer | Available. Privacy-limited summary of normalized health context already ingested. |
| `/api/mobile/participants` | GET | Supabase bearer | Available. Returns active groups/persons for capture association. |
| `/api/mobile/oura/{collection}` | GET | Supabase bearer | Available for Oura manifest collections when OAuth/token storage is active. |
| `/api/integration/ingest` | POST | Supabase bearer | Available. Normalized external/mobile signal ingest. |
| `/api/media` | POST | Supabase bearer | Available. Binary media upload path. |
| `/api/experiences` | GET/POST | Supabase bearer | Available. Shared experience persistence. |

## Arnes Assistant Layer

Arnes is the optional native assistant orchestration service for Vibeapp. It should run as a separate Railway service and stay additive.

- Vibeapp continues calling `POST /api/mobile/assistant/message`.
- VibePWA/backend may forward that request to Arnes only when `ARNES_ASSISTANT_ENABLED=true` and `ARNES_ASSISTANT_URL` is configured.
- The backend forwards the signed-in user's bearer token to Arnes. Arnes should reuse that bearer when calling user-scoped VibePWA endpoints.
- Do not use a service-role token for ordinary user data. Service credentials are reserved for narrow backend-only administration, never normal assistant reads.
- Arnes may call:
  - `POST /api/mobile/ai/vision`
  - `GET /api/mobile/context/daily`
  - `GET /api/mobile/context/health-summary`
  - Existing ingestion/media endpoints only when an action explicitly creates or updates user data.
- If Arnes is unavailable, the backend falls back to the existing mobile assistant provider so installed Vibeapp builds do not break.
- Arnes responses must preserve the current client contract: `answer` or `text`, plus optional `actions[]`.
- Vibeapp can call `GET /api/mobile/assistant/status` after login to verify Arnes configuration. The decisive E2E proof remains the response from `POST /api/mobile/assistant/message`: `source: "arnes"` means the route used Arnes; `source: "native-provider"` means fallback.

## Context Rules

- Weather and news belong to the mobile/native context path. Vibeapp should send the relevant daily context when it has current location and permission.
- VibePWA may keep a manual city as a backup only when no recent mobile context exists.
- Biometrics belong to the native/device path. Vibeapp should read Apple Health, Health Connect, Oura, or Samsung/Galaxy when available.
- VibePWA exposes health context back to Vibeapp/Arnes through `/api/mobile/context/health-summary` after ingestion, so assistant decisions can use server truth without asking the client to resend raw files.
- Meta/Oakley/Ray-Ban glasses are a visual source only for this product stage. Vibe can analyze imported photos/videos, but V voice, wake, microphone, and spoken dialogue remain on the phone or tablet.
- VibePWA asset import for biometric files is historical/recovery/admin only. It must not be presented as the normal user path.
- Reports, Findings, and Publications use the server-normalized context, regardless of whether it came from live native capture or a backup import.
- Context signals enrich experiences by time and place. They are not promoted into experiences, events, or Obsidian experience notes.

## Evidence Adoption Rules

- Capturing evidence is cheap and may happen without choosing an experience first.
- Marking an experience is a separate gesture: narrative, time range, group/person, and optional events.
- Narrating an event is a separate gesture inside an open experience: voice or text tied to that submoment.
- When an experience is marked, the backend proposes evidence in the same time window and context.
- User or automation can adopt intentional evidence into the experience.
- Curation can later promote an event into its own experience, or demote an experience into an event/context candidate, while preserving timestamps and evidence links.
- Pruning intentional evidence may remove duplicate or wrong user media from the experience view.
- Ambient context is never pruned for narrative reasons; only sensor errors, duplicates, or corrupt samples may be cleaned as data hygiene.

## UX Rules

- End users should not see connector complexity in normal daily panels.
- VibePWA may show connector health in Administration and Data Origins.
- Vibeapp should show clear capture actions, group/person selector, sync status, and retry state, without exposing backend mechanics.
- Vibeapp voice/realtime UI must request `/api/mobile/realtime/token` just before opening the OpenAI Realtime WebSocket because the token is intentionally short-lived.
- VibePWA owns group/person creation, archive/reactivation, and account-closure requests.
- Vibeapp reads active groups/persons and may select the active group, but it must not delete groups, users, or historical records.
- Any action that changes data must confirm success, pending state, or actionable failure in plain language.

## Acceptance Checks

For each mobile/native source:

1. Capture or import creates a local queued item in Vibeapp.
2. The queue sends the payload with auth and idempotency.
3. Backend accepts and stores the normalized record.
4. VibePWA shows the record in the correct surface.
5. Reports/Findings/Publications can use it without manual reprocessing.
6. Retry does not create duplicates.
7. Offline capture syncs after reconnect.
