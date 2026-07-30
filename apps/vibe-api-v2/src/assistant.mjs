import { ApiError } from "./errors.mjs";

export function createAssistantService({ config, fetchImpl = fetch }) {
  async function message(body = {}) {
    if (!config.openaiApiKey) throw new ApiError(503, "assistant_not_configured");
    const system = String(body.system || "").trim();
    const text = String(body.text || body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
    if (!system || !text) throw new ApiError(400, "assistant_payload_incomplete");
    const actionMode = asksForActions(system, body);
    const instructions = actionMode
      ? `${system}\n\nDevuelve únicamente JSON válido con esta forma exacta: {"actions":[{"action":"answer","text":"..."}],"answer":"..."}. No uses Markdown.`
      : system;
    const input = [
      ...history.map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || item.text || "").slice(0, 20_000),
      })),
      { role: "user", content: text.slice(0, 30_000) },
    ];
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.openaiModel,
        instructions,
        input,
        ...(actionMode ? { text: { format: { type: "json_object" } } } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(502, "assistant_provider_failed", "V no pudo responder.", payload.error);
    }
    const answer = outputText(payload);
    if (!actionMode) return { answer, actions: [], mode: "conversation" };
    const parsed = parseActionJson(answer);
    if (!parsed) {
      throw new ApiError(502, "assistant_contract_invalid");
    }
    return {
      answer: String(parsed.answer || parsed.actions?.[0]?.text || ""),
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      mode: "agent",
    };
  }

  return { message };
}

function asksForActions(system, body) {
  if (body.actionMode === true || body.mode === "agent") return true;
  return /\b(actions?|json|tool|comando|acción|accion)\b/i.test(system);
}

function outputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("")
    .trim();
}

function parseActionJson(value) {
  try {
    const parsed = JSON.parse(String(value || "").trim());
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const match = String(value || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
