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
- When an active experience is open, biometric imports attach to that same experience instead of creating a duplicate standalone capture.
- External session import for Meta/Oakley/Ray-Ban, Oura, Apple Health, Samsung Health/Galaxy Watch, Health Connect, phone gallery, or other sources. Multiple files are grouped into one experience with internal events and normalized metadata.
- Local payload validation before sync: Vibeapp now checks title, text, events, file existence, empty files, MIME type, linked events, and source-specific expectations before sending a capture to Vibe.
- Local queue persistence: pending, failed, and synced queue items are saved to a device JSON cache so captures survive closing and reopening the app.
- Retry policy: failed sync attempts keep attempt count, last attempt time, and next retry time; manual retry can override the wait.
- Queue cleanup: synced native captures can be cleared from the local queue without touching remote Supabase data.
- Automatic retry loop: when the user is signed in, Vibeapp checks the local queue every 30 seconds and syncs eligible pending items without requiring manual action.
- Source-specific import guidance: Meta/Oakley, Oura, Apple Health, Samsung Health, Health Connect, gallery, and other imports show recommended file types and realistic workflow before file selection.
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

## Seventh milestone

1. Validate every queued payload before sync.
2. Show a clear queue badge: ready, ready with warnings, or review before sending.
3. Prevent invalid payloads from being sent to the backend.
4. Explain source-specific import rules before the user chooses files.
5. Keep warnings local and understandable: missing file, empty file, unknown MIME type, no linked event, or source/file mismatch.

## Eighth milestone

1. Persist the local queue as JSON in the device documents directory.
2. Restore captures at startup with status, error, remote ID, events, attachments, agenda data, location data, and biometric summaries.
3. Keep Supabase as the shared source of truth after sync; the local queue is only the native safety net.

## Ninth milestone

1. Track sync attempts, last attempt time, and next retry time per queued item.
2. Apply progressive wait times after transient failures.
3. Let the user force a retry from the sync card without losing the safer automatic retry schedule.

## Tenth milestone

1. Show queue summary by total, synced, attention, and scheduled retry items.
2. Clear already synced items locally without deleting remote records.
3. Keep failed or pending items visible until they sync or the user resolves them.

## Eleventh milestone

1. Retry eligible queued captures automatically every 30 seconds when a Supabase session is active.
2. Keep manual retry available for urgent sync without disabling the safer retry policy.
3. Preserve the local queue as a safety net while Supabase remains the shared source of truth.

## Twelfth milestone

1. Attach biometric CSV/JSON files to the active experience when one is open.
2. Preserve biometric summary, analytical text, metadata, event ID, and source file in the same session payload.
3. Avoid duplicate standalone biometric captures when the user is working inside one active experience.

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
- `validationStatus`: ready, warning, or blocked before network sync
- `validationMessages`: local user-readable checks before upload
- `queuePersistence`: local JSON cache for queued items, remote IDs, errors, and sync state
- `retryPolicy`: attempt count, last attempt, next retry, and manual retry override
- `queueMaintenance`: clear-synced local action that does not delete remote data
- `autoRetry`: background queue check for eligible items while the native session is active

The PWA remains the review, reporting, publication, and admin surface. Vibeapp native is the low-friction capture and device-permission layer.

## Third milestone

1. Native audio recording.
2. Background upload.
3. Backend transcription.
4. Event creation inside an open experience.
5. Optional calendar intent detection.

## Design rule

Simple for the user, sophisticated inside. The user should see: saved, syncing, synced, or needs attention. Supabase, Storage, retries, RLS, and diagnostics stay hidden unless advanced mode is enabled.
