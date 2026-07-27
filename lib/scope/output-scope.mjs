export const OUTPUT_TYPES = Object.freeze(["report", "insights", "publication"]);
export const SCOPE_BASES = Object.freeze(["all", "stories", "evidence"]);

export class OutputScopeError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = "OutputScopeError";
    this.code = code;
    this.detail = detail || code;
  }
}

export function normalizeOutputScope(input = {}, options = {}) {
  const outputType = normalizeToken(options.outputType || input.outputType || "report");
  if (!OUTPUT_TYPES.includes(outputType)) {
    throw new OutputScopeError("output_scope_type_invalid");
  }

  const now = new Date(options.now || Date.now());
  if (Number.isNaN(now.getTime())) throw new OutputScopeError("output_scope_now_invalid");
  const defaultStart = new Date(now);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 6);
  defaultStart.setUTCHours(0, 0, 0, 0);
  const defaultEnd = new Date(now);
  defaultEnd.setUTCHours(23, 59, 59, 999);

  const from = normalizeDate(input.from || input.dateFrom, defaultStart, "output_scope_from_invalid");
  const to = normalizeDate(input.to || input.dateTo, defaultEnd, "output_scope_to_invalid");
  if (from.getTime() > to.getTime()) {
    throw new OutputScopeError(
      "output_scope_range_invalid",
      "La fecha inicial no puede ser posterior a la fecha final.",
    );
  }

  const basis = normalizeToken(input.basis || "all");
  if (!SCOPE_BASES.includes(basis)) throw new OutputScopeError("output_scope_basis_invalid");

  const ownerUserId = normalizeText(input.ownerUserId || options.currentUserId, 160);
  if (!ownerUserId) throw new OutputScopeError("output_scope_user_required");

  const participantIds = normalizeList(
    input.participantIds || input.groupIds || input.participantId || input.groupId || options.currentGroupId,
  );
  const categories = normalizeList(input.categories || input.category);
  const locations = normalizeList(input.locations || input.location);
  const assetKinds = normalizeList(input.assetKinds || input.assetKind);
  const storyIds = normalizeList(input.storyIds || input.experienceIds);
  const assetIds = normalizeList(input.assetIds);
  const text = normalizeText(input.text, 500);
  const requiresEditorialConfirmation = outputType === "publication";

  return {
    outputType,
    timeframe: {
      from: from.toISOString(),
      to: to.toISOString(),
      label: input.timeframeLabel || "custom",
    },
    ownerUserId,
    participantIds,
    basis,
    categories,
    locations,
    assetKinds,
    storyIds,
    assetIds,
    text,
    includeContext: true,
    includeEventsWithParent: true,
    eventFilterMode: "parent_story",
    requiresEditorialConfirmation,
    editorialSelectionConfirmed: requiresEditorialConfirmation
      ? input.editorialSelectionConfirmed === true
      : true,
  };
}

export function applyOutputScope(dataset = {}, scopeInput = {}, options = {}) {
  const scope = normalizeOutputScope(scopeInput, options);
  const stories = filterCommon(dataset.stories, scope, { dateFields: ["startedAt", "date", "createdAt"] })
    .filter((item) => matchesSpecificId(item, scope.storyIds, ["id", "experienceId"]))
    .filter((item) => matchesOptional(item.category, scope.categories))
    .filter((item) => matchesOptional(item.location || item.place, scope.locations))
    .filter((item) => matchesText(item, scope.text));

  const selectedStoryIds = new Set(stories.map((story) => String(story.id || story.experienceId || "")));
  const eligibleEvidence = filterCommon(dataset.evidence, scope, { dateFields: ["occurredAt", "capturedAt", "createdAt"] })
    .filter((item) => matchesSpecificId(item, scope.assetIds, ["id", "assetId", "captureId"]))
    .filter((item) => matchesOptional(item.kind || item.type, scope.assetKinds))
    .filter((item) => matchesText(item, scope.text));
  const evidence = eligibleEvidence
    .filter((item) => {
      if (scope.categories.length === 0) return true;
      const parentId = String(item.experienceId || item.storyId || "");
      return parentId && selectedStoryIds.has(parentId);
    });

  const context = filterCommon(dataset.context, scope, { dateFields: ["occurredAt", "capturedAt", "date", "createdAt"] })
    .filter((item) => matchesOptional(item.location || item.place, scope.locations));

  return {
    scope,
    stories: scope.basis === "evidence" ? [] : stories,
    evidence: scope.basis === "stories"
      ? evidence.filter((item) => selectedStoryIds.has(String(item.experienceId || item.storyId || "")))
      : evidence,
    context,
    excluded: {
      unclassifiedEvidenceByCategory: scope.categories.length > 0
        ? eligibleEvidence.length - evidence.length
        : 0,
    },
    summary: buildScopeSummary(scope),
  };
}

export function assertPublicationSelection(scope) {
  if (scope.outputType === "publication" && scope.editorialSelectionConfirmed !== true) {
    throw new OutputScopeError(
      "publication_editorial_selection_required",
      "Confirma visualmente el contenido que formara parte de la publicacion.",
    );
  }
}

export function buildScopeSummary(scope) {
  const days = Math.max(
    1,
    Math.ceil(
      (new Date(scope.timeframe.to).getTime() - new Date(scope.timeframe.from).getTime() + 1) /
      86_400_000,
    ),
  );
  const person = scope.participantIds.length > 0
    ? scope.participantIds.join(", ")
    : "usuario actual";
  const basisLabels = {
    all: "historias, evidencia y contexto",
    stories: "historias confirmadas y su contexto",
    evidence: "evidencia registrada y contexto",
  };
  return {
    days,
    person,
    basis: basisLabels[scope.basis],
    sentence: `Analizar ${days} dia(s) de ${person} usando ${basisLabels[scope.basis]}.`,
  };
}

function filterCommon(items, scope, { dateFields }) {
  const fromMs = new Date(scope.timeframe.from).getTime();
  const toMs = new Date(scope.timeframe.to).getTime();
  return asArray(items).filter((item) => {
    if (String(item.ownerUserId || item.userId || "") !== scope.ownerUserId) return false;
    if (
      scope.participantIds.length > 0 &&
      !scope.participantIds.includes(normalizeToken(item.participantId || item.groupId))
    ) return false;
    const dateValue = dateFields.map((field) => item[field]).find(Boolean);
    const dateMs = new Date(dateValue || 0).getTime();
    return Number.isFinite(dateMs) && dateMs >= fromMs && dateMs <= toMs;
  });
}

function matchesSpecificId(item, ids, fields) {
  if (ids.length === 0) return true;
  return fields.some((field) => ids.includes(normalizeToken(item[field])));
}

function matchesOptional(value, allowed) {
  if (allowed.length === 0) return true;
  return allowed.includes(normalizeToken(value));
}

function matchesText(item, text) {
  if (!text) return true;
  const haystack = JSON.stringify(item).toLowerCase();
  return haystack.includes(text.toLowerCase());
}

function normalizeDate(value, fallback, code) {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) throw new OutputScopeError(code);
  return date;
}

function normalizeList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(normalizeToken).filter(Boolean))];
}

function normalizeText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeToken(value) {
  return normalizeText(value, 300).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
