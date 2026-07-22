# Capture Adoption Blueprint - 2026-07-21

## Executive decision

The capture blueprint is viable, but it changes the write model. It cannot be solved only by filtering Obsidian exports or by hiding cards in the UI.

Vibe must separate:

- Experience: a lived episode with human narrative and time range.
- Intentional evidence: media or files captured by the user, allowed to wait in an inbox before adoption.
- Ambient context: biometrics, GPS, weather, news, entertainment, and device context stored as time-based signals.

## Current fit

| Requirement | Current support | Gap |
|---|---|---|
| Evidence can exist before experience | `assets.experience_id` is nullable | Need explicit inbox/adoption status |
| Events belong to experiences | `experience_events.experience_id` is required | Good |
| Context can be crossed by time | Integration metadata stores context in generated `ctx-*` experiences | Must move to `context_signals` |
| Native media sync | `/api/media` exists | Must accept/track parentless evidence clearly |
| Experience adoption by range | Experiences have timestamp/duration | Need explicit adoption endpoint and proposal logic |
| Obsidian receives only experiences | Export rules now filter narrative | Backend must stop creating fake context experiences |

## Database implications

Use `database/evidence-adoption-context-signals.sql`.

It adds:

- Adoption fields to `assets`.
- A `context_signals` table with RLS.
- Indexes for inbox and time-window lookups.

This is intentionally additive. It does not delete existing records.

## Backend implications

The current function `buildContextExperienceFromIntegrationSignal()` is the main incompatibility. It builds experience rows from biometric/location/weather context. That made sense as an early synchronization shortcut, but it is no longer aligned with the product model.

Required replacement:

- `buildContextSignalFromIntegrationSignal()`
- `upsertContextSignal()`
- `buildAssetEvidenceFromIntegrationSignal()`
- `adoptEvidenceForExperience()`

The ingest router should write:

- `experience`: only human narrative or explicit experience records.
- `agenda`: agenda events.
- `assets`: intentional evidence, with or without parent.
- `context`: `context_signals`.

## UI implications

VibePWA needs an evidence inbox:

- "Evidence pending organization"
- "Suggested experience from this time window"
- "Adopt selected evidence"
- "Ignore for now"
- "Prune duplicate/wrong media"

The experience creation flow needs:

- Human narrative prompt.
- Start/end time range.
- Group/person.
- Suggested evidence to adopt.
- Ambient context snapshot preview.

## Vibeapp implications

Vibeapp should expose two simple user gestures:

1. Capture: photo, video, audio, document, quick note. This can be parentless.
2. Mark experience: "what happened?", time range, optional selected evidence.

Vibeapp should not force experience creation before a quick capture. It should send stable idempotency keys so later adoption updates existing evidence instead of creating duplicates.

## Obsidian implications

Obsidian remains downstream:

- `02_Experiences`: only narrative experiences.
- Assets/context appear as references inside the experience note.
- Ambient context never becomes an experience note.

## Acceptance criteria

1. A photo captured without an active experience lands in `assets` with `adoption_status = inbox`.
2. A biometric sample lands in `context_signals`, not `experiences`.
3. Creating an experience with a time range proposes nearby inbox evidence.
4. Adopting evidence updates the existing asset instead of creating a duplicate.
5. Obsidian export does not create notes for context signals or parentless technical media.
6. Reports, findings, and publications can use adopted evidence and referenced context.

## Recommendation

Implement in two blocks:

1. Schema and backend routing.
2. UI adoption flow and native app contract update.

Do not ship partial behavior that writes context as both `context_signals` and `ctx-*` experiences. That would recreate the same ambiguity under a new name.
