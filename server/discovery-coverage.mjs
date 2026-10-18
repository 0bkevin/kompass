import {
  ACCESS_POLICY_VERSION,
  isRestrictedCollectionUrl,
  providerAccessPolicy,
  sourceAccessPolicy,
} from "./access-policy.mjs";
import {
  REFERENCE_IDENTITY_VERSION,
  referenceIdentity,
} from "./reference-identity.mjs";

export const DISCOVERY_COVERAGE_VERSION = 1;

const NETWORKS = {
  hackernews: ["Hacker News / Algolia", "community_metadata"],
  gdelt: ["GDELT", "news_metadata"],
  google_trends: ["Google Trends", "search_interest"],
  rss: ["RSS / Atom", "feed"],
  web: ["Web pública", "web"],
  supplied: ["Material aportado", "supplied"],
  youtube: ["YouTube", "social"],
  instagram: ["Instagram", "social"],
  linkedin: ["LinkedIn", "social"],
  tiktok: ["TikTok", "social"],
  facebook: ["Facebook", "social"],
  x: ["X", "social"],
  reddit: ["Reddit", "social"],
  threads: ["Threads", "social"],
  telegram: ["Telegram", "social"],
  discord: ["Discord", "social"],
  pinterest: ["Pinterest", "social"],
  snapchat: ["Snapchat", "social"],
  apify: ["Apify (recopilación restringida)", "restricted_provider"],
  unknown: ["Procedencia sin verificar", "unknown"],
};
const DEFAULT_NETWORKS = [
  "hackernews",
  "gdelt",
  "google_trends",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
];
const MODES = [
  "retrievedText",
  "providedText",
  "metadataOnly",
  "linkOnly",
  "unavailable",
];
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const records = (value) => (Array.isArray(value) ? value.filter(object) : []);
const text = (value) => typeof value === "string" && !!value.trim();
const id = (value) =>
  typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : null;
const belongs = (record, brand) =>
  !record.brandId || record.brandId === brand?.id;

function instant(value) {
  if (!(typeof value === "number" || text(value) || value instanceof Date))
    return null;
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  return Number.isFinite(time) && Math.abs(time) <= 8.64e15
    ? new Date(time).toISOString()
    : null;
}

function pastInstant(value, now) {
  const date = instant(value);
  return date && (!now || date <= now) ? date : null;
}

function url(value) {
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function trends(value) {
  const parsed = url(value);
  return (
    parsed?.protocol === "https:" &&
    !parsed.username &&
    !parsed.password &&
    !parsed.port &&
    parsed.hostname === "trends.google.com" &&
    parsed.pathname === "/trending/rss" &&
    [...parsed.searchParams.keys()].every((key) => key === "geo") &&
    parsed.searchParams.getAll("geo").length === 1 &&
    /^[A-Z]{2}$/.test(parsed.searchParams.get("geo"))
  );
}

function urlNetwork(value) {
  const parsed = url(value);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const hosts = {
    "news.ycombinator.com": "hackernews",
    "hn.algolia.com": "hackernews",
    "gdeltproject.org": "gdelt",
    "trends.google.com": "google_trends",
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "googlevideo.com": "youtube",
    "ytimg.com": "youtube",
    "youtube.googleapis.com": "youtube",
    "instagram.com": "instagram",
    "cdninstagram.com": "instagram",
    "linkedin.com": "linkedin",
    "licdn.com": "linkedin",
    "tiktok.com": "tiktok",
    "tiktokcdn.com": "tiktok",
    "tiktokv.com": "tiktok",
    "facebook.com": "facebook",
    "fb.com": "facebook",
    "fbcdn.net": "facebook",
    "x.com": "x",
    "twitter.com": "x",
    "twimg.com": "x",
    "reddit.com": "reddit",
    "redd.it": "reddit",
    "redditmedia.com": "reddit",
    "threads.net": "threads",
    "threads.com": "threads",
    "t.me": "telegram",
    "telegram.me": "telegram",
    "telegram.org": "telegram",
    "discord.com": "discord",
    "discord.gg": "discord",
    "pinterest.com": "pinterest",
    "pinimg.com": "pinterest",
    "snapchat.com": "snapchat",
    "apify.com": "apify",
  };
  if (host === "www.googleapis.com" && parsed.pathname.startsWith("/youtube/"))
    return "youtube";
  return (
    Object.entries(hosts).find(
      ([domain]) => host === domain || host.endsWith(`.${domain}`),
    )?.[1] || "web"
  );
}

function sourceNetwork(source) {
  if (["hackernews", "gdelt", "youtube", "reddit"].includes(source.type))
    return source.type;
  if (source.type === "apify")
    return ["instagram", "tiktok"].includes(source.platform)
      ? source.platform
      : "apify";
  if (source.type === "rss")
    return trends(source.url)
      ? "google_trends"
      : isRestrictedCollectionUrl(source.url)
        ? urlNetwork(source.url) || "unknown"
        : "rss";
  return "unknown";
}

function referenceNetwork(reference, source) {
  // Connector provenance wins over an editable label, target channel or linked publisher.
  if (source) return sourceNetwork(source);
  if (
    ["hackernews", "gdelt", "youtube", "reddit", "apify"].includes(
      reference.ingestionProvider,
    )
  )
    return sourceNetwork({
      type: reference.ingestionProvider,
      platform: reference.platform,
    });
  const credits = records(reference.providerAttributions).map(
    (credit) => credit.id,
  );
  if (credits.includes("hn_algolia")) return "hackernews";
  if (credits.includes("gdelt") || reference.signalType === "news-coverage")
    return "gdelt";
  if (
    credits.includes("google_trends") ||
    (reference.signalType === "search-interest" && trends(reference.sourceUrl))
  )
    return "google_trends";
  if (reference.sourceId) return "unknown";
  if (reference.ingestionProvider === "rss") return "rss";
  if (urlNetwork(reference.sourceUrl) === "hackernews") return "hackernews";
  return (
    urlNetwork(reference.url) ||
    (reference.ingestionAccess ? "web" : "supplied")
  );
}

function permission(allowed, state, basis, reason) {
  return { allowed, state, basis, reason };
}

function snapshotPolicy(snapshot, now) {
  if (!object(snapshot))
    return permission(
      false,
      "unverified",
      "missing_review",
      "Falta una revisión vigente del servidor para esta finalidad.",
    );
  if (snapshot.allowed !== true)
    return permission(
      false,
      "restricted",
      "server_review",
      "El servidor restringe esta fuente o su reutilización.",
    );
  if (
    snapshot.expiresAt !== undefined &&
    (!now || !instant(snapshot.expiresAt) || instant(snapshot.expiresAt) <= now)
  )
    return permission(
      false,
      "expired",
      "server_review",
      "La revisión ha caducado o no se puede verificar su vigencia.",
    );
  if (
    snapshot.reviewedAt !== undefined &&
    (!instant(snapshot.reviewedAt) ||
      (now && instant(snapshot.reviewedAt) > now))
  )
    return permission(
      false,
      "unverified",
      "server_review",
      "La fecha de revisión no es válida para este informe.",
    );
  return permission(
    true,
    "allowed",
    "server_review",
    "Permiso evaluado por el servidor para esta finalidad.",
  );
}

function collectionPermission(source, now) {
  const network = sourceNetwork(source);
  if (
    NETWORKS[network]?.[1] === "social" ||
    network === "apify" ||
    isRestrictedCollectionUrl(source.url)
  )
    return {
      ...permission(
        false,
        "restricted",
        "access_policy",
        "Esta recopilación editorial permanece restringida; un enlace o una credencial no la habilitan.",
      ),
      ...(source.type === "youtube" ||
      source.type === "reddit" ||
      source.type === "apify"
        ? { termsUrl: providerAccessPolicy(source.type).termsUrl }
        : {}),
    };
  // These branches of sourceAccessPolicy are static and never inspect operator files.
  if (
    ["hackernews", "gdelt"].includes(source.type) ||
    (source.type === "rss" && trends(source.url))
  ) {
    const policy = sourceAccessPolicy(source);
    if (
      source.accessPolicy &&
      !snapshotPolicy(source.accessPolicy, now).allowed
    )
      return snapshotPolicy(source.accessPolicy, now);
    return {
      ...permission(
        policy.allowed,
        policy.allowed ? "allowed" : "restricted",
        "access_policy",
        policy.reason,
      ),
      termsUrl: policy.termsUrl,
    };
  }
  return source.type === "rss"
    ? snapshotPolicy(source.accessPolicy, now)
    : permission(
        false,
        "unverified",
        "unsupported_source",
        "No hay un adaptador de descubrimiento revisado para esta fuente.",
      );
}

function readPermission(reference, source, sourcePolicy, now) {
  if (
    (reference.accessPolicy &&
      !snapshotPolicy(reference.accessPolicy, now).allowed) ||
    reference.ingestionRestricted ||
    ["youtube", "apify", "reddit", "telegram"].includes(
      reference.ingestionProvider,
    ) ||
    reference.platform === "youtube" ||
    /\b(?:youtube|apify|reddit|telegram)\b/i.test(
      `${reference.metricsOrigin || ""} ${reference.mediaProvider || ""} ${reference.source || ""}`,
    ) ||
    (source && !sourcePolicy.allowed)
  )
    return false;
  if (reference.sourceId && !source) return false;
  const access = reference.ingestionAccess;
  if (access) {
    const trail = [
      access.url,
      ...(Array.isArray(access.urls) ? access.urls : []),
    ];
    if (
      !["website", "metadata", "rss"].includes(access.purpose) ||
      !text(access.url) ||
      (access.urls !== undefined && !Array.isArray(access.urls)) ||
      trail.some((value) => !url(value) || isRestrictedCollectionUrl(value))
    )
      return false;
    // The official feed needs no operator-file lookup. Other redirect trails
    // must have been evaluated with referenceUsePolicy by the integrating server.
    if (
      !(access.purpose === "rss" && trail.every(trends)) &&
      !snapshotPolicy(reference.accessPolicy, now).allowed
    )
      return false;
  }
  return true;
}

function observation(reference, source, sourcePolicy, now) {
  const allowed = readPermission(reference, source, sourcePolicy, now);
  const access = allowed ? reference.ingestionAccess : null;
  const pageRead = !!access && ["website", "metadata"].includes(access.purpose);
  const feedRead = !!access && access.purpose === "rss";
  const imported =
    !!source ||
    !!reference.sourceId ||
    !!reference.ingestionProvider ||
    records(reference.providerAttributions).length > 0;
  const hasText =
    allowed &&
    text(reference.text) &&
    reference.contentScope !== "metadata_only";
  const mode = hasText
    ? pageRead || feedRead
      ? "retrievedText"
      : imported
        ? "metadataOnly"
        : "providedText"
    : allowed && imported && text(reference.title)
      ? "metadataOnly"
      : text(reference.url)
        ? "linkOnly"
        : "unavailable";
  return {
    reference,
    mode,
    pageRead,
    feedRead,
    restricted: !allowed,
    linkedWithoutPageRead: text(reference.url) && !pageRead,
  };
}

function aggregate(observations, now) {
  const publications = new Map();
  for (const entry of observations) {
    const key = referenceIdentity(entry.reference) || Symbol();
    const group = publications.get(key) || [];
    group.push(entry);
    publications.set(key, group);
  }
  const counts = {
    records: observations.length,
    uniqueReferences: publications.size,
    duplicateRecords: observations.length - publications.size,
    retrievedText: 0,
    providedText: 0,
    metadataOnly: 0,
    linkOnly: 0,
    unavailable: 0,
    pageReads: 0,
    feedReads: 0,
    linkedWithoutPageRead: 0,
    restrictedReferences: 0,
    datedReferences: 0,
    undatedReferences: 0,
    invalidPublicationDates: 0,
    futurePublicationDates: 0,
    publishedLast7Days: now ? 0 : null,
  };
  const published = [],
    stored = [],
    seen = [];
  for (const group of publications.values()) {
    const best = [...group].sort(
      (a, b) => MODES.indexOf(a.mode) - MODES.indexOf(b.mode),
    )[0];
    counts[best.mode]++;
    for (const [field, key] of [
      ["pageReads", "pageRead"],
      ["feedReads", "feedRead"],
      ["linkedWithoutPageRead", "linkedWithoutPageRead"],
    ])
      if (group.some((entry) => entry[key])) counts[field]++;
    if (group.every((entry) => entry.restricted)) counts.restrictedReferences++;
    const dates = group
      .map(({ reference }) => instant(reference.publishedAt))
      .filter((value) => value && (!now || value <= now));
    if (dates.length) {
      counts.datedReferences++;
      published.push(...dates);
      if (
        now &&
        dates.some(
          (value) => Date.parse(now) - Date.parse(value) < 7 * 86400000,
        )
      )
        counts.publishedLast7Days++;
    } else counts.undatedReferences++;
    if (
      group.some(
        ({ reference }) =>
          reference.publishedAt != null && !instant(reference.publishedAt),
      )
    )
      counts.invalidPublicationDates++;
    if (
      now &&
      group.some(({ reference }) => instant(reference.publishedAt) > now)
    )
      counts.futurePublicationDates++;
    for (const { reference } of group) {
      for (const [values, value] of [
        [stored, reference.createdAt],
        [seen, reference.firstSeenAt],
      ]) {
        const date = instant(value);
        if (date && (!now || date <= now)) values.push(date);
      }
    }
  }
  const range = (values) => {
    values.sort();
    return { from: values[0] || null, to: values.at(-1) || null };
  };
  return {
    counts,
    dates: {
      published: range(published),
      stored: range(stored),
      firstSeen: range(seen),
    },
  };
}

function sourceError(value, sourceId, stage, occurredAt) {
  if (!text(value)) return null;
  // Never echo provider diagnostics: they can contain URLs, personal details or credentials.
  const status = String(value).match(/\b(?:HTTP[\s:(]*)?([45]\d{2})\b/)?.[1];
  const code =
    status === "429" || /rate.?limit|cuota|límite/i.test(value)
      ? "RATE_LIMITED"
      : ["401", "403"].includes(status)
        ? "ACCESS_DENIED"
        : /timeout|timed? out|tiempo de espera/i.test(value)
          ? "TIMEOUT"
          : "SOURCE_ERROR";
  const messages = {
    RATE_LIMITED: "La fuente limitó la consulta.",
    ACCESS_DENIED: "La fuente rechazó el acceso.",
    TIMEOUT: "La consulta agotó el tiempo de espera.",
    SOURCE_ERROR: "La consulta falló; no se acredita una lectura reciente.",
  };
  return {
    sourceId,
    stage,
    code,
    httpStatus: status ? Number(status) : null,
    occurredAt,
    message: messages[code],
  };
}

/**
 * Pure, credential-free coverage of one brand's stored references, never a fetch
 * or an authorization gate. Supply freshly evaluated source.accessPolicy and
 * reference.accessPolicy for operator-reviewed reads. `now` is optional; without
 * it asOf/recent counts are null and expiring reviews cannot be verified.
 * Counts use REFERENCE_IDENTITY_VERSION, exclude demos, and never sum networks.
 * @param {object} brand
 * @param {{references?: object[], sources?: object[], socialConnections?: object, now?: string | number | Date}} input
 * @returns {object} JSON-safe versioned report; see docs/discovery-coverage.md.
 */
export function buildDiscoveryCoverage(
  brand,
  { references = [], sources = [], socialConnections = {}, now } = {},
) {
  const asOf = instant(now);
  const inputReferences = records(references),
    inputSources = records(sources);
  const currentSources = [
    ...new Map(
      inputSources
        .filter((source) => belongs(source, brand) && !source.isDemo)
        .map((source, index) => [id(source.id) || Symbol(index), source]),
    ).values(),
  ];
  const sourceMap = new Map(
    currentSources
      .filter((source) => id(source.id))
      .map((source) => [source.id, source]),
  );
  const policies = new Map(
    currentSources.map((source) => [
      source,
      collectionPermission(source, asOf),
    ]),
  );
  const scoped = inputReferences.filter(
    (reference) => belongs(reference, brand) && !reference.isDemo,
  );
  const observations = scoped.map((reference) => {
    const source = sourceMap.get(reference.sourceId);
    return {
      ...observation(reference, source, policies.get(source), asOf),
      network: referenceNetwork(reference, source),
    };
  });
  const errors = [];
  const sourceRows = currentSources.map((source) => {
    const lastSyncedAt = instant(source.lastSyncedAt);
    const usableSync =
      lastSyncedAt && (!asOf || lastSyncedAt <= asOf) ? lastSyncedAt : null;
    const error = sourceError(
      source.lastError,
      id(source.id),
      "collection",
      instant(source.lastAttemptAt),
    );
    if (error) errors.push(error);
    const policy = policies.get(source);
    const verified = !!usableSync && !error && policy.allowed;
    const items = observations.filter(
      (entry) => entry.reference.sourceId === source.id && id(source.id),
    );
    return {
      id: id(source.id),
      network: sourceNetwork(source),
      type:
        typeof source.type === "string" && NETWORKS[source.type]
          ? source.type
          : source.type === "rss"
            ? "rss"
            : "unknown",
      configured: true,
      enabled: source.enabled === true && policy.allowed,
      permission: {
        ...policy,
        purpose: source.type === "rss" ? "rss" : "discovery_metadata",
      },
      verification: {
        verified,
        status: !policy.allowed
          ? policy.state
          : error
            ? "error"
            : verified
              ? "verified"
              : "not_verified",
        lastSyncedAt: usableSync,
        lastSuccessAgeHours:
          usableSync && asOf
            ? Math.floor((Date.parse(asOf) - Date.parse(usableSync)) / 3600000)
            : null,
        lastAttemptAt: instant(source.lastAttemptAt),
        lastResultCount:
          usableSync &&
          Number.isInteger(source.lastResultCount) &&
          source.lastResultCount >= 0
            ? source.lastResultCount
            : null,
      },
      ...aggregate(items, asOf),
      errors: error ? [error] : [],
    };
  });
  const providers = records(socialConnections?.providers);
  const networkIds = new Set([
    ...DEFAULT_NETWORKS,
    ...sourceRows.map((source) => source.network),
    ...observations.map((entry) => entry.network),
  ]);
  const networks = [...networkIds].sort().map((network) => {
    const configured = sourceRows.filter(
      (source) => source.network === network,
    );
    const provider = providers.find((item) => item.id === network);
    const social = NETWORKS[network][1] === "social";
    const connection =
      social && provider
        ? {
            configured: provider.configured === true,
            ready: provider.ready === true,
            connected: !!pastInstant(provider.connection?.connectedAt, asOf),
            connectedAt: pastInstant(provider.connection?.connectedAt, asOf),
            lastSyncedAt: pastInstant(
              provider.connection?.lastSyncedAt ||
                (network === "youtube"
                  ? socialConnections.automaticSync?.lastSyncedAt
                  : null),
              asOf,
            ),
            contentVerified: false,
            permittedPurposes:
              network === "youtube" && provider.ready === true
                ? ["official_public_catalogue", "native_public_counters"]
                : [],
          }
        : null;
    const officialError =
      provider?.connection?.lastError ||
      (network === "youtube"
        ? socialConnections?.automaticSync?.lastError
        : null);
    const networkErrors = configured.flatMap((source) => source.errors);
    if (officialError) {
      const error = sourceError(officialError, null, "official_sync", null);
      if (error) {
        const safe = { ...error, network };
        errors.push(safe);
        networkErrors.push(safe);
      }
    }
    const editorialAllowed =
      !social &&
      !["apify", "unknown"].includes(network) &&
      (configured.length
        ? configured.some((source) => source.permission.allowed)
        : ["hackernews", "gdelt", "google_trends", "supplied"].includes(
            network,
          ) ||
          observations.some(
            (entry) =>
              entry.network === network &&
              !entry.restricted &&
              entry.mode === "retrievedText",
          ));
    return {
      id: network,
      name: NETWORKS[network][0],
      kind: NETWORKS[network][1],
      sourceIds: configured
        .map((source) => source.id)
        .filter(Boolean)
        .sort(),
      configuredSources: configured.length,
      enabledSources: configured.filter((source) => source.enabled).length,
      verifiedSources: configured.filter(
        (source) => source.verification.verified,
      ).length,
      editorialAnalysisAllowed: editorialAllowed,
      permittedPurposes: !editorialAllowed
        ? []
        : network === "supplied"
          ? ["local_supplied_material"]
          : [
              network === "rss"
                ? "rss"
                : network === "web"
                  ? "reviewed_web_read"
                  : "discovery_metadata",
              "editorial_analysis",
            ],
      officialConnection: connection,
      ...aggregate(
        observations.filter((entry) => entry.network === network),
        asOf,
      ),
      errors: networkErrors,
    };
  });
  return {
    version: DISCOVERY_COVERAGE_VERSION,
    policyVersion: ACCESS_POLICY_VERSION,
    identityVersion: REFERENCE_IDENTITY_VERSION,
    brandId: id(brand?.id),
    asOf,
    scope: "stored_non_demo_references",
    summary: {
      ...aggregate(observations, asOf),
      configuredSources: sourceRows.length,
      enabledSources: sourceRows.filter((source) => source.enabled).length,
      verifiedSources: sourceRows.filter(
        (source) => source.verification.verified,
      ).length,
      excludedDemoReferences: inputReferences.filter(
        (reference) => belongs(reference, brand) && reference.isDemo,
      ).length,
      excludedForeignReferences: inputReferences.filter(
        (reference) => !belongs(reference, brand),
      ).length,
      excludedForeignSources: inputSources.filter(
        (source) => !belongs(source, brand),
      ).length,
    },
    sources: sourceRows,
    networks,
    errors,
    limitations: [
      "Cobertura del material guardado; no acredita una búsqueda exhaustiva ni personas o seguidores observados.",
      "HN, GDELT y Google Trends no acreditan lectura ni rendimiento en redes sociales. El interés de búsqueda no es interacción social.",
      "Una fecha de guardado o primera detección no sustituye a la fecha de publicación. Leer metadatos o texto de un feed no acredita leer la página completa.",
      "Un conector configurado o listo no verifica contenido importado. YouTube oficial conserva catálogo y contadores fuera del análisis editorial y de sus derivados.",
      "Los recuentos globales eliminan duplicados entre fuentes. Los recuentos por fuente o red pueden solaparse y no deben sumarse.",
    ],
  };
}
