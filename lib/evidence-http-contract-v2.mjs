export function normalizeExperienceSubmissionV2(body = {}, normalizeExperience) {
  if (typeof normalizeExperience !== "function") {
    throw new TypeError("normalizeExperience is required");
  }
  const experience = normalizeExperience(body.experience || body);
  const events = Array.isArray(body.events)
    ? body.events
    : Array.isArray(experience.events)
      ? experience.events
      : [];

  let assetLinks = [];
  if (Array.isArray(body.assetLinks)) {
    assetLinks = body.assetLinks;
  } else if (Array.isArray(body.assetIds)) {
    const eventMap = body.assetEventMap && typeof body.assetEventMap === "object"
      ? body.assetEventMap
      : {};
    assetLinks = body.assetIds.map((assetId) => ({
      assetId,
      eventId: eventMap[assetId] || "",
    }));
  } else {
    assetLinks = (experience.attachments || []).map((attachment) => ({
      assetId: attachment.id || attachment.assetId,
      eventId: attachment.eventId || attachment.metadata?.linkedEventId || "",
    }));
  }

  const uniqueLinks = [];
  const seen = new Set();
  for (const rawLink of assetLinks) {
    const assetId = String(rawLink?.assetId || rawLink?.id || "").trim();
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    uniqueLinks.push({
      assetId,
      eventId: String(rawLink?.eventId || "").trim(),
    });
  }

  return { experience, events, assetLinks: uniqueLinks };
}
