import fs from "node:fs";
import { containsUrlContactDetails } from "./url-privacy.mjs";

// Deployment-owned permission reviews, never a browser checkbox or API key.
// A review records evidence; it is not a legal determination or a platform grant.
export const ACCESS_POLICY_VERSION = "2026-10-18";
const PURPOSES = new Set(["website", "metadata", "rss", "ai", "webhook"]);
const RESTRICTED_HOSTS = [
  "instagram.com",
  "cdninstagram.com",
  "facebook.com",
  "fb.com",
  "fbcdn.net",
  "threads.net",
  "threads.com",
  "tiktok.com",
  "tiktokcdn.com",
  "tiktokv.com",
  "linkedin.com",
  "licdn.com",
  "reddit.com",
  "redd.it",
  "redditmedia.com",
  "youtube.com",
  "youtu.be",
  "googlevideo.com",
  "ytimg.com",
  "youtube.googleapis.com",
  "x.com",
  "twitter.com",
  "twimg.com",
  "pinterest.com",
  "pinimg.com",
  "snapchat.com",
  "discord.com",
  "discord.gg",
  "t.me",
  "telegram.me",
  "telegram.org",
  "apify.com",
];
const PLATFORM_POLICIES = Object.freeze({
  apify: {
    allowed: false,
    reason:
      "Instagram y TikTok están bloqueados: una cuenta de Apify o una cuenta propia no acredita autorización de la red para esta recopilación y reutilización.",
    termsUrl: "https://www.facebook.com/legal/automated_data_collection_terms",
  },
  youtube: {
    allowed: false,
    reason:
      "YouTube está bloqueado para este análisis editorial hasta completar la revisión de uso de datos, métricas derivadas, conservación y atribución. Una API key no habilita ese uso.",
    termsUrl: "https://developers.google.com/youtube/terms/developer-policies",
  },
  gemini: {
    allowed: false,
    reason:
      "El análisis de video está bloqueado hasta verificar derechos del material y las condiciones de tratamiento del proveedor.",
    termsUrl: "https://ai.google.dev/gemini-api/terms",
  },
  reddit: {
    allowed: false,
    reason:
      "Reddit está bloqueado: este producto no tiene un acuerdo verificado para recopilar y reutilizar su contenido comercialmente, incluido RSS.",
    termsUrl: "https://redditinc.com/policies/data-api-terms",
  },
});

function deny(reason) {
  throw Object.assign(new Error(reason), {
    status: 403,
    code: "SOURCE_ACCESS_RESTRICTED",
  });
}
function parsedUrl(value) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    )
      return null;
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return url;
  } catch {
    return null;
  }
}
const isHost = (hostname, domain) =>
  hostname === domain || hostname.endsWith(`.${domain}`);
export function isRestrictedCollectionUrl(value) {
  const url = parsedUrl(value);
  return (
    !!url &&
    (RESTRICTED_HOSTS.some((host) => isHost(url.hostname, host)) ||
      (url.hostname === "www.googleapis.com" &&
        url.pathname.startsWith("/youtube/")))
  );
}

function reviews(now = Date.now()) {
  if (!process.env.SOURCE_ACCESS_POLICY_FILE) return [];
  try {
    const filename = process.env.SOURCE_ACCESS_POLICY_FILE;
    if (fs.statSync(filename).size > 65536) return [];
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (
      value.version !== 1 ||
      !Array.isArray(value.grants) ||
      value.grants.length > 100
    )
      return [];
    return value.grants.filter((grant) => {
      if (!grant || typeof grant !== "object") return false;
      const origin = parsedUrl(grant.origin);
      const evidence = parsedUrl(grant.evidenceUrl);
      const reviewed = Date.parse(grant.reviewedAt),
        expires = Date.parse(grant.expiresAt);
      return (
        origin?.protocol === "https:" &&
        grant.origin === origin.origin &&
        evidence?.protocol === "https:" &&
        typeof grant.reviewedBy === "string" &&
        !!grant.reviewedBy.trim() &&
        typeof grant.note === "string" &&
        !!grant.note.trim() &&
        Number.isFinite(reviewed) &&
        reviewed <= now &&
        expires > now &&
        expires > reviewed &&
        expires - reviewed <= 90 * 86400000 &&
        Array.isArray(grant.purposes) &&
        grant.purposes.length > 0 &&
        grant.purposes.every((purpose) => PURPOSES.has(purpose)) &&
        typeof grant.pathPrefix === "string" &&
        grant.pathPrefix.startsWith("/") &&
        !/[?#\\\r\n]|\.\./.test(grant.pathPrefix)
      );
    });
  } catch {
    return [];
  }
}
const pathMatches = (path, prefix) =>
  prefix === "/" ||
  path === prefix ||
  path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
function reviewed(value, purpose) {
  const url = parsedUrl(value);
  if (!url || url.protocol !== "https:") return null;
  // Encoded separators/dot segments cannot widen an operator's path grant.
  if (/%(?:2f|5c|2e|00)/i.test(url.pathname)) return null;
  return reviews().find(
    (grant) =>
      grant.origin === url.origin &&
      grant.purposes.includes(purpose) &&
      pathMatches(url.pathname, grant.pathPrefix),
  );
}
function officialTrends(url) {
  return (
    url.protocol === "https:" &&
    url.hostname === "trends.google.com" &&
    url.pathname === "/trending/rss" &&
    [...url.searchParams.keys()].every((key) => key === "geo") &&
    url.searchParams.getAll("geo").length === 1 &&
    /^[A-Z]{2}$/.test(url.searchParams.get("geo"))
  );
}
export function providerAccessPolicy(provider) {
  return {
    ...(PLATFORM_POLICIES[provider] || {
      allowed: false,
      reason:
        "Este proveedor requiere una revisión de permisos para el uso previsto.",
    }),
    reviewedAt: ACCESS_POLICY_VERSION,
  };
}
export function sourceAccessPolicy(source) {
  if (PLATFORM_POLICIES[source?.type]) return providerAccessPolicy(source.type);
  if (["hackernews", "gdelt"].includes(source?.type))
    return {
      allowed: true,
      reason:
        "API pública prevista para consultas automatizadas; conserva la atribución y respeta sus límites.",
      reviewedAt: ACCESS_POLICY_VERSION,
      termsUrl:
        source.type === "gdelt"
          ? "https://www.gdeltproject.org/about.html"
          : "https://hn.algolia.com/api",
    };
  if (source?.type === "rss") return webAccessPolicy(source.url, "rss");
  return {
    allowed: false,
    reason: "No hay un permiso revisado para esta fuente.",
    reviewedAt: ACCESS_POLICY_VERSION,
  };
}
export function assertSourceCollectionAllowed(source) {
  const policy = sourceAccessPolicy(source);
  if (!policy.allowed) deny(policy.reason);
  return policy;
}
export const assertSocialCollectionAllowed = assertSourceCollectionAllowed;
export function assertVideoAnalysisAllowed() {
  deny(PLATFORM_POLICIES.gemini.reason);
}

export function webAccessPolicy(value, purpose = "metadata") {
  const url = parsedUrl(value);
  if (
    !url ||
    isRestrictedCollectionUrl(value) ||
    containsUrlContactDetails(value) ||
    /\/(?:login|signin|sign-in|auth|oauth|accounts?|dashboard|admin|wp-admin)(?:\/|$)/i.test(
      url.pathname,
    ) ||
    [...url.searchParams.keys()].some((key) =>
      /(?:^|[-_])(?:token|key|secret|password|session|cookie|authorization|signature)(?:$|[-_])|^(?:accessToken|apiKey|auth|sig|jwt)$/i.test(
        key,
      ),
    )
  )
    return {
      allowed: false,
      reason:
        "Enlace conservado sin leer: esta plataforma no tiene acceso automatizado aprobado para este uso.",
      reviewedAt: ACCESS_POLICY_VERSION,
    };
  if (purpose === "rss" && officialTrends(url))
    return {
      allowed: true,
      reason:
        "Exportación RSS oficial de Google Trends; se mantiene la atribución.",
      termsUrl: "https://support.google.com/trends/answer/3076011",
      reviewedAt: ACCESS_POLICY_VERSION,
    };
  // Reviewed 2026-10-18: the official public feed and robots permit this RSS
  // read. This exact endpoint grant never extends to articles or comments.
  if (purpose === "rss" && value === "https://news.ycombinator.com/rss")
    return {
      allowed: true,
      reason:
        "RSS público oficial de Hacker News; solo títulos y metadatos, con atribución.",
      termsUrl: "https://news.ycombinator.com/rss",
      reviewedAt: ACCESS_POLICY_VERSION,
    };
  const grant = reviewed(value, purpose);
  return grant
    ? {
        allowed: true,
        reason:
          "Permiso de uso revisado por el operador para esta ruta y finalidad.",
        termsUrl: grant.evidenceUrl,
        reviewedAt: grant.reviewedAt,
        expiresAt: grant.expiresAt,
      }
    : {
        allowed: false,
        reason:
          "Enlace conservado sin leer: el operador debe revisar los términos y el permiso de esta web para esta finalidad. Puedes aportar contenido propio.",
        reviewedAt: ACCESS_POLICY_VERSION,
      };
}
export function assertWebReadAllowed(value, purpose = "metadata") {
  const policy = webAccessPolicy(value, purpose);
  if (!policy.allowed) deny(policy.reason);
  return policy;
}
export function assertAiProviderAllowed(baseUrl) {
  const grant = reviewed(baseUrl, "ai");
  if (!grant || isRestrictedCollectionUrl(baseUrl))
    deny(
      "El proveedor de IA requiere una revisión del operador sobre sus términos, tratamiento y derechos de entrada antes de recibir contenido. El motor local sigue disponible.",
    );
  return grant;
}
export function assertWebhookAllowed(value) {
  if (!reviewed(value, "webhook") || isRestrictedCollectionUrl(value))
    deny(
      "El destino de publicación requiere una revisión del operador para esta URL. Puedes exportar la pieza para publicarla manualmente.",
    );
}
export function aiProviderAccessPolicy(value) {
  try {
    const grant = assertAiProviderAllowed(value);
    return {
      allowed: true,
      reason: "Proveedor y finalidad revisados por el operador.",
      reviewedAt: grant.reviewedAt,
      expiresAt: grant.expiresAt,
    };
  } catch (error) {
    return { allowed: false, reason: error.message };
  }
}
export function webhookAccessPolicy(value) {
  try {
    assertWebhookAllowed(value);
    return {
      allowed: true,
      reason: "Destino de publicación revisado por el operador.",
    };
  } catch (error) {
    return { allowed: false, reason: error.message };
  }
}

// Applies before DNS/socket creation, including each redirect. Higher-level
// checks also run before injected fetchers so credentials cannot bypass policy.
export function assertOutboundAllowed(value, purpose = "metadata") {
  const url = parsedUrl(value);
  if (!url) deny("El destino no es una URL pública de recopilación válida.");
  if (isRestrictedCollectionUrl(value))
    deny(
      "La recopilación de esta plataforma está bloqueada por la política de acceso.",
    );
  if (purpose === "ai") return assertAiProviderAllowed(value);
  if (purpose === "webhook") return assertWebhookAllowed(value);
  if (
    purpose === "discovery" &&
    url.protocol === "https:" &&
    ((url.hostname === "hn.algolia.com" &&
      /^\/api\/v1\/(?:search|search_by_date)$/.test(url.pathname)) ||
      (url.hostname === "api.gdeltproject.org" &&
        url.pathname === "/api/v2/doc/doc"))
  )
    return;
  if (
    purpose === "robots" &&
    url.pathname === "/robots.txt" &&
    !url.search &&
    !url.hash &&
    (url.origin === "https://trends.google.com" ||
      url.origin === "https://news.ycombinator.com" ||
      reviews().some(
        (grant) =>
          grant.origin === url.origin &&
          grant.purposes.some((scope) =>
            ["website", "metadata", "rss"].includes(scope),
          ),
      ))
  )
    return;
  return assertWebReadAllowed(value, purpose);
}

export function referenceUsePolicy(reference, source) {
  if (reference?.isDemo) return { allowed: true };
  if (
    reference?.ingestionAccess &&
    (!["website", "metadata", "rss"].includes(
      reference.ingestionAccess.purpose,
    ) ||
      [
        reference.ingestionAccess.url,
        ...(reference.ingestionAccess.urls || []),
      ].some(
        (url) =>
          !webAccessPolicy(url, reference.ingestionAccess.purpose).allowed,
      ))
  )
    return {
      allowed: false,
      reason:
        "El permiso del contenido recopilado ha caducado o fue retirado. Revisa su autorización antes de reutilizarlo.",
    };
  const provider = `${reference?.metricsOrigin || ""} ${reference?.mediaProvider || ""} ${reference?.source || ""}`;
  if (
    reference?.ingestionRestricted ||
    ["youtube", "apify", "reddit", "telegram"].includes(
      reference?.ingestionProvider,
    ) ||
    (source && !sourceAccessPolicy(source).allowed) ||
    /\b(?:youtube|apify|reddit|telegram)\b/i.test(provider) ||
    reference?.platform === "youtube" ||
    (reference?.sourceId &&
      ["instagram", "tiktok", "reddit", "telegram"].includes(
        reference.platform,
      ))
  )
    return {
      allowed: false,
      reason:
        "Este contenido importado requiere una revisión de permiso antes de analizarlo o reutilizarlo. El enlace puede conservarse como referencia.",
    };
  return { allowed: true };
}
export function assertReferenceUseAllowed(reference, source) {
  const policy = referenceUsePolicy(reference, source);
  if (!policy.allowed) deny(policy.reason);
}

export function publicAccessPolicies() {
  return {
    version: ACCESS_POLICY_VERSION,
    ...Object.fromEntries(
      Object.keys(PLATFORM_POLICIES).map((key) => [
        key,
        providerAccessPolicy(key),
      ]),
    ),
    externalWeb: {
      allowed: false,
      reason:
        "Las webs y feeds adicionales requieren una revisión por dominio, ruta y finalidad; ser públicos no concede permiso.",
    },
  };
}
