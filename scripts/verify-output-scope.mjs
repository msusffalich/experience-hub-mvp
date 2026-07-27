import assert from "node:assert/strict";
import {
  applyOutputScope,
  assertPublicationSelection,
  normalizeOutputScope,
  OutputScopeError,
} from "../lib/scope/output-scope.mjs";

const now = "2026-07-27T15:00:00-04:00";
const dataset = {
  stories: [
    {
      id: "story-work",
      ownerUserId: "miguel",
      participantId: "principal",
      startedAt: "2026-07-25T14:00:00-04:00",
      category: "Trabajo",
      title: "Reunión con cliente",
    },
    {
      id: "story-social",
      ownerUserId: "miguel",
      participantId: "family",
      startedAt: "2026-07-26T18:00:00-04:00",
      category: "Social",
      title: "Cena familiar",
    },
  ],
  evidence: [
    {
      assetId: "work-photo",
      ownerUserId: "miguel",
      participantId: "principal",
      capturedAt: "2026-07-25T14:10:00-04:00",
      kind: "image",
      experienceId: "story-work",
    },
    {
      assetId: "loose-photo",
      ownerUserId: "miguel",
      participantId: "principal",
      capturedAt: "2026-07-25T15:10:00-04:00",
      kind: "image",
      experienceId: null,
    },
  ],
  context: [
    {
      id: "heart-rate",
      ownerUserId: "miguel",
      participantId: "principal",
      occurredAt: "2026-07-25T14:05:00-04:00",
      kind: "biometric",
    },
  ],
};

verifyDefaults();
verifySharedScopeAcrossOutputs();
verifyCategoryDoesNotInventClassification();
verifyPublicationConfirmation();

console.log("Output scope: common timeframe, person, basis and editorial rules passed.");

function verifyDefaults() {
  const scope = normalizeOutputScope(
    { ownerUserId: "miguel" },
    { now, outputType: "report" },
  );
  assert.equal(scope.basis, "all");
  assert.equal(scope.includeContext, true);
  assert.equal(scope.participantIds.length, 0);
  assert.match(scope.timeframe.from, /^2026-07-21/);
  assert.match(scope.timeframe.to, /^2026-07-27/);
}

function verifySharedScopeAcrossOutputs() {
  for (const outputType of ["report", "insights", "publication"]) {
    const result = applyOutputScope(
      dataset,
      {
        ownerUserId: "miguel",
        participantId: "principal",
        from: "2026-07-24T00:00:00-04:00",
        to: "2026-07-27T23:59:59-04:00",
        basis: "all",
        editorialSelectionConfirmed: true,
      },
      { now, outputType },
    );
    assert.deepEqual(result.stories.map((item) => item.id), ["story-work"]);
    assert.deepEqual(result.evidence.map((item) => item.assetId), ["work-photo", "loose-photo"]);
    assert.deepEqual(result.context.map((item) => item.id), ["heart-rate"]);
  }
}

function verifyCategoryDoesNotInventClassification() {
  const result = applyOutputScope(
    dataset,
    {
      ownerUserId: "miguel",
      from: "2026-07-24T00:00:00-04:00",
      to: "2026-07-27T23:59:59-04:00",
      category: "Trabajo",
    },
    { now, outputType: "report" },
  );
  assert.deepEqual(result.stories.map((item) => item.id), ["story-work"]);
  assert.deepEqual(result.evidence.map((item) => item.assetId), ["work-photo"]);
  assert.equal(result.excluded.unclassifiedEvidenceByCategory, 1);
  assert.deepEqual(result.context.map((item) => item.id), ["heart-rate"]);
}

function verifyPublicationConfirmation() {
  const scope = normalizeOutputScope(
    { ownerUserId: "miguel" },
    { now, outputType: "publication" },
  );
  assert.equal(scope.requiresEditorialConfirmation, true);
  assert.throws(() => assertPublicationSelection(scope), (error) => {
    assert.equal(error instanceof OutputScopeError, true);
    assert.equal(error.code, "publication_editorial_selection_required");
    return true;
  });
  assertPublicationSelection({ ...scope, editorialSelectionConfirmed: true });
}
