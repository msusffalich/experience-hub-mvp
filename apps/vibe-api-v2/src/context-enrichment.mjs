import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.mjs";

const REFRESH_HOURS = 6;
const MAX_ATTEMPTS = 4;
const NEWS_FRESHNESS_HOURS = 48;
const TRUSTED_NEWS_SOURCES = ["reuters", "bbc", "associated press", "ap news", "npr"];
const RISK_WORDS = [
  "alert", "warning", "storm", "hurricane", "flood", "fire", "conflict",
  "protest", "strike", "evacuation", "emergency", "violence", "closure",
  "alerta", "tormenta", "huracan", "inundacion", "incendio", "conflicto",
  "protesta", "huelga", "evacuacion", "emergencia", "violencia", "cierre",
];

export function createContextEnrichmentService({
  supabase,
  workspace,
  config,
  fetchImpl = fetch,
}) {
  let runWorker = null;

  async function latest(auth) {
    const rows = await supabase.rest("daily_briefings", {
      accessToken: auth.accessToken,
      query: {
        user_id: `eq.${auth.user.id}`,
        select: "*",
        order: "generated_at.desc",
        limit: "1",
      },
    });
    return mapBriefing(rows?.[0]);
  }

  async function refresh(auth, body = {}) {
    const scope = await workspace.resolve(auth);
    const existing = await supabase.rest("vibe_jobs_v2", {
      accessToken: auth.accessToken,
      query: {
        owner_user_id: `eq.${auth.user.id}`,
        workspace_id: `eq.${scope.id}`,
        job_type: "eq.context_refresh",
        state: "in.(queued,running,retry_pending)",
        select: "*",
        order: "created_at.desc",
        limit: "1",
      },
    });
    if (existing?.[0]) return mapJob(existing[0]);

    const now = new Date().toISOString();
    const job = {
      job_id: randomUUID(),
      owner_user_id: auth.user.id,
      workspace_id: scope.id,
      job_type: "context_refresh",
      state: "queued",
      input: {
        locale: normalizeLocale(body.locale),
        location: clean(body.location, 300),
        reason: clean(body.reason || "automatic", 80),
      },
      result: {},
      error: null,
      attempts: 0,
      created_at: now,
      updated_at: now,
    };
    const rows = await supabase.rest("vibe_jobs_v2", {
      method: "POST",
      accessToken: auth.accessToken,
      prefer: "return=representation",
      body: job,
    });
    if (!rows?.[0]) throw new ApiError(500, "context_refresh_queue_failed");
    setTimeout(() => runWorker?.(), 0).unref?.();
    return mapJob(rows[0]);
  }

  async function processQueued(limit = 3) {
    const rows = await supabase.rest("vibe_jobs_v2", {
      auth: "service",
      query: {
        job_type: "eq.context_refresh",
        state: "in.(queued,retry_pending)",
        select: "*",
        order: "created_at.asc",
        limit: String(Math.max(1, Math.min(Number(limit || 3), 10))),
      },
    });
    const outcomes = [];
    for (const job of rows || []) {
      const attempts = Number(job.attempts || 0) + 1;
      const claimed = await supabase.rest("vibe_jobs_v2", {
        method: "PATCH",
        auth: "service",
        prefer: "return=representation",
        query: { job_id: `eq.${job.job_id}`, state: `eq.${job.state}` },
        body: {
          state: "running",
          attempts,
          error: null,
          updated_at: new Date().toISOString(),
        },
      });
      if (!claimed?.[0]) continue;
      try {
        const result = await enrich(job);
        await finishJob(job.job_id, "complete", { result, error: null });
        outcomes.push({ id: job.job_id, state: "complete" });
      } catch (error) {
        const state = attempts >= MAX_ATTEMPTS ? "needs_attention" : "retry_pending";
        await finishJob(job.job_id, state, {
          error: {
            code: error.code || "context_refresh_failed",
            message: String(error.message || error),
            at: new Date().toISOString(),
          },
        });
        outcomes.push({ id: job.job_id, state });
      }
    }
    return outcomes;
  }

  async function enrich(job) {
    const locale = normalizeLocale(job.input?.locale);
    const place = await resolvePlace(job, locale);
    if (!place) {
      return {
        status: "waiting_for_location",
        generatedAt: new Date().toISOString(),
        message: localized(locale, "locationMissing"),
      };
    }

    const [weatherResult, newsResult, entertainmentResult] = await Promise.allSettled([
      fetchWeather(place, locale),
      fetchNews(place, locale),
      fetchEntertainment(place, locale),
    ]);
    const weather = resultOrUnavailable(weatherResult, "weather");
    const news = resultOrUnavailable(newsResult, "news");
    const entertainment = resultOrUnavailable(entertainmentResult, "entertainment");
    const impact = calculateImpact(weather, news, locale);
    const generatedAt = new Date().toISOString();
    const payload = {
      status: "available",
      generatedAt,
      nextRefreshAt: new Date(Date.now() + REFRESH_HOURS * 3_600_000).toISOString(),
      location: place,
      weather,
      news,
      entertainment,
      impact,
      sources: {
        weather: weather.source || "Open-Meteo",
        news: news.source || "Google News RSS",
        entertainment: entertainment.source || "Google News RSS",
      },
    };

    await persistBriefing(job, locale, place, payload);
    await persistSignals(job, place, payload);
    return payload;
  }

  async function resolvePlace(job, locale) {
    const rows = await supabase.rest("context_signals", {
      auth: "service",
      query: {
        owner_user_id: `eq.${job.owner_user_id}`,
        workspace_id: `eq.${job.workspace_id}`,
        signal_type: "eq.location",
        select: "*",
        order: "captured_at.desc",
        limit: "1",
      },
    });
    const signal = rows?.[0] || {};
    const payload = signal.payload || {};
    const requested = clean(job.input?.location, 300);
    const label = firstText(
      requested,
      signal.location,
      payload.displayName,
      payload.location,
      payload.city,
      payload.locality,
      payload.placeName,
    );
    let coordinates = extractCoordinates({
      ...payload,
      location: signal.location || requested,
    });

    if (!coordinates && label) coordinates = await geocode(label, locale);
    if (!coordinates) return null;

    let resolvedLabel = label && !looksLikeCoordinates(label) ? label : "";
    let locality = "";
    let region = "";
    let country = "";
    if (!resolvedLabel) {
      const reverse = await reverseGeocode(coordinates, locale);
      locality = reverse.locality;
      region = reverse.region;
      country = reverse.country;
      resolvedLabel = [locality, region, country].filter(Boolean).join(", ");
    }
    return {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      label: resolvedLabel || `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`,
      locality: locality || firstText(payload.city, payload.locality, resolvedLabel.split(",")[0]),
      region: region || firstText(payload.region, payload.state),
      country: country || firstText(payload.country, payload.countryCode),
      timezone: firstText(payload.timezone, "auto"),
    };
  }

  async function geocode(label, locale) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", label);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", locale);
    const payload = await fetchJson(url);
    const row = payload?.results?.[0];
    if (!Number.isFinite(Number(row?.latitude)) || !Number.isFinite(Number(row?.longitude))) {
      return null;
    }
    return { latitude: Number(row.latitude), longitude: Number(row.longitude) };
  }

  async function reverseGeocode(coordinates, locale) {
    const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
    url.searchParams.set("latitude", String(coordinates.latitude));
    url.searchParams.set("longitude", String(coordinates.longitude));
    url.searchParams.set("localityLanguage", locale);
    try {
      const payload = await fetchJson(url);
      return {
        locality: firstText(payload.city, payload.locality, payload.principalSubdivision),
        region: firstText(payload.principalSubdivision),
        country: firstText(payload.countryName, payload.countryCode),
      };
    } catch {
      return { locality: "", region: "", country: "" };
    }
  }

  async function fetchWeather(place, locale) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(place.latitude));
    url.searchParams.set("longitude", String(place.longitude));
    url.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    );
    url.searchParams.set("timezone", place.timezone || "auto");
    const payload = await fetchJson(url);
    const current = payload.current || {};
    return {
      status: "available",
      source: "Open-Meteo",
      observedAt: current.time || new Date().toISOString(),
      temperatureC: finiteOrNull(current.temperature_2m),
      apparentC: finiteOrNull(current.apparent_temperature),
      humidity: finiteOrNull(current.relative_humidity_2m),
      precipitationMm: finiteOrNull(current.precipitation),
      windKph: finiteOrNull(current.wind_speed_10m),
      weatherCode: finiteOrNull(current.weather_code),
      description: weatherDescription(current.weather_code, locale),
    };
  }

  async function fetchNews(place, locale) {
    const query = `${place.locality || place.label} (Reuters OR BBC OR AP OR NPR OR \"Associated Press\") when:${NEWS_FRESHNESS_HOURS}h`;
    const items = (await fetchRss(query, locale, 20))
      .filter((item) => isRecent(item.publishedAt, NEWS_FRESHNESS_HOURS))
      .filter((item) => TRUSTED_NEWS_SOURCES.some((source) =>
        String(item.source || "").toLowerCase().includes(source),
      ))
      .slice(0, 8);
    return {
      status: items.length ? "available" : "no_recent_items",
      source: "Trusted Google News RSS",
      freshnessHours: NEWS_FRESHNESS_HOURS,
      items,
    };
  }

  async function fetchEntertainment(place, locale) {
    const terms = {
      es: "cine OR teatro OR concierto OR festival OR espectaculos OR eventos",
      en: "cinema OR theater OR theatre OR concert OR festival OR events OR shows",
      fr: "cinema OR theatre OR concert OR festival OR spectacles OR evenements",
      pt: "cinema OR teatro OR concerto OR festival OR espetaculos OR eventos",
    };
    const query = `${place.locality || place.label} (${terms[locale] || terms.es}) when:7d`;
    const items = (await fetchRss(query, locale, 20))
      .filter((item) => isRecent(item.publishedAt, 168))
      .slice(0, 10);
    return {
      status: items.length ? "available" : "no_recent_items",
      source: "Google News RSS",
      freshnessHours: 168,
      items,
    };
  }

  async function fetchRss(query, locale, limit) {
    const localeConfig = rssLocale(locale);
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", localeConfig.hl);
    url.searchParams.set("gl", localeConfig.gl);
    url.searchParams.set("ceid", localeConfig.ceid);
    const xml = await fetchText(url);
    return parseRss(xml).slice(0, limit);
  }

  async function persistBriefing(job, locale, place, payload) {
    const locationKey = `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`;
    await supabase.rest("daily_briefings", {
      method: "POST",
      auth: "service",
      prefer: "resolution=merge-duplicates,return=minimal",
      query: { on_conflict: "user_id,location_key,locale" },
      body: {
        user_id: job.owner_user_id,
        location_key: locationKey,
        locale,
        payload,
        generated_at: payload.generatedAt,
        next_refresh_at: payload.nextRefreshAt,
        updated_at: payload.generatedAt,
      },
    });
  }

  async function persistSignals(job, place, payload) {
    const day = payload.generatedAt.slice(0, 10);
    const rows = [
      ["weather", payload.weather],
      ["news", payload.news],
      ["entertainment", payload.entertainment],
    ];
    for (const [type, value] of rows) {
      await supabase.rest("context_signals", {
        method: "POST",
        auth: "service",
        prefer: "resolution=merge-duplicates,return=minimal",
        query: { on_conflict: "signal_id" },
        body: {
          signal_id: `auto-${type}-${job.owner_user_id}-${day}`,
          workspace_id: job.workspace_id,
          owner_user_id: job.owner_user_id,
          participant_id: null,
          source_type: "vibe-api-v2",
          source_device: "server",
          source_id: job.job_id,
          signal_type: type,
          captured_at: payload.generatedAt,
          valid_from: payload.generatedAt,
          valid_to: payload.nextRefreshAt,
          location: place.label,
          metrics: type === "weather" ? numericMetrics(value) : {},
          payload: {
            ...value,
            location: place,
            impact: type === "news" ? payload.impact : undefined,
          },
          metadata: {
            generatedAutomatically: true,
            jobId: job.job_id,
          },
          updated_at: payload.generatedAt,
        },
      });
    }
  }

  async function finishJob(id, state, patch) {
    await supabase.rest("vibe_jobs_v2", {
      method: "PATCH",
      auth: "service",
      prefer: "return=minimal",
      query: { job_id: `eq.${id}` },
      body: { ...patch, state, updated_at: new Date().toISOString() },
    });
  }

  async function fetchJson(url) {
    const text = await fetchText(url);
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(502, "context_provider_invalid_json");
    }
  }

  async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(config.upstreamTimeoutMs, 12_000));
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": "Vibe/2.0 context-service" },
        signal: controller.signal,
      });
      if (!response.ok) throw new ApiError(502, "context_provider_failed", `HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function startWorker() {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await processQueued();
      } catch (error) {
        console.error("vibe_api_v2_context_worker_failed", {
          code: error.code || "context_worker_failed",
          message: error.message,
        });
      } finally {
        running = false;
      }
    };
    runWorker = tick;
    const interval = setInterval(tick, 60_000);
    interval.unref?.();
    const initial = setTimeout(tick, 5_000);
    initial.unref?.();
    return () => {
      runWorker = null;
      clearInterval(interval);
      clearTimeout(initial);
    };
  }

  return { latest, refresh, processQueued, startWorker };
}

function mapBriefing(row) {
  if (!row) return {
    status: "not_available",
    generatedAt: null,
    nextRefreshAt: null,
    payload: null,
  };
  return {
    status: row.payload?.status || "available",
    generatedAt: row.generated_at,
    nextRefreshAt: row.next_refresh_at,
    locationKey: row.location_key,
    locale: row.locale,
    payload: row.payload || {},
  };
}

function mapJob(row) {
  return {
    id: row.job_id,
    type: row.job_type,
    state: row.state,
    attempts: Number(row.attempts || 0),
    result: row.result || {},
    error: row.error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resultOrUnavailable(result, type) {
  if (result.status === "fulfilled") return result.value;
  return {
    status: "unavailable",
    source: type === "weather" ? "Open-Meteo" : "Google News RSS",
    error: String(result.reason?.code || result.reason?.message || `${type}_unavailable`),
    items: type === "weather" ? undefined : [],
  };
}

function calculateImpact(weather, news, locale) {
  const signals = [];
  if (Number(weather.temperatureC) >= 32) signals.push("high_temperature");
  if (Number(weather.temperatureC) <= 2) signals.push("low_temperature");
  if (Number(weather.windKph) >= 40) signals.push("strong_wind");
  if (Number(weather.precipitationMm) >= 15) signals.push("heavy_rain");
  const newsItems = Array.isArray(news.items) ? news.items : [];
  const newsRisks = newsItems.filter((item) =>
    RISK_WORDS.some((word) => `${item.title} ${item.summary}`.toLowerCase().includes(word)),
  );
  signals.push(...newsRisks.slice(0, 4).map(() => "relevant_news_signal"));
  const score = Math.min(100, signals.length * 14);
  return {
    score,
    level: score >= 70 ? "high" : score >= 35 ? "medium" : "low",
    signals,
    summary: localized(locale, score >= 70 ? "impactHigh" : score >= 35 ? "impactMedium" : "impactLow"),
  };
}

function extractCoordinates(value = {}) {
  const latitude = finiteOrNull(
    value.latitude ?? value.lat ?? value.coordinates?.latitude ?? value.coordinates?.lat,
  );
  const longitude = finiteOrNull(
    value.longitude ?? value.lon ?? value.lng ?? value.coordinates?.longitude ??
    value.coordinates?.lon ?? value.coordinates?.lng,
  );
  if (latitude != null && longitude != null) return { latitude, longitude };
  const match = String(value.location || "").match(
    /(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)/,
  );
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function looksLikeCoordinates(value) {
  return /^-?\d{1,2}(?:\.\d+)?\s*[,;]\s*-?\d{1,3}(?:\.\d+)?$/.test(String(value || "").trim());
}

function parseRss(xml) {
  const blocks = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block) => {
    const title = decodeXml(readTag(block, "title"));
    const link = decodeXml(readTag(block, "link"));
    const publishedAt = decodeXml(readTag(block, "pubDate"));
    const source = decodeXml(readTag(block, "source"));
    const summary = stripHtml(decodeXml(readTag(block, "description")));
    return { title, link, publishedAt, source, summary };
  }).filter((item) => item.title && item.link);
}

function readTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "") || "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function numericMetrics(value = {}) {
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => Number.isFinite(Number(item)))
    .map(([key, item]) => [key, Number(item)]));
}

function weatherDescription(code, locale) {
  const value = Number(code);
  if (value === 0) return localized(locale, "clear");
  if ([1, 2, 3].includes(value)) return localized(locale, "cloudy");
  if ([45, 48].includes(value)) return localized(locale, "fog");
  if (value >= 51 && value <= 67) return localized(locale, "rain");
  if (value >= 71 && value <= 77) return localized(locale, "snow");
  if (value >= 80 && value <= 82) return localized(locale, "showers");
  if (value >= 95) return localized(locale, "storm");
  return localized(locale, "variable");
}

const localizedText = {
  es: {
    locationMissing: "No hay una ubicación reciente para actualizar el contexto.",
    impactHigh: "El contexto externo requiere atención antes de planificar.",
    impactMedium: "Hay condiciones externas que conviene considerar.",
    impactLow: "No se observan presiones externas importantes con los datos disponibles.",
    clear: "Despejado", cloudy: "Parcialmente nublado", fog: "Niebla", rain: "Lluvia",
    snow: "Nieve", showers: "Chubascos", storm: "Tormenta", variable: "Condiciones variables",
  },
  en: {
    locationMissing: "There is no recent location available to update context.",
    impactHigh: "External conditions require attention before planning.",
    impactMedium: "There are external conditions worth considering.",
    impactLow: "No major external pressures are visible in the available data.",
    clear: "Clear", cloudy: "Partly cloudy", fog: "Fog", rain: "Rain",
    snow: "Snow", showers: "Showers", storm: "Storm", variable: "Variable conditions",
  },
  fr: {
    locationMissing: "Aucune localisation récente n'est disponible pour actualiser le contexte.",
    impactHigh: "Le contexte externe demande une attention particulière avant de planifier.",
    impactMedium: "Certaines conditions externes méritent d'être prises en compte.",
    impactLow: "Aucune pression externe importante n'apparaît dans les données disponibles.",
    clear: "Dégagé", cloudy: "Partiellement nuageux", fog: "Brouillard", rain: "Pluie",
    snow: "Neige", showers: "Averses", storm: "Orage", variable: "Conditions variables",
  },
  pt: {
    locationMissing: "Não há uma localização recente disponível para atualizar o contexto.",
    impactHigh: "O contexto externo exige atenção antes do planejamento.",
    impactMedium: "Há condições externas que vale a pena considerar.",
    impactLow: "Não há pressões externas importantes nos dados disponíveis.",
    clear: "Céu limpo", cloudy: "Parcialmente nublado", fog: "Nevoeiro", rain: "Chuva",
    snow: "Neve", showers: "Pancadas de chuva", storm: "Tempestade", variable: "Condições variáveis",
  },
};

function localized(locale, key) {
  return localizedText[locale]?.[key] || localizedText.es[key] || key;
}

function rssLocale(locale) {
  if (locale === "en") return { hl: "en-US", gl: "US", ceid: "US:en" };
  if (locale === "fr") return { hl: "fr", gl: "FR", ceid: "FR:fr" };
  if (locale === "pt") return { hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" };
  return { hl: "es-419", gl: "US", ceid: "US:es-419" };
}

function normalizeLocale(value) {
  const locale = String(value || "es").slice(0, 2).toLowerCase();
  return ["es", "en", "fr", "pt"].includes(locale) ? locale : "es";
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRecent(value, hours) {
  const stamp = new Date(value || 0).getTime();
  return Number.isFinite(stamp) && stamp >= Date.now() - hours * 3_600_000;
}

function firstText(...values) {
  return values.map((value) => clean(value, 300)).find(Boolean) || "";
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}
