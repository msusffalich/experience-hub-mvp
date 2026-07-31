import { loadConfig, assertRuntimeConfig } from "./config.mjs";
import { createRouter, json, bytes, redirect, requestId } from "./http.mjs";
import { createSupabaseClient } from "./supabase.mjs";
import { createAuthService } from "./auth.mjs";
import { createWorkspaceService } from "./workspace.mjs";
import { createCaptureService } from "./capture.mjs";
import { createProfileService } from "./profile.mjs";
import { createStoryService } from "./stories.mjs";
import { createContextService } from "./context.mjs";
import { createContextEnrichmentService } from "./context-enrichment.mjs";
import { createOutputService } from "./outputs.mjs";
import { createOperationsService } from "./operations.mjs";
import { createObsidianService } from "./obsidian.mjs";
import { createHealthService } from "./health.mjs";
import { createAssistantService } from "./assistant.mjs";
import { createIntegrationService } from "./integrations.mjs";
import { createGroupService } from "./groups.mjs";

export function createVibeApiV2(options = {}) {
  const config = options.config || loadConfig(options.env);
  const supabase = options.supabase || createSupabaseClient(config, options.fetchImpl);
  const auth = createAuthService(supabase);
  const workspace = createWorkspaceService(supabase);
  const capture = createCaptureService({ supabase, workspace, config });
  const profile = createProfileService({ supabase, workspace });
  const stories = createStoryService({ supabase, workspace, config });
  const context = createContextService({ supabase, workspace });
  const contextEnrichment = createContextEnrichmentService({
    supabase,
    workspace,
    config,
    fetchImpl: options.fetchImpl,
  });
  const outputs = createOutputService({ config });
  const operations = createOperationsService({ supabase, workspace });
  const obsidian = createObsidianService({ config, stories });
  const health = createHealthService({ config, supabase, capture });
  const assistant = createAssistantService({ config, fetchImpl: options.fetchImpl });
  const integrations = createIntegrationService({
    config,
    supabase,
    workspace,
    fetchImpl: options.fetchImpl,
  });
  const groups = createGroupService({ supabase, workspace });
  const router = createRouter();

  registerRoutes(router, {
    auth,
    capture,
    profile,
    stories,
    context,
    contextEnrichment,
    outputs,
    operations,
    obsidian,
    health,
    assistant,
    integrations,
    groups,
  });
  const shouldStartWorkers = options.startWorkers ?? config.env !== "test";
  const stopWorkers = !shouldStartWorkers
    ? () => {}
    : combineStops(
      integrations.startWorker(),
      contextEnrichment.startWorker(),
    );

  async function handle(req, res) {
    if (!String(req.url || "").startsWith("/api/v2/")) return false;
    const contextValue = {
      config,
      auth,
      requestId: requestId(req),
    };
    res.setHeader("X-Vibe-API-Version", "2.0.0");
    res.setHeader("X-Request-ID", contextValue.requestId);
    return router.dispatch(req, res, contextValue);
  }

  return {
    handle,
    config,
    routes: router.routes,
    services: {
      auth,
      workspace,
      capture,
      profile,
      stories,
      context,
      contextEnrichment,
      outputs,
      operations,
      obsidian,
      health,
      assistant,
      integrations,
      groups,
    },
    close: stopWorkers,
  };
}

function registerRoutes(router, service) {
  const {
    auth,
    capture,
    profile,
    stories,
    context,
    contextEnrichment,
    outputs,
    operations,
    obsidian,
    health,
    assistant,
    integrations,
    groups,
  } = service;

  router.add("GET", "/api/v2/health/live", () => json(200, health.live()), { auth: false });
  router.add("GET", "/api/v2/health/ready", async ({ url }) => {
    const result = await health.ready(url.searchParams.get("force") === "1");
    return json(result.ready ? 200 : 503, result);
  }, { auth: false });
  router.add("GET", "/api/v2/health", async ({ auth: authValue }) => {
    const result = await health.authenticated(authValue);
    return json(result.ready ? 200 : 503, result);
  });

  router.add("POST", "/api/v2/auth/sign-in", async ({ body }) =>
    json(200, await auth.signIn(body)), { auth: false });
  router.add("POST", "/api/v2/auth/refresh", async ({ body }) =>
    json(200, await auth.refresh(body)), { auth: false });

  router.add("GET", "/api/v2/profile", async ({ auth: authValue }) =>
    json(200, await profile.get(authValue)));
  router.add("PUT", "/api/v2/profile", async ({ body, auth: authValue }) =>
    json(200, await profile.update(body, authValue)));

  router.add("GET", "/api/v2/groups", async ({ auth: authValue }) =>
    json(200, await groups.list(authValue)));
  router.add("POST", "/api/v2/groups", async ({ body, auth: authValue }) =>
    json(201, await groups.save(body, authValue)));
  router.add("PUT", "/api/v2/groups/:id", async ({ params, body, auth: authValue }) =>
    json(200, await groups.save(body, authValue, params.id)));
  router.add("DELETE", "/api/v2/groups/:id", async ({ params, auth: authValue }) =>
    json(200, await groups.deactivate(params.id, authValue)));

  router.add("GET", "/api/v2/experiences", async ({ url, auth: authValue }) =>
    json(200, await stories.list(authValue, {
      from: url.searchParams.get("from") || "",
      limit: url.searchParams.get("limit") || 500,
    })));
  router.add("POST", "/api/v2/experiences", async ({ body, auth: authValue }) =>
    json(201, await stories.save(body, authValue)));
  router.add("PUT", "/api/v2/experiences/:id", async ({ params, body, auth: authValue }) =>
    json(200, await stories.save(body, authValue, params.id)));
  router.add("DELETE", "/api/v2/experiences/:id", async ({ params, auth: authValue }) =>
    json(200, await stories.remove(params.id, authValue)));

  router.add("GET", "/api/v2/assets", async ({ auth: authValue }) =>
    json(200, await stories.listAssets(authValue)));
  router.add("POST", "/api/v2/assets/adopt", async ({ body, auth: authValue }) =>
    json(200, await stories.adopt(body, authValue)));
  router.add("POST", "/api/v2/assets/reassign", async ({ body, auth: authValue }) =>
    json(200, await stories.release(body, authValue)));
  router.add("GET", "/api/v2/assets/:id/download", async ({ params, auth: authValue }) =>
    json(200, await stories.downloadAsset(params.id, authValue)));

  router.add("GET", "/api/v2/captures", async ({ url, auth: authValue }) =>
    json(200, await capture.list(authValue, url)));
  router.add("GET", "/api/v2/captures/contract", async () =>
    json(200, capture.contract()));
  router.add("POST", "/api/v2/captures", async ({ body, auth: authValue }) => {
    const result = await capture.capture(body, authValue);
    let contextRefresh = null;
    if (
      String(body?.intent || "").toLowerCase() === "context" &&
      String(body?.kind || body?.type || "").toLowerCase() === "location"
    ) {
      try {
        contextRefresh = await contextEnrichment.refresh(authValue, {
          locale: body?.metadata?.locale || body?.locale || "es",
          location: body?.metadata?.location || body?.text || "",
          reason: "location_capture",
        });
      } catch (error) {
        console.error("vibe_api_v2_context_refresh_queue_failed", {
          code: error.code || "context_refresh_queue_failed",
          message: error.message,
        });
      }
    }
    return json(201, { ...result, contextRefresh });
  });
  router.add("GET", "/api/v2/captures/status", async ({ auth: authValue, url }) =>
    json(200, await capture.status(authValue, {
      roundTrip: url.searchParams.get("roundTrip") === "1",
    })));
  router.add("POST", "/api/v2/captures/uploads", async ({ body, auth: authValue }) =>
    json(200, await capture.authorize(body, authValue)));
  router.add("POST", "/api/v2/captures/commit", async ({ body, auth: authValue }) =>
    json(200, await capture.commit(body, authValue)));
  router.add("GET", "/api/v2/captures/operations/:id", async ({ params, auth: authValue }) =>
    json(200, await capture.operation(params.id, authValue)));
  router.add("GET", "/api/v2/captures/:id/download", async ({ params, auth: authValue }) =>
    json(200, await capture.download(params.id, authValue)));

  router.add("GET", "/api/v2/agenda", async ({ url, auth: authValue }) =>
    json(200, await context.agenda(authValue, url)));
  router.add("POST", "/api/v2/agenda", async ({ body, auth: authValue }) =>
    json(201, await context.saveAgenda(body, authValue)));
  router.add("PUT", "/api/v2/agenda/:id", async ({ params, body, auth: authValue }) =>
    json(200, await context.saveAgenda(body, authValue, params.id)));
  router.add("DELETE", "/api/v2/agenda/:id", async ({ params, auth: authValue }) =>
    json(200, await context.removeAgenda(params.id, authValue)));
  router.add("GET", "/api/v2/context/signals", async ({ url, auth: authValue }) =>
    json(200, await context.signals(authValue, url)));
  router.add("GET", "/api/v2/context/summary", async ({ url, auth: authValue }) =>
    json(200, await context.summary(authValue, url)));
  router.add("GET", "/api/v2/context/briefing", async ({ auth: authValue }) =>
    json(200, await contextEnrichment.latest(authValue)));
  router.add("POST", "/api/v2/context/refresh", async ({ body, auth: authValue }) =>
    json(202, await contextEnrichment.refresh(authValue, body)));

  router.add("POST", "/api/v2/outputs/:type/pdf", async ({ params, body, auth: authValue }) => {
    void authValue;
    const buffer = await outputs.pdf(params.type, body);
    return bytes(200, buffer, "application/pdf", {
      "Content-Disposition": `attachment; filename="vibe-${params.type}.pdf"`,
    });
  });

  router.add("GET", "/api/v2/obsidian/preview", async ({ auth: authValue }) =>
    json(200, await obsidian.preview(authValue)));
  router.add("POST", "/api/v2/obsidian/export", async ({ auth: authValue }) =>
    json(200, await obsidian.exportVault(authValue)));

  router.add("GET", "/api/v2/jobs", async ({ url, auth: authValue }) =>
    json(200, await operations.list(authValue, url)));
  router.add("GET", "/api/v2/jobs/:id", async ({ params, auth: authValue }) =>
    json(200, await operations.get(authValue, params.id)));

  router.add("POST", "/api/v2/assistant/message", async ({ body, auth: authValue }) =>
    json(200, await assistant.message(body, authValue)));

  router.add("GET", "/api/v2/integrations/oura/status", async ({ auth: authValue }) =>
    json(200, await integrations.status(authValue)));
  router.add("POST", "/api/v2/integrations/oura/authorize", async ({ auth: authValue }) =>
    json(200, await integrations.authorize(authValue)));
  router.add("GET", "/api/v2/integrations/oura/callback", async ({ url }) =>
    redirect(await integrations.callback(url)), { auth: false });
  router.add("POST", "/api/v2/integrations/oura/sync", async ({ body, auth: authValue }) =>
    json(200, await integrations.sync(authValue, body)));
  router.add("DELETE", "/api/v2/integrations/oura", async ({ auth: authValue }) =>
    json(200, await integrations.disconnect(authValue)));
  router.add("GET", "/api/v2/integrations/oura/webhook", async ({ url }) =>
    json(200, await integrations.verification(url)), { auth: false });
  router.add("POST", "/api/v2/integrations/oura/webhook", async ({ body, req }) =>
    json(200, await integrations.webhook(body, req.headers)), {
    auth: false,
    body: "bytes",
  });
}

function combineStops(...stops) {
  return () => {
    for (const stop of stops) {
      try {
        stop?.();
      } catch {
        // Worker shutdown is best effort.
      }
    }
  };
}

export function validateVibeApiV2Runtime(options = {}) {
  const config = options.config || loadConfig(options.env);
  assertRuntimeConfig(config);
  return config;
}
