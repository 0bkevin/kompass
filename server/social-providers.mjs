import { isIP } from "node:net";
import { getSecret } from "./db.mjs";
import { integrationError, isPublicAddress, safeFetch } from "./connectors.mjs";
import { reserveApifyRun, finishProviderRun } from "./provider-budget.mjs";
import { assertSocialCollectionAllowed } from "./access-policy.mjs";

const PLATFORM_HOSTS = {
  instagram: new Set(["instagram.com", "www.instagram.com"]),
  tiktok: new Set(["tiktok.com", "www.tiktok.com"]),
};
const APIFY_ACTORS = {
  instagram: "apify/instagram-scraper",
  tiktok: "clockworks/tiktok-scraper",
};
const ENV_KEYS = {
  youtube: "YOUTUBE_API_KEY",
  apify: "APIFY_API_TOKEN",
  gemini: "GEMINI_API_KEY",
};
const MAX_RESULTS = 50;

const clean = (value, max = 12000) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function configFor(brandId, provider) {
  const stored = getSecret(brandId, provider);
  if (stored?.disabled) return null;
  const apiKey =
    provider === "apify"
      ? stored?.apiToken || process.env[ENV_KEYS[provider]]
      : stored?.apiKey || process.env[ENV_KEYS[provider]];
  return apiKey
    ? {
        ...stored,
        apiKey,
      }
    : null;
}

export function getSocialSettings(brandId) {
  const youtube = getSecret(brandId, "youtube");
  const apify = getSecret(brandId, "apify");
  const gemini = getSecret(brandId, "gemini");
  const settings = {};
  for (const provider of ["youtube", "apify", "gemini"]) {
    const stored = { youtube, apify, gemini }[provider];
    const credential = provider === "apify" ? stored?.apiToken : stored?.apiKey;
    const configured =
      !stored?.disabled && !!(credential || process.env[ENV_KEYS[provider]]);
    settings[provider] = {
      configured,
      ...(provider === "gemini" && (stored?.model || process.env.GEMINI_MODEL)
        ? { model: stored?.model || process.env.GEMINI_MODEL }
        : {}),
    };
  }
  return settings;
}

function failProvider(provider, status) {
  if (status === 401 || status === 403)
    throw integrationError(
      `${provider} rechazó el acceso (HTTP ${status}). Revisa la credencial y el acceso habilitado.`,
      502,
    );
  if (status === 402)
    throw integrationError(
      `${provider} agotó el crédito o presupuesto disponible (HTTP 402).`,
      502,
    );
  if (status === 429)
    throw integrationError(
      `${provider} alcanzó su límite de solicitudes (HTTP 429). Intenta más tarde.`,
      502,
    );
  if (status === 408 || status === 504)
    throw integrationError(`${provider} tardó demasiado en responder.`, 502);
  throw integrationError(
    `${provider} no pudo completar la consulta (HTTP ${status}).`,
    502,
  );
}

async function readJson(response, provider) {
  if (!response.ok) failProvider(provider, response.status);
  try {
    return await response.json();
  } catch {
    throw integrationError(`${provider} devolvió una respuesta inválida.`, 502);
  }
}

function queryTerms(brand, source) {
  const explicit = clean(source.query, 250);
  if (explicit) return [explicit];
  const dictionary = new Map([
    ["inteligencia artificial", "artificial intelligence"],
    ["automatización", "automation"],
    ["automatizacion", "automation"],
    ["educación", "education"],
    ["educacion", "education"],
    ["finanzas", "finance"],
    ["salud", "health"],
    ["marketing", "marketing"],
    ["gastronomía", "food"],
    ["gastronomia", "food"],
    ["restaurante", "restaurant"],
    ["turismo", "travel"],
    ["viajes", "travel"],
    ["inmobiliaria", "real estate"],
    ["moda", "fashion"],
    ["belleza", "beauty"],
    ["deportes", "sports"],
    ["fitness", "fitness"],
    ["entretenimiento", "entertainment"],
    ["automotriz", "automotive"],
    ["retail", "retail"],
    ["comercio", "retail"],
    ["sostenibilidad", "sustainability"],
    ["agricultura", "agriculture"],
    ["tecnología", "technology"],
    ["tecnologia", "technology"],
  ]);
  const raw = (brand.pillars || []).length
    ? brand.pillars
    : [brand.industry || ""];
  return [
    ...new Set(
      raw
        .map((term) => clean(term, 120))
        .filter(Boolean)
        .map((term) => dictionary.get(term.toLowerCase()) || term)
        .slice(0, 3),
    ),
  ];
}

function dailyQuery(brand, source, now) {
  const terms = queryTerms(brand, source);
  if (!terms.length)
    throw integrationError(
      "Añade un pilar, sector o consulta para buscar en esta plataforma.",
    );
  // Use one bounded query per provider run. Unconfigured searches rotate across
  // at most three pillars by UTC day, keeping source cost and quota predictable.
  const index = source.query?.trim()
    ? 0
    : Math.floor(now / 86400000) % terms.length;
  return { term: terms[index], terms, index };
}

function limitFor(source) {
  const limit = source.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS)
    throw integrationError("El límite social debe estar entre 1 y 50.");
  return limit;
}

function hostIs(value, hosts) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      hosts.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function canonicalPlatformUrl(platform, value) {
  const hosts = PLATFORM_HOSTS[platform];
  if (!hosts || !hostIs(value, hosts)) return null;
  const parsed = new URL(value);
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  const allowed =
    platform === "instagram"
      ? /^\/(?:[A-Za-z0-9._]{1,30}|(?:p|reel|tv)\/[A-Za-z0-9_-]+|explore\/tags\/[A-Za-z0-9._-]+)\/?$/i
      : /^\/@[A-Za-z0-9._]{1,24}(?:\/video\/\d+)?\/?$|^\/tag\/[A-Za-z0-9._-]+\/?$/i;
  if (!allowed.test(path)) return null;
  const canonical = new URL(`https://${platform}.com${path}`);
  return canonical.href;
}

function validSourceUrl(platform, value) {
  if (!value) return null;
  const canonical = canonicalPlatformUrl(platform, value);
  if (!canonical)
    throw integrationError(
      `Usa una URL pública reconocida de ${platform} (perfil, hashtag o video).`,
    );
  return canonical;
}

function youtubeUrlInfo(value) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw integrationError("La URL de YouTube no es válida.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
      parsed.hostname.toLowerCase(),
    )
  )
    throw integrationError(
      "Para una fuente por URL usa un canal público de YouTube.",
    );
  const handle = parsed.pathname.match(/^\/@([A-Za-z0-9._-]{1,100})\/?$/);
  if (handle) return { forHandle: `@${handle[1]}` };
  const channel = parsed.pathname.match(
    /^\/channel\/(UC[A-Za-z0-9_-]{20,})\/?$/,
  );
  if (channel) return { id: channel[1] };
  throw integrationError(
    "La URL de YouTube debe ser un canal /@usuario o /channel/ID; no se descargan videos desde este conector.",
  );
}

export function canonicalYoutubeSourceUrl(value) {
  const selector = youtubeUrlInfo(value);
  return selector.forHandle
    ? `https://www.youtube.com/${selector.forHandle}`
    : `https://www.youtube.com/channel/${selector.id}`;
}

export function canonicalSocialSourceUrl(type, platform, value) {
  if (!value) return undefined;
  if (type === "youtube") return canonicalYoutubeSourceUrl(value);
  if (type === "apify") return validSourceUrl(platform, value);
  return value;
}

function inferRegion(brand) {
  const market = clean(brand.market, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const regions = new Map([
    ["mexico", "MX"],
    ["colombia", "CO"],
    ["argentina", "AR"],
    ["chile", "CL"],
    ["peru", "PE"],
    ["ecuador", "EC"],
    ["espana", "ES"],
    ["united states", "US"],
    ["estados unidos", "US"],
    ["brasil", "BR"],
    ["brazil", "BR"],
  ]);
  return regions.get(market);
}

async function youtubeRequest(apiKey, endpoint, params, fetcher) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  const response = await fetcher(url.href, {
    requireHttps: true,
    maxRedirects: 0,
    timeout: 20000,
    maxBytes: 4 * 1024 * 1024,
    headers: { "x-goog-api-key": apiKey },
  });
  return readJson(response, "YouTube Data API");
}

function durationSeconds(value) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
    String(value || ""),
  );
  if (!match) return undefined;
  const seconds =
    Number(match[1] || 0) * 3600 +
    Number(match[2] || 0) * 60 +
    Number(match[3] || 0);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, 24 * 3600)
    : undefined;
}

function safeThumbnail(value) {
  if (typeof value !== "string" || value.length > 3000) return undefined;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(
        hostname,
      ) ||
      (isIP(hostname) && !isPublicAddress(hostname))
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function numberField(...values) {
  return values.find(
    (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
}

function mapYouTubeVideo(item, stats, rank, now) {
  const id = item.id?.videoId || item.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const snippet = stats?.snippet || item.snippet || {};
  const statistic = stats?.statistics || {};
  const details = stats?.contentDetails || {};
  const views =
    statistic.viewCount !== undefined ? Number(statistic.viewCount) : undefined;
  const likes =
    statistic.likeCount !== undefined ? Number(statistic.likeCount) : undefined;
  const comments =
    statistic.commentCount !== undefined
      ? Number(statistic.commentCount)
      : undefined;
  const metrics = {};
  if (Number.isFinite(views) && views >= 0) metrics.views = views;
  if (Number.isFinite(likes) && likes >= 0) metrics.likes = likes;
  if (Number.isFinite(comments) && comments >= 0) metrics.comments = comments;
  const thumbnails = snippet.thumbnails || {};
  const thumbnailUrl =
    safeThumbnail(thumbnails.high?.url) ||
    safeThumbnail(thumbnails.medium?.url) ||
    safeThumbnail(thumbnails.default?.url);
  const title = clean(snippet.title, 500);
  if (!title) return null;
  const publishedAt = Number.isFinite(Date.parse(snippet.publishedAt))
    ? new Date(snippet.publishedAt).toISOString()
    : undefined;
  return {
    title,
    text: clean(snippet.description, 12000),
    url: `https://www.youtube.com/watch?v=${id}`,
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    externalId: id,
    videoId: id,
    platform: "youtube",
    author: clean(snippet.channelTitle, 300) || undefined,
    creatorId: clean(snippet.channelId, 200) || undefined,
    publishedAt,
    language: "unknown",
    market: "Internacional",
    format: "video",
    thumbnailUrl,
    ...(durationSeconds(details.duration) !== undefined
      ? {
          duration: durationSeconds(details.duration),
          durationSeconds: durationSeconds(details.duration),
        }
      : {}),
    contentScope: "metadata_only",
    mediaAccess: "youtube_url",
    metrics: Object.keys(metrics).length ? metrics : undefined,
    metricsOrigin: "YouTube Data API",
    metricsObservedAt: new Date(now).toISOString(),
    officialRank: rank,
    signalType: "youtube-video",
  };
}

async function fetchYouTube(brand, source, { fetcher, now }) {
  const config = configFor(brand.id, "youtube");
  if (!config)
    throw integrationError(
      "YouTube no está configurado para esta marca. Añade una API key o habilita YOUTUBE_API_KEY en el servidor.",
    );
  const limit = limitFor(source);
  const queryPlan = dailyQuery(brand, source, now);
  let ids = [];
  let snippets = new Map();
  if (source.query?.trim() || !source.url) {
    const publishedAfter = new Date(now - 30 * 86400000).toISOString();
    const params = {
      part: "snippet",
      type: "video",
      q: queryPlan.term,
      maxResults: limit,
      order: "date",
      publishedAfter,
      regionCode: inferRegion(brand),
      // Searches stay in English for broader cross-market discovery. The brand
      // language describes where output is written, not where sources live.
      relevanceLanguage: "en",
    };
    const search = await youtubeRequest(
      config.apiKey,
      "search",
      params,
      fetcher,
    );
    if (!Array.isArray(search.items))
      throw integrationError(
        "YouTube no devolvió resultados de búsqueda reconocibles.",
        502,
      );
    for (const result of search.items.slice(0, limit)) {
      const id = result.id?.videoId;
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        ids.push(id);
        snippets.set(id, result.snippet || {});
      }
    }
  } else {
    const selector = youtubeUrlInfo(source.url);
    const channelResult = await youtubeRequest(
      config.apiKey,
      "channels",
      { part: "contentDetails", ...selector, maxResults: 1 },
      fetcher,
    );
    const uploadsPlaylist =
      channelResult.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylist)
      throw integrationError(
        "No se encontró la lista pública de videos de ese canal de YouTube.",
        502,
      );
    const playlist = await youtubeRequest(
      config.apiKey,
      "playlistItems",
      {
        part: "snippet,contentDetails",
        playlistId: uploadsPlaylist,
        maxResults: limit,
      },
      fetcher,
    );
    if (!Array.isArray(playlist.items))
      throw integrationError(
        "YouTube no devolvió videos del canal en un formato reconocible.",
        502,
      );
    for (const result of playlist.items.slice(0, limit)) {
      const id = result.contentDetails?.videoId;
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        ids.push(id);
        snippets.set(id, result.snippet || {});
      }
    }
  }
  if (!ids.length) return [];
  const details = await youtubeRequest(
    config.apiKey,
    "videos",
    { part: "snippet,statistics,contentDetails", id: ids.join(",") },
    fetcher,
  );
  if (!Array.isArray(details.items))
    throw integrationError(
      "YouTube no devolvió detalles y métricas de video reconocibles.",
      502,
    );
  const byId = new Map(details.items.map((item) => [item.id, item]));
  const mapped = ids
    .map((id) => {
      const video = byId.get(id);
      if (!video) return null;
      const result = mapYouTubeVideo(
        { id: { videoId: id }, snippet: snippets.get(id) },
        video,
        undefined,
        now,
      );
      if (result) result.searchQuery = queryPlan.term;
      return result;
    })
    .filter(Boolean);
  const ordered = [...mapped].sort(
    (a, b) => (b.metrics?.views ?? -1) - (a.metrics?.views ?? -1),
  );
  return ordered
    .filter((item) => {
      if (!source.url || !item.publishedAt) return true;
      const age = now - Date.parse(item.publishedAt);
      return age >= 0 && age <= 30 * 86400000;
    })
    .map((item, index) => ({ ...item, officialRank: index + 1 }));
}

function readApifyValue(item, dotted, nested) {
  if (item?.[dotted] !== undefined) return item[dotted];
  return nested?.reduce((value, key) => value?.[key], item);
}

function safeProviderMediaUrl(value) {
  if (typeof value !== "string" || value.length > 6000) return undefined;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(
        hostname,
      ) ||
      (isIP(hostname) && !isPublicAddress(hostname))
    )
      return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

export function mapApifyItem(raw, platform, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rawUrl = raw.url || raw.webVideoUrl || raw.permalink;
  const url = canonicalPlatformUrl(platform, rawUrl);
  if (!url) return null;
  const isVideo =
    platform === "tiktok" ||
    raw.type === "Video" ||
    raw.productType === "clips" ||
    raw.isReel === true ||
    raw.isVideo === true;
  if (!isVideo) return null;
  const caption = clean(
    raw.text || raw.description || raw.caption || raw.title || "",
    12000,
  );
  const author = clean(
    raw.ownerUsername ||
      readApifyValue(raw, "authorMeta.name", ["authorMeta", "name"]) ||
      raw.authorUniqueId ||
      raw.username,
    300,
  );
  const title =
    clean(caption, 500) ||
    `Video de ${platform}${author ? ` de @${author}` : ""}`;
  const id = clean(raw.id || raw.pk || raw.shortCode || "", 200);
  const published =
    raw.createTimeISO || raw.timestamp || raw.takenAtIso || raw.takenAt;
  let publishedAt;
  if (typeof published === "number") {
    const timestamp = published < 1e12 ? published * 1000 : published;
    if (
      Number.isFinite(timestamp) &&
      Number.isFinite(new Date(timestamp).getTime())
    )
      publishedAt = new Date(timestamp).toISOString();
  } else if (Number.isFinite(Date.parse(published)))
    publishedAt = new Date(published).toISOString();
  const rawDuration =
    raw.videoDuration ??
    raw.duration ??
    readApifyValue(raw, "videoMeta.duration", ["videoMeta", "duration"]);
  const duration =
    typeof rawDuration === "number" &&
    Number.isFinite(rawDuration) &&
    rawDuration > 0
      ? Math.min(rawDuration, 24 * 3600)
      : undefined;
  const views = numberField(
    raw.playCount,
    raw.videoPlayCount,
    raw.videoViewCount,
  );
  const likes = numberField(raw.diggCount, raw.likesCount);
  const comments = numberField(raw.commentCount, raw.commentsCount);
  const shares = numberField(raw.shareCount, raw.sharesCount);
  const metrics = {
    ...(views !== undefined ? { views } : {}),
    ...(likes !== undefined ? { likes } : {}),
    ...(comments !== undefined ? { comments } : {}),
    ...(shares !== undefined ? { shares } : {}),
  };
  const thumbnailUrl = safeThumbnail(
    raw.thumbnailUrl ||
      raw.displayUrl ||
      readApifyValue(raw, "videoMeta.coverUrl", ["videoMeta", "coverUrl"]) ||
      readApifyValue(raw, "videoMeta.cover", ["videoMeta", "cover"]) ||
      raw.coverUrl,
  );
  const mediaUrl = safeProviderMediaUrl(
    raw.videoUrl ||
      raw.mediaUrl ||
      (platform === "tiktok"
        ? readApifyValue(raw, "videoMeta.downloadAddr", [
            "videoMeta",
            "downloadAddr",
          ])
        : undefined),
  );
  return {
    title,
    text: caption,
    url,
    sourceUrl: url,
    externalId: id || url,
    platform,
    videoId: id || undefined,
    author: author || undefined,
    publishedAt,
    language:
      clean(raw.textLanguage || raw.language, 20).slice(0, 10) || "unknown",
    market: "Internacional",
    format: "video",
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(duration !== undefined ? { duration, durationSeconds: duration } : {}),
    ...(Object.keys(metrics).length ? { metrics } : {}),
    metricsOrigin: "Apify",
    metricsObservedAt: new Date(now).toISOString(),
    contentScope: "metadata_only",
    mediaAccess: mediaUrl ? "provider_url" : "unavailable",
    ...(mediaUrl ? { mediaUrl, mediaProvider: "apify" } : {}),
    signalType: "provider-video",
  };
}

function apifyInput(platform, source, query, limit) {
  if (platform === "instagram") {
    if (source.url) {
      const directUrl = validSourceUrl(platform, source.url);
      const isReel = /\/reel\//i.test(new URL(directUrl).pathname);
      if (!isReel && /\/(?:p|tv)\//i.test(new URL(directUrl).pathname))
        throw integrationError(
          "La fuente Instagram debe ser un Reel, perfil o hashtag; este Actor no se usará para analizar posts estáticos.",
        );
      return {
        directUrls: [directUrl],
        resultsType: "reels",
        resultsLimit: limit,
        addParentData: true,
      };
    }
    const hashtag = query.replace(/^#/, "").trim();
    if (!/^[\p{L}\p{N}._-]{1,100}$/u.test(hashtag))
      throw integrationError(
        "La búsqueda de Instagram requiere un hashtag de una sola palabra o una URL de perfil/Reel.",
      );
    return {
      search: `#${hashtag}`,
      searchType: "hashtag",
      searchLimit: 1,
      resultsType: "reels",
      resultsLimit: limit,
      addParentData: true,
    };
  }
  if (source.url) {
    const directUrl = validSourceUrl(platform, source.url);
    const pathname = new URL(directUrl).pathname;
    if (/^\/tag\//i.test(pathname))
      return {
        hashtags: [pathname.split("/").filter(Boolean)[1]],
        resultsPerPage: limit,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
        scrapeRelatedVideos: false,
      };
    if (/\/video\/\d+\/?$/i.test(pathname))
      return {
        postURLs: [directUrl],
        resultsPerPage: 1,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
        scrapeRelatedVideos: false,
      };
    const profile = pathname.match(/^\/@([A-Za-z0-9._]{1,24})\/?$/);
    if (!profile)
      throw integrationError(
        "La fuente TikTok debe ser un perfil, hashtag o video público.",
      );
    return {
      profiles: [profile[1]],
      resultsPerPage: limit,
      profileScrapeSections: ["videos"],
      profileSorting: "latest",
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
      scrapeRelatedVideos: false,
    };
  }
  const term = query.trim();
  if (!term)
    throw integrationError("Añade una consulta, hashtag o perfil para TikTok.");
  return {
    searchQueries: [term],
    searchSection: "/video",
    resultsPerPage: limit,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    scrapeRelatedVideos: false,
  };
}

async function runApifyActor(actor, token, input, limit, fetcher) {
  const actorPath = actor.replace("/", "~");
  const url = new URL(
    `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items`,
  );
  url.searchParams.set("timeout", "60");
  url.searchParams.set("clean", "true");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("maxItems", String(limit));
  url.searchParams.set("maxTotalChargeUsd", "1");
  url.searchParams.set("restartOnError", "false");
  // The same reservation applies with injected transports: replacing a fetcher
  // must never bypass the production budget shared by this credential.
  const reservation = reserveApifyRun(token);
  let completed = false;
  try {
    const response = await fetcher(url.href, {
      requireHttps: true,
      maxRedirects: 0,
      timeout: 75000,
      maxBytes: 6 * 1024 * 1024,
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const result = await readJson(response, "Apify");
    if (!Array.isArray(result))
      throw integrationError(
        "Apify devolvió una salida inesperada; no se guardaron resultados.",
        502,
      );
    completed = true;
    return result.slice(0, limit);
  } finally {
    finishProviderRun(reservation.id, { failed: !completed });
  }
}

async function fetchApify(brand, source, { fetcher, now }) {
  if (source.enabled === false)
    throw integrationError(
      "La fuente Apify está pausada. Un propietario debe habilitarla antes de consultar al proveedor.",
    );
  const config = configFor(brand.id, "apify");
  if (!config)
    throw integrationError(
      "Apify no está configurado para esta marca. Añade un token en Configuración social o APIFY_API_TOKEN en el servidor.",
    );
  const platform = source.platform;
  if (!APIFY_ACTORS[platform])
    throw integrationError(
      "Este despliegue de Apify solo tiene adapters verificados para Instagram y TikTok.",
    );
  const limit = limitFor(source);
  const queryPlan = dailyQuery(brand, source, now);
  const input = apifyInput(platform, source, queryPlan.term, limit);
  const rawItems = await runApifyActor(
    APIFY_ACTORS[platform],
    config.apiKey,
    input,
    limit,
    fetcher,
  );
  return rawItems
    .map((item) => {
      const mapped = mapApifyItem(item, platform, now);
      if (mapped) mapped.searchQuery = queryPlan.term;
      return mapped;
    })
    .filter(Boolean)
    .slice(0, limit);
}

export async function fetchSocialSource(
  brand,
  source,
  { fetcher = safeFetch, now = Date.now() } = {},
) {
  // A credential authenticates a provider call; it does not authorize this
  // product's collection and downstream use under the platform's terms.
  assertSocialCollectionAllowed(source);
  if (source.type === "youtube")
    return fetchYouTube(brand, source, { fetcher, now });
  if (source.type === "apify")
    return fetchApify(brand, source, { fetcher, now });
  throw integrationError("El proveedor social solicitado no está disponible.");
}

export const socialPlatforms = Object.freeze([
  "youtube",
  "instagram",
  "tiktok",
]);

export const socialEnvironmentAliases = Object.freeze({ ...ENV_KEYS });
