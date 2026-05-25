# Vibeapp native

Vibeapp is the future native companion for Vibe PWA. It focuses on real device capture: camera, video, audio, location, biometrics, notifications, offline queue, and transparent Supabase sync.

This folder is a starter skeleton. Flutter SDK is available locally at `C:\Users\msusf\Documents\Codex\flutter-sdk`; `flutter analyze`, `flutter test`, and `flutter build windows` have passed. Android builds still require Android Studio / Android SDK configuration.

## Current skeleton

- Quick text capture with visible sync state.
- Active experience mode: one long experience can collect several internal events before closing.
- Local queue panel for captures and pending device actions.
- Native photo and video flow with camera/gallery picker, local queue, `/api/media` upload, and experience attachment sync.
- Native audio recording with start/stop, private upload, and experience attachment sync.
- Native agenda event creation through `/api/agenda`, with optional link to the active experience as an internal event.
- Native location capture with permission, GPS coordinates, accuracy, and experience/event sync.
- Native biometric CSV/JSON file import with private upload, summary metadata, and PWA hydration as cross-experience context.
- External session import for Meta/Oakley/Ray-Ban, Oura, Apple Health, Samsung Health/Galaxy Watch, Health Connect, phone gallery, or other sources. Multiple files are grouped into one experience with internal events and normalized metadata.
- Development sync settings: Vibe API endpoint + Supabase Auth email/password.
- Text notes can sign in through the PWA public Supabase config, then attempt `POST /api/experiences` through the Vibe backend. If an experience is active, every note or native action becomes an internal event under the same experience ID.
- Photo, video, audio, agenda, location, and biometric file actions now use real backend contracts. Direct wearable APIs remain future connectors.
- User-facing states kept simple: ready, syncing, synced, or needs attention.

## First milestone

1. Supabase sign-in.
2. Quick text capture.
3. Local queue.
4. Sync one experience to Supabase.
5. Confirm the experience appears in Vibe PWA.
6. Start an active experience, add multiple notes/actions, close it, and confirm the PWA receives one experience with an event timeline.

## Second milestone

1. Capture or choose a photo/video with the native picker, or record audio from the device microphone.
2. Upload to private Supabase Storage through `/api/media`.
3. Save the experience with the returned attachment reference so the backend registers it in `assets`.
4. Confirm it appears in PWA Library, Assets, Reports, Findings, and Publications.

## Third milestone

1. Create agenda events from the native app without opening the PWA.
2. Sync those events through `/api/agenda` so they appear in the PWA Agenda and Dashboard.
3. If an experience is open, also add a matching internal event to the same experience.

## Fourth milestone

1. Capture the device location with explicit user permission.
2. Save latitude, longitude, accuracy, and timestamp as structured metadata.
3. Sync it as a standalone location experience or as an internal event in the active experience.

## Fifth milestone

1. Import CSV/JSON biometric exports from Apple Health or other wearables.
2. Detect record count, basic metrics, date range, and a short analytical summary.
3. Upload the file to private Storage and save metadata so the PWA can use it as cross-experience biometric context.

## Sixth milestone

1. Import an external session from Meta/Oakley/Ray-Ban, Oura, Apple Health, Samsung Health/Galaxy Watch, Health Connect, phone gallery, or another source.
2. Select several assets at once: images, videos, audio, documents, CSV/JSON, or ZIP.
3. Create one Vibe experience with internal events and linked assets, using the Clio-style pattern: native import, private Storage, normalized metadata, backend processing.
4. For Meta glasses, use the realistic flow: glasses capture -> Meta AI/phone gallery import -> Vibeapp external session import.

## Native capture contract

Every native action should emit the same normalized payload:

- `workspaceId`
- `participantId`
- `experienceId` or `openExperienceToken`
- `eventId` when the capture belongs to a specific internal event
- `deviceId`
- `sourceType`: text, audio, image, video, document, location, calendar, biometric
- `capturedAt`
- `timezone`
- `location` when permission exists
- `storagePath` for uploaded media
- `mimeType`
- `checksum`
- `syncStatus`: local, uploading, synced, failed, needsReview

The PWA remains the review, reporting, publication, and admin surface. Vibeapp native is the low-friction capture and device-permission layer.

## Third milestone

1. Native audio recording.
2. Background upload.
3. Backend transcription.
4. Event creation inside an open experience.
5. Optional calendar intent detection.

## Design rule

Simple for the user, sophisticated inside. The user should see: saved, syncing, synced, or needs attention. Supabase, Storage, retries, RLS, and diagnostics stay hidden unless advanced mode is enabled.
