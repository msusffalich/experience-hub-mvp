# Capture Adoption Blueprint - 2026-07-21

## Executive decision

The capture blueprint is viable, but it changes the write model. It cannot be solved only by filtering Obsidian exports or by hiding cards in the UI.

Vibe must separate:

- Experience: a lived episode with human narrative and time range.
- Intentional evidence: media or files captured by the user, allowed to wait in an inbox before adoption.
- Ambient context: biometrics, GPS, weather, news, entertainment, and device context stored as time-based signals.

The central product rule is: capture is not the same as structuring. Capture must stay cheap and fast; structuring is the later act of giving meaning, time range, narrative, events, and evidence adoption.

Platform orientation:

- Vibeapp captures first. Its main job is recording facts close to the person and device: voice, notes, camera, video, files, biometrics, location, and mobile context.
- VibePWA structures first. Its main job is reviewing, organizing, adopting evidence, building stories, analyzing, reporting, publishing, and exporting to Obsidian.
- This is a product orientation, not a hard block. VibePWA may still create a full experience from the keyboard, and Vibeapp may still close a quick experience when the user explicitly wants to do it. The primary UI of each platform must not confuse these jobs.

Single write rule: even when both apps can originate an experience, the canonical experience record lives in the same backend/Supabase model. Vibeapp must not keep a parallel experience store, and VibePWA must not create a second copy of the same lived episode. Idempotency keys, source ids, and server-side upsert rules decide whether a payload creates a new record or updates/adopts into an existing one.

Blueprint ownership rule: this file is the implementation blueprint for VibePWA/backend/Vibeapp integration. The Obsidian vault blueprint in `90_System` is the conceptual mirror for knowledge work. They may use different language, but they must not contradict the platform split, hierarchy, narrative definition, or evidence/context rules.

Build `20260722-event-narrative-rollup-684` is validated by code, SQL, contract checks, and simulated integration. Build `20260722-capture-structure-split-685` starts the implementation split: Vibeapp captures evidence in the moment, while VibePWA structures that evidence into experiences, events, reports, publications, and the Obsidian map.

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

## Capture restructuring block

Next implementation priority: separate two flows that happen at different times and cannot share the same UI without confusing the user.

### Flow 1 - Capture facts in the moment

This flow is immediate. The user is living something and only wants to record facts with minimum friction:

- Spoken or written narrative fragments.
- Photos, videos, audio, documents, and quick notes.
- Device context already available from Vibeapp, such as location and biometric context.

This flow does not need a finished experience. It writes evidence and narrative fragments with timestamp, owner, group/person, source, and idempotency. If there is no parent experience yet, intentional evidence remains in the evidence inbox.

Primary platform: Vibeapp. VibePWA can offer a backup/manual capture path, but it should not be the main mobile capture surface.

### Flow 2 - Build stories from captured facts

This flow happens during review or closure. The user organizes meaning after enough facts exist:

- Create or confirm the experience.
- Define time range, title, group/person, place, and global narrative.
- Promote meaningful submoments into events.
- Attach or adopt evidence by time window.
- Add event-level narrative when a submoment deserves its own voice.

The product must not force Flow 2 during Flow 1. Forcing the user to define the experience before capturing facts breaks real-world capture. Turning every captured fact into an experience breaks memory and produces fake nodes.

Primary platform: VibePWA. Vibeapp can offer quick closure for simple cases, but deep organization, map, reports, findings, publications, and Obsidian belong to the web workspace.

### Required gestures

1. Capture evidence: quick photo, video, audio, document, note, or imported file. It can be parentless and must land in the evidence inbox.
2. Mark experience: choose or confirm the lived episode, time range, group/person, and human narrative. The experience adopts nearby intentional evidence by proposal and confirmation.
3. Narrate event: while reviewing an open experience, add voice or text to a meaningful submoment. This creates or updates `event.narrativeText`; it does not automatically promote the event to a new experience.

This block is the real acceptance path for build 684. The first real test must create an experience without global narrative, add one narrated event, sync it, export to Obsidian, and confirm that the experience note has `narrative: "ok"` by rollup.

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
