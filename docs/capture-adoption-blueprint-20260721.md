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

Use `database/event-narrative-rollup.sql` when the event narrative layer is enabled.

It adds:

- `experience_events.narrative_text`
- `experience_events.narrative_status`
- An index for workspace-level event narrative review.

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

## Two-level narrative

Narrative can live at two levels:

- Experience narrative: the human tells what the full lived episode meant.
- Event narrative: the human tells what happened in one meaningful submoment inside a longer experience.

An event with narrative remains an event. Narrative does not promote it automatically. Scope decides the level.

Operational rule:

- `event.narrative_status = ok` only when the event has human language with real content.
- `experience.narrative = ok` when the experience itself has human narrative, or when at least one of its events has human narrative.
- The knowledge map counts narrated experiences, not loose narrative snippets. One experience with three narrated events counts as one narrated experience.
- Events remain optional and selective. The system may propose them, but it must not create one event for every evidence cluster without confirmation.

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
6. An experience with no global narrative but at least one narrated event exports as narrated by rollup.
7. Reports, findings, publications, and the knowledge map can use adopted evidence, referenced context, and event-level narrative without fabricating a global story.

## Recommendation

Implement in two blocks:

1. Schema and backend routing.
2. UI adoption flow and native app contract update.

Do not ship partial behavior that writes context as both `context_signals` and `ctx-*` experiences. That would recreate the same ambiguity under a new name.
