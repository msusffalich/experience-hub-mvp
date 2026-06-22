# Vibeapp / VibePWA Operating Contract

Version: 2026-06-16

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

## Data Flow

1. Vibeapp captures or reads native/mobile data.
2. Vibeapp normalizes the payload locally and assigns a stable idempotency key.
3. Vibeapp sends the signal to the backend.
4. Backend writes the normalized record, asset, context, event, or experience to Supabase.
5. VibePWA reads the server state and refreshes Dashboard, Library, Assets, Reports, Findings, Publications, and Manual-facing status.

## API Responsibilities

- `POST /api/integration/ingest`
  - Text notes, agenda events, location signals, weather/news summaries, biometric summaries, Oura/Health Connect/Samsung context, and Meta/Oakley visual media metadata.
- `POST /api/media`
  - Binary photo, video, audio, document, and other files before or during experience consolidation.
- `POST /api/experiences`
  - Rich experiences with multiple events and already-linked assets.
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
