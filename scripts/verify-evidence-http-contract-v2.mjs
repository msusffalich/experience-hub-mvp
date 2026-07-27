import assert from "node:assert/strict";
import { normalizeExperienceSubmissionV2 } from "../lib/evidence-http-contract-v2.mjs";

const normalizeExperience = (value) => ({
  ...value,
  attachments: Array.isArray(value.attachments) ? value.attachments : [],
  events: Array.isArray(value.events) ? value.events : [],
});

const macPayload = normalizeExperienceSubmissionV2({
  experience: {
    id: "experience-vibeapp-658",
    title: "Historia V2",
    events: [{ id: "event-1", title: "Evento narrado" }],
  },
  assetIds: ["photo-1", "audio-1", "photo-1"],
  assetEventMap: {
    "photo-1": "event-1",
    "audio-1": "",
  },
}, normalizeExperience);

assert.equal(macPayload.experience.id, "experience-vibeapp-658");
assert.equal(macPayload.events.length, 1);
assert.deepEqual(macPayload.assetLinks, [
  { assetId: "photo-1", eventId: "event-1" },
  { assetId: "audio-1", eventId: "" },
]);

const separatedEvents = normalizeExperienceSubmissionV2({
  experience: { id: "experience-separated", title: "Separada" },
  events: [{ id: "event-separated", title: "Evento separado" }],
  assetLinks: [{ assetId: "video-1", eventId: "event-separated" }],
}, normalizeExperience);

assert.equal(separatedEvents.events[0].id, "event-separated");
assert.deepEqual(separatedEvents.assetLinks, [
  { assetId: "video-1", eventId: "event-separated" },
]);

console.log("Evidence V2 HTTP contract: Vibeapp 658 payload compatibility passed.");
