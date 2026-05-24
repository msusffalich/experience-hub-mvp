# Vibeapp native

Vibeapp is the future native companion for Vibe PWA. It focuses on real device capture: camera, video, audio, location, biometrics, notifications, offline queue, and transparent Supabase sync.

This folder is a starter skeleton. Flutter SDK is not installed in the current Codex environment, so the project is prepared but not compiled here.

## First milestone

1. Supabase sign-in.
2. Quick text capture.
3. Local queue.
4. Sync one experience to Supabase.
5. Confirm the experience appears in Vibe PWA.

## Second milestone

1. Capture photo from the native camera.
2. Upload to private Supabase Storage.
3. Register the asset in `assets`.
4. Confirm it appears in PWA Library, Assets, Reports, Findings, and Publications.

## Third milestone

1. Native audio recording.
2. Background upload.
3. Backend transcription.
4. Event creation inside an open experience.
5. Optional calendar intent detection.

## Design rule

Simple for the user, sophisticated inside. The user should see: saved, syncing, synced, or needs attention. Supabase, Storage, retries, RLS, and diagnostics stay hidden unless advanced mode is enabled.

