# Evidence Adoption to Obsidian Acceptance

Version: `20260723-evidence-adoption-assets-702`

## Purpose

Validate the complete intentional-evidence path without treating device context as an experience:

1. Vibeapp captures a photo, video, audio, or document without a parent experience.
2. The backend stores it in `assets` as `evidence_type = intentional` and `adoption_status = inbox`.
3. VibePWA shows it in the Evidence Inbox, filtered by the selected local calendar date.
4. The user selects it, saves an experience, and receives a confirmation with the adopted count.
5. The same `assets` row is updated to `adoption_status = adopted`, with `experience_id`, `adopted_at`, and adoption method. It is not duplicated.
6. The Obsidian export copies the original binary into `04_Assets/Images`, `Videos`, `Audio`, or `Documents` and writes an Obsidian link in the related note under `02_Experiences`.

## Required Result

- A successful export reports the count of real copied assets, saved experience notes, and generated map.
- A binary whose source was declared but cannot be downloaded makes the export fail before writing the map. The user sees `obsidian_assets_incomplete` instead of a false success.
- Ambient data, including biometrics, GPS, weather, and news, remains context. It is never promoted to `02_Experiences` simply because it occurred in the same time window.
- VibePWA never deletes existing experience notes automatically. Notes requiring retirement remain a reviewed human decision.

## Handcheck

1. Capture one new photo in Vibeapp with no active experience, then wait for its cloud status to show ready.
2. In VibePWA, open Capture and choose the same calendar date in Evidence Inbox. Confirm the photo is visible once as pending.
3. Create a short experience, select the photo, and save. Confirm the success message reports one adopted item.
4. Refresh Capture: the selected photo must no longer be pending.
5. Open Experience Map and export Markdown. Confirm the status reports at least one real asset saved.
6. In the local PC vault, open the matching note under `02_Experiences` and confirm the `## Activos vinculados` section contains an Obsidian link or embed.
7. Confirm the file itself exists under the appropriate `04_Assets` folder and opens from Obsidian.

## Boundaries

The browser can write only to the local vault explicitly connected through the File System Access picker. The expected vault is the folder containing `.obsidian`, not its parent folder. The backend issues a short-lived signed URL only after confirming that the requesting user belongs to the asset's workspace.
