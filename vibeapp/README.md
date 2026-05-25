# Vibeapp native

Vibeapp is the future native companion for Vibe PWA. It focuses on real device capture: camera, video, audio, location, biometrics, notifications, offline queue, and transparent Supabase sync.

This folder is a starter skeleton. Flutter SDK is available locally at `C:\Users\msusf\Documents\Codex\flutter-sdk`; `flutter analyze`, `flutter test`, and `flutter build windows` have passed. Android builds still require Android Studio / Android SDK configuration.

## Current skeleton

- Quick text capture with visible sync state.
- Active experience mode: one long experience can collect several internal events before closing.
- Local queue panel for captures and pending device actions.
- Native photo and video flow with camera/gallery picker, local queue, `/api/media` upload, and experience attachment sync.
- Native action placeholders for audio, calendar, biometrics, and location.
- Development sync settings: Vibe API endpoint + Supabase Auth email/password.
- Text notes can sign in through the PWA public Supabase config, then attempt `POST /api/experiences` through the Vibe backend. If an experience is active, every note or native action becomes an internal event under the same experience ID.
- Photo and video actions now use the native picker. The remaining media/device actions stay queued as clear event placeholders until plugins are connected.
- User-facing states kept simple: ready, syncing, synced, or needs attention.

## First milestone

1. Supabase sign-in.
2. Quick text capture.
3. Local queue.
4. Sync one experience to Supabase.
5. Confirm the experience appears in Vibe PWA.
6. Start an active experience, add multiple notes/actions, close it, and confirm the PWA receives one experience with an event timeline.

## Second milestone

1. Capture or choose a photo/video with the native picker.
2. Upload to private Supabase Storage through `/api/media`.
3. Save the experience with the returned attachment reference so the backend registers it in `assets`.
4. Confirm it appears in PWA Library, Assets, Reports, Findings, and Publications.

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
