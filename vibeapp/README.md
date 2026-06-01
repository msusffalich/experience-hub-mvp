# Vibeapp native

Vibeapp is the future native companion for Vibe PWA. It focuses on real device capture: camera, video, audio, location, biometrics, notifications, offline queue, and transparent Supabase sync.

This folder is a starter skeleton. Flutter SDK is available locally at `C:\Users\msusf\Documents\Codex\flutter-sdk`; `flutter analyze`, `flutter test`, `flutter build windows`, and `flutter build apk --debug` have passed. Android SDK, command-line tools, JDK 21, NDK, CMake, platform-tools, and Android licenses are installed locally under `C:\Users\msusf\Documents\Codex`.

## Mobile packaging readiness

Safe native packaging baseline now in place:

- Android applies both the Android application plugin and Kotlin Android plugin, which is required because the launcher activity is Kotlin.
- Android uses the pilot package id `io.vibeapp.mobile`, replacing the default Flutter `com.example.vibeapp` placeholder.
- Android debug packaging is verified. The current debug APK is generated at `build/app/outputs/flutter-apk/app-debug.apk` after setting `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT`.
- Android release APK packaging is verified for direct pilot installation. The current signed APK is generated at `build/app/outputs/flutter-apk/app-release.apk`.
- Android bundle packaging is verified for the Play Console path. The current release bundle is generated at `build/app/outputs/bundle/release/app-release.aab` and signed with the local pilot upload key outside the repository.
- Android declares camera and microphone as optional hardware features. The app can request runtime permissions for capture without excluding pilot devices that lack one of those sensors.
- Android release builds use a real upload key when `android/key.properties` exists with `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. The local pilot key lives under `C:\Users\msusf\Documents\Codex\secure`; do not commit the key or passwords.
- iOS uses the pilot bundle id `io.vibeapp.mobile`, matching the Android package id for product continuity.
- iOS has user-facing usage strings for camera, microphone, photo library read/add, when-in-use location, and Apple Health read/write reservations.
- iOS includes `Runner/Runner.entitlements` with HealthKit enabled so the Xcode phase starts from an explicit entitlement baseline.

Pilot blockers that still need product/account decisions:

- Keep Android upload signing material local and backed up securely; do not commit keystores or passwords.
- Confirm the final production package id before Play Console registration. Changing it after store publication is painful, so treat `io.vibeapp.mobile` as the pilot candidate until product ownership is final.
- Migrate the Android Gradle/Kotlin stack to Flutter's built-in Kotlin path once all plugins support it. For now, AGP 8.13.1 is pinned because it builds reliably with `file_picker`, `image_picker_android`, `package_info_plus`, and `record_android`.
- Set the iOS development team and provisioning profile in Xcode once the Apple developer account is selected.
- Replace default Flutter launcher icons and launch images before external testers receive the app.

## iOS/Mac handoff

Windows can verify the iOS contract, plist, bundle id, and entitlements, but Apple still requires macOS/Xcode to compile, sign, install, and test on iPhone or iPad.

Run this on the shared workspace before moving to the Mac:

```powershell
npm run verify:ios
npm run package:vibeapp:ios
```

Then on the Mac:

1. Install Flutter and open `vibeapp/ios/Runner.xcworkspace` in Xcode.
2. Select the Apple Developer team for Runner.
3. Confirm bundle id `io.vibeapp.mobile`.
4. Confirm HealthKit capability is enabled and uses `Runner/Runner.entitlements`.
5. Run `flutter pub get`.
6. Run `VIBE_IOS_BUILD=1 npm run verify:ios` for a no-codesign build check, or build from Xcode for a signed device install.
7. Install on iPhone/iPad and test: sign-in, quick note, active experience, camera, video, audio, location, Apple Health export/import, queue retry, and PWA handoff.

The first Mac session should not redesign the app. Its goal is to confirm build/signing, permissions, and one real device capture-to-PWA loop.

## Current skeleton

- Quick text capture with visible sync state.
- Active experience mode: one long experience can collect several internal events before closing.
- Local queue panel for captures and pending device actions.
- Native photo and video flow with camera/gallery picker, local queue, `/api/media` upload, and experience attachment sync.
- Native audio recording with start/stop, private upload, and experience attachment sync.
- Native agenda event creation through `/api/integration/ingest`, with optional link to the active experience as an internal event.
- Native location capture with permission, GPS coordinates, accuracy, and experience/event sync.
- Native biometric CSV/JSON file import with private upload, summary metadata, and PWA hydration as cross-experience context.
- When an active experience is open, biometric imports attach to that same experience instead of creating a duplicate standalone capture.
- External session import for Meta/Oakley/Ray-Ban, Oura, Apple Health, Samsung Health/Galaxy Watch, Health Connect, phone gallery, or other sources. Multiple files are grouped into one experience with internal events and normalized metadata.
- Source-specific import profiles: Meta photos/videos are treated as visual memories, Meta JSON/HTML exports as account references, Oura/Apple/Samsung/Health Connect CSV/JSON as biometric context, and ZIP files as transport-only bundles.
- Local payload validation before sync: Vibeapp now checks title, text, events, file existence, empty files, MIME type, linked events, and source-specific expectations before sending a capture to Vibe.
- Local queue persistence: pending, failed, and synced queue items are saved to a device JSON cache so captures survive closing and reopening the app.
- Retry policy: failed sync attempts keep attempt count, last attempt time, and next retry time; manual retry can override the wait.
- Queue cleanup: synced native captures can be cleared from the local queue without touching remote Supabase data.
- Automatic retry loop: when the user is signed in, Vibeapp checks the local queue every 30 seconds and syncs eligible pending items without requiring manual action.
- Observable queue summary: Vibeapp separates ready-to-send captures, uploads in progress, automatic retries, user-action blockers, pending files, and pending events so a tester sees the real state without reading logs.
- Mobile pilot checklist: the main readiness card scores backend, session, queue, quick note, media, context, external sources, and PWA handoff before a phone or tablet test.
- Idempotent sync: experiences, agenda events, and media uploads send stable idempotency keys. Media also sends a stable Storage object hint so retries overwrite the same object instead of creating silent duplicates.
- Source-specific import guidance: Meta/Oakley, Oura, Apple Health, Samsung Health, Health Connect, gallery, and other imports show recommended file types and realistic workflow before file selection.
- Mobile pilot gate: the main screen can verify the production Vibe backend, show session status, summarize local queue risk, and confirm capture capabilities before a real phone/tablet test.
- Android permission baseline includes network state, internet, camera, microphone, location, image/video/audio library access, legacy storage read, and notifications so mobile builds do not fail on basic platform permissions.
- Local command router: text typed in quick capture can interpret practical V commands before sync. Examples: take note, start experience, close experience, or create an agenda reminder. The same parser can later consume native speech-to-text transcripts.
- Command preview: before saving, Vibeapp shows what it understood and changes the primary button to the expected action, such as Save note, Create agenda, Start experience, or Close experience.
- Development sync settings: Vibe API endpoint + Supabase Auth email/password.
- Text notes can sign in through the PWA public Supabase config, then use `POST /api/integration/ingest` through the Vibe backend. If an experience is active, every note or native action becomes an internal event under the same experience ID.
- Photo, video, audio, agenda, location, and biometric file actions now use real backend contracts. Non-binary signals use `/api/integration/ingest`; binary media uses `/api/media`; rich sessions with attachments consolidate through `/api/experiences`. Direct wearable APIs remain future connectors.
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
2. Sync those events through `/api/integration/ingest` so they appear in the PWA Agenda and Dashboard.
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
