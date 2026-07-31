// Noticias por CATEGORIA y AMBITO (local / nacional / global), con imagen.
//
// Limite conocido y asumido: Google News RSS no entrega imagen ni video. La
// imagen se obtiene visitando la noticia y leyendo su og:image. Los enlaces del
// RSS son redirecciones de news.google.com, asi que la extraccion funciona en
// muchos casos pero NO en todos: una noticia sin imagen se muestra igual, sin
// inventar una de relleno.

export const NEWS_CATEGORIES = ["geopolitics", "economy", "technology", "science", "sports"];

const CATEGORY_TERMS = {
  es: {
    geopolitics: "geopolitica OR gobierno OR elecciones OR diplomacia OR conflicto",
    economy: "economia OR finanzas OR mercados OR inflacion OR empleo",
    technology: "tecnologia OR \"inteligencia artificial\" OR software OR startups",
    science: "ciencia OR investigacion OR estudio OR salud OR clima",
    sports: "deportes OR futbol OR baloncesto OR tenis OR olimpicos",
  },
  en: {
    geopolitics: "geopolitics OR government OR elections OR diplomacy OR conflict",
    economy: "economy OR finance OR markets OR inflation OR jobs",
    technology: "technology OR \"artificial intelligence\" OR software OR startups",
    science: "science OR research OR study OR health OR climate",
    sports: "sports OR football OR basketball OR tennis OR olympics",
  },
  fr: {
    geopolitics: "geopolitique OR gouvernement OR elections OR diplomatie OR conflit",
    economy: "economie OR finance OR marches OR inflation OR emploi",
    technology: "technologie OR \"intelligence artificielle\" OR logiciel OR startups",
    science: "science OR recherche OR etude OR sante OR climat",
    sports: "sport OR football OR basketball OR tennis OR jeux olympiques",
  },
  pt: {
    geopolitics: "geopolitica OR governo OR eleicoes OR diplomacia OR conflito",
    economy: "economia OR financas OR mercados OR inflacao OR emprego",
    technology: "tecnologia OR \"inteligencia artificial\" OR software OR startups",
    science: "ciencia OR pesquisa OR estudo OR saude OR clima",
    sports: "esportes OR futebol OR basquete OR tenis OR olimpiadas",
  },
};

const FRESHNESS_HOURS = 48;
const PER_BUCKET = 4;
const IMAGE_TIMEOUT_MS = 6000;
const MAX_IMAGE_LOOKUPS = 12;

export function createNewsService({ fetchText, fetchImpl = fetch, rssLocale, parseRss, isRecent, mentionsPlace }) {
  const imageCache = new Map();

  function terms(locale, category) {
    return (CATEGORY_TERMS[locale] || CATEGORY_TERMS.es)[category] || "";
  }

  function scopeQuery(scope, place, locale, category) {
    const categoryTerms = terms(locale, category);
    const locality = String(place?.locality || "").split(",")[0].trim();
    const region = String(place?.region || "").trim();
    const country = String(place?.country || "").trim();
    if (scope === "local") {
      const anchor = [locality && `"${locality}"`, region].filter(Boolean).join(" ");
      return anchor ? `${anchor} (${categoryTerms}) when:${FRESHNESS_HOURS}h` : "";
    }
    if (scope === "national") {
      return country ? `"${country}" (${categoryTerms}) when:${FRESHNESS_HOURS}h` : "";
    }
    return `(${categoryTerms}) when:${FRESHNESS_HOURS}h`;
  }

  // Extrae la URL del medio real: el <link> del RSS es una redireccion de
  // Google News y no sirve para leer og:image.
  function publisherUrl(item) {
    const fromSummary = String(item.summary || "").match(/href="(https?:\/\/[^"]+)"/i);
    if (fromSummary && !fromSummary[1].includes("news.google.com")) return fromSummary[1];
    const link = String(item.link || "");
    return link.includes("news.google.com") ? "" : link;
  }

  async function fetchOgImage(url) {
    if (!url) return "";
    if (imageCache.has(url)) return imageCache.get(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, redirect: "follow" });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const html = (await response.text()).slice(0, 200_000);
      const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      const image = match && /^https?:\/\//i.test(match[1]) ? match[1] : "";
      imageCache.set(url, image);
      return image;
    } catch {
      imageCache.set(url, "");
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchBucket(scope, place, locale, category) {
    const query = scopeQuery(scope, place, locale, category);
    if (!query) return [];
    const config = rssLocale(locale);
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", config.hl);
    url.searchParams.set("gl", config.gl);
    url.searchParams.set("ceid", config.ceid);
    let items = parseRss(await fetchText(url)).filter((item) => isRecent(item.publishedAt, FRESHNESS_HOURS));
    // El ambito local SI exige que la nota hable del lugar; el nacional y el
    // global no, porque por definicion no son del municipio del usuario.
    if (scope === "local") items = items.filter((item) => mentionsPlace(item, place));
    return items.slice(0, PER_BUCKET).map((item) => ({ ...item, scope, category }));
  }

  async function collect(place, locale) {
    const scopes = ["local", "national", "global"];
    const tasks = [];
    for (const category of NEWS_CATEGORIES) {
      for (const scope of scopes) tasks.push(fetchBucket(scope, place, locale, category));
    }
    const settled = await Promise.allSettled(tasks);
    const failures = settled.filter((result) => result.status === "rejected").length;

    // Deduplicar por titulo entre ambitos: una misma noticia puede salir en
    // local y nacional, y no debe contarse dos veces.
    const seen = new Set();
    const flat = [];
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const item of result.value) {
        const key = String(item.title || "").toLowerCase().slice(0, 90);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        flat.push(item);
      }
    }

    // Imagen solo para los primeros: cada lookup es una peticion al medio.
    let lookups = 0;
    for (const item of flat) {
      if (lookups >= MAX_IMAGE_LOOKUPS) break;
      const target = publisherUrl(item);
      if (!target) continue;
      lookups += 1;
      item.image = await fetchOgImage(target);
      item.publisherUrl = target;
    }

    const categories = {};
    for (const category of NEWS_CATEGORIES) {
      categories[category] = { local: [], national: [], global: [] };
    }
    for (const item of flat) categories[item.category][item.scope].push(item);

    const total = flat.length;
    return {
      status: total ? "available" : "no_recent_items",
      source: "Google News RSS",
      freshnessHours: FRESHNESS_HOURS,
      total,
      withImage: flat.filter((item) => item.image).length,
      failedQueries: failures,
      categories,
      // Compatibilidad con el consumidor anterior, que espera `items`.
      items: flat.slice(0, 8),
    };
  }

  return { collect, fetchOgImage, publisherUrl, scopeQuery };
}
