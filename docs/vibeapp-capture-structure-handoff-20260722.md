# Vibeapp capture/structure handoff

Version: 2026-07-22

Purpose: align Vibeapp with the product split now implemented in VibePWA.

## Product decision

Vibeapp captures facts in the moment. VibePWA structures those facts into experience memory.

This is not two databases and not two competing truths. The backend/Supabase record remains the single source of truth. Vibeapp may create a simple finished experience only when the user explicitly chooses to close it on the phone, but ordinary mobile use should favor fast capture into the evidence/context layers.

## Native UI changes required

### 1. Home should separate two primary actions

- `Capturar hecho`: fast path for voice, text, photo, video, audio, document, location, biometrics, weather/news, and wearable context.
- `Marcar experiencia`: deliberate path to define a lived episode with title, time range, group/person, and human narrative.

The default mobile button should be `Capturar hecho`, because the phone is closest to the lived moment.

### 2. Capture fact flow

The user should not have to define an experience before taking a photo, recording audio, or saving sensor/context data.

Every captured fact must include:

- `sourceId`: stable device/local id.
- `idempotencyKey`: stable retry key.
- `capturedAt`: phone timestamp in ISO format.
- `participantId`: selected group/person, or primary user fallback.
- `sourceDevice`: iPhone, iPad, Android, Meta/Oakley import, Oura, Apple Health, Health Connect, Samsung/Galaxy, etc.
- `payloadType`: text, audio, image, video, document, location, weather, news, health, activity, sleep, entertainment.
- `targetLayer`: one of `evidence`, `context`, `agenda`, `experience`.

### 3. Evidence vs context routing

Intentional evidence goes to `/api/media` when binary, or `/api/integration/ingest` when it is a text/voice narrative fragment.

- Photo, video, audio, document: `/api/media`.
- Text/voice/video speech where the user tells what happened: `/api/integration/ingest` with `targetLayer: evidence` or `experience` depending on user intent.
- Location, weather, news, biometrics, activity, sleep, device context: `/api/integration/ingest` with `targetLayer: context`.
- Calendar intent: `/api/integration/ingest` with `targetLayer: agenda`.

Media without `experienceId` is valid. The backend stores it in `assets` with `adoptionStatus: inbox`. VibePWA now displays that evidence inbox in Capture/Assets so it can be adopted later.

### 4. Mark experience flow

When the user chooses to create or close an experience on Vibeapp, send a canonical experience to `/api/experiences`.

Required fields:

- `title`
- `startedAt` / `endedAt`, or `timestamp` plus `duration`
- `participantId`
- `category` only when it is a real experience category, not place/state
- `notes` or `narrativeText` when the user narrated the experience
- `events[]` when submoments are meaningful
- `adoptedAssetIds[]` or linked attachments when evidence is explicitly attached

### 5. Event narrative

Events can have their own human narrative.

Each event may include:

```json
{
  "id": "event-local-id",
  "title": "Charla en el cafe",
  "timestamp": "2026-07-22T16:10:00-04:00",
  "narrativeText": "Hablamos de la idea principal y acordamos probarla manana.",
  "sourceType": "voice_transcript"
}
```

The backend derives `narrativeStatus` from `narrativeText`. Do not send `ok` for machine vision, OCR, filenames, biometrics, weather, GPS, or placeholders.

### 6. Group/person selection

After login, Vibeapp must call `GET /api/mobile/participants` and show the available groups/persons. The selected group/person must be attached to all captures, evidence, context, events, and experiences.

If there is no group, use the primary user fallback from the backend. Do not block capture because a group list is empty.

### 7. Local queue rules

- The queue must survive app restart.
- Retries must reuse the same `idempotencyKey`.
- A failed media upload must remain visible as not synchronized.
- A context signal failure must not mark the whole capture as completed.
- The user-facing state should be simple: `Listo`, `Sincronizando`, `Requiere accion`.

## Acceptance checks

Vibeapp is aligned when these scenarios pass:

1. Take a photo without starting an experience. It uploads to `/api/media` and appears in VibePWA evidence inbox as waiting for story.
2. Record a voice note that tells what happened. It arrives as human narrative and can become an experience or event narrative.
3. Send Apple Health/Oura/Health Connect/Samsung data. It lands as context, not as an experience.
4. Start an experience, add two events, narrate one event, close it. VibePWA and Obsidian count the experience as narrated through event rollup.
5. Turn off network, capture photo/audio/context, restart app, restore network, and confirm all pending items sync with the same ids.

## Protocol back to VibePWA

When Vibeapp changes are ready, return:

- Build number and platform tested.
- Endpoint matrix used.
- Three sample payloads: evidence inbox media, context signal, experience with event narrative.
- Screenshots of the native home and capture screens.
- Result of queue/retry test.

