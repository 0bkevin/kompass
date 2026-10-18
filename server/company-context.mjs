import express from "express";
import { createHash, randomUUID } from "node:crypto";
import net from "node:net";
import { webAccessPolicy, assertWebReadAllowed } from "./access-policy.mjs";
import {
  safeFetch,
  validatePublicUrl,
  isPublicAddress,
} from "./connectors.mjs";
import { requireAuth, requireBrand, requireOwner } from "./core.mjs";
import {
  db,
  getBrand,
  listRecords,
  saveRecord,
  deleteRecord,
  addActivity,
} from "./db.mjs";

const MAX_URLS = 6;
const MAX_TEXT = 20_000;
const MAX_BYTES = 512 * 1024;
const CACHE_TTL = 30 * 60_000;
const INFERENCE_NOTICE =
  "Las sugerencias de marca y audiencia son hipótesis basadas en el contenido aportado. Confírmalas; no describen consumidores observados.";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function inputText(value, name, max) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max)
    fail(400, `${name} debe ser texto de hasta ${max} caracteres.`);
  return value.trim();
}

// This preliminary check applies even to links that will never be fetched.
// Actual requests also resolve and pin public DNS through safeFetch.
function publicUrl(value) {
  const raw = inputText(value, "La URL", 2_000);
  if (!raw || /\s/.test(raw)) fail(400, "Usa una URL pública válida.");
  let url;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    fail(400, "Usa una URL pública válida.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    !hostname ||
    (!hostname.includes(".") && !net.isIP(hostname)) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/i.test(
      hostname,
    ) ||
    (net.isIP(hostname) && !isPublicAddress(hostname))
  )
    fail(
      400,
      "Solo se permiten URLs públicas HTTP/HTTPS sin credenciales ni direcciones privadas.",
    );
  // Queries may contain contact details, tracking IDs or access tokens.
  url.search = "";
  url.hash = "";
  if (/@|%40/i.test(url.pathname)) {
    // @handles are legitimate on social platforms; email addresses are not.
    if (/[\w.+-]+(?:@|%40)[\w.-]+\.[a-z]{2,}/i.test(url.pathname))
      fail(400, "No incluyas datos de contacto en la URL.");
  }
  return url;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(
      400,
      "Envía un objeto con una web, enlaces públicos o contenido propio.",
    );
  const website = inputText(input.website, "La web", 2_000);
  const text = inputText(input.text, "El contenido", MAX_TEXT);
  if (
    input.urls !== undefined &&
    (!Array.isArray(input.urls) || input.urls.length > MAX_URLS)
  )
    fail(400, `Añade hasta ${MAX_URLS} enlaces públicos.`);
  const urls = [
    ...new Set(
      [...(website ? [website] : []), ...(input.urls || [])]
        .filter((value) => value !== "")
        .map((value) => publicUrl(value).href),
    ),
  ];
  if (urls.length > MAX_URLS)
    fail(400, `Añade hasta ${MAX_URLS} URLs entre web y enlaces.`);
  if (!urls.length && !text)
    fail(400, "Añade tu web, un enlace público o contenido de tu empresa.");
  return { website: website ? publicUrl(website).href : "", urls, text };
}

function decodeEntities(value) {
  const entities = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    ntilde: "ñ",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    Ntilde: "Ñ",
    commat: "@",
    colon: ":",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== "#") return entities[entity] ?? match;
    const code = Number.parseInt(
      entity.slice(entity[1]?.toLowerCase() === "x" ? 2 : 1),
      entity[1]?.toLowerCase() === "x" ? 16 : 10,
    );
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : " ";
  });
}

function redactContactAddresses(value) {
  const labels =
    /(?<![\p{L}\p{N}_])(?:direcci[oó]n|address|domicilio)(?:[ \t]+(?:postal|particular|fiscal|de[ \t]+contacto))?[ \t]*[:：]\s*/giu;
  const boundaries =
    /[\r\n;；|!?。]|\.(?=\s|$)|[ \t]+[—–][ \t]+|(?<![\p{L}\p{N}_])(?:correo(?:[ \t]+electr[oó]nico)?|e-?mail|tel[eé]fono|m[oó]vil|whatsapp|web(?:site)?|empresa|marca|servicios?|sector|industria|horario|descripci[oó]n|direcci[oó]n|address|domicilio)(?:[ \t]+(?:postal|particular|fiscal|de[ \t]+contacto))?[ \t]*[:：]/giu;
  const abbreviation =
    /(?<![\p{L}\p{N}_])(?:av|avda|ave|avd|c|cl|cra|cr|ctra|pje|pza|col|urb|edif|dpto|dto|apto|apt|depto|no|nro|n[uú]m|st|rd|blvd|dr|ln|ste|p)\.$/iu;
  let result = "";
  let cursor = 0;
  for (const label of value.matchAll(labels)) {
    if (label.index < cursor) continue;
    const start = label.index + label[0].length;
    let end = value.length;
    boundaries.lastIndex = start;
    for (let boundary; (boundary = boundaries.exec(value));) {
      // Street/unit abbreviations belong to the address; a sentence after it does not.
      if (
        boundary[0] === "." &&
        abbreviation.test(value.slice(start, boundary.index + 1))
      )
        continue;
      // A comma may wrap the city onto the following line, but not a new paragraph.
      if (
        /^[\r\n]$/.test(boundary[0]) &&
        /,\s*$/.test(value.slice(start, boundary.index)) &&
        !/^[\r\n]/.test(value.slice(boundary.index + 1))
      )
        continue;
      end = boundary.index;
      break;
    }
    while (end > start && /[ \t]/.test(value[end - 1])) end--;
    result += value.slice(cursor, label.index) + "[domicilio omitido]";
    if (end < value.length && /[\p{L}\p{N}]/u.test(value[end])) result += " ";
    cursor = end;
  }
  return result + value.slice(cursor);
}

function redact(value, max = 5_000) {
  return redactContactAddresses(decodeEntities(String(value)))
    .replace(/\b(?:mailto|tel):[^\s<>"']+/gi, "[contacto omitido]")
    .replace(
      /[\p{L}\d.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/gu,
      "[correo omitido]",
    )
    .replace(/(?:\+?\d[\d\s().-]{5,}\d)/g, (match) =>
      match.replace(/\D/g, "").length >= 7 ? "[teléfono omitido]" : match,
    )
    .replace(
      /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|t\.me)\/[^\s<>]+/gi,
      "[contacto omitido]",
    )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function plain(value) {
  return String(value)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|template|svg|iframe|form|nav|footer|address)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/<\/?(?:p|div|section|article|h[1-6]|li|br)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(
    /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  ))
    result[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4],
    );
  return result;
}

function readHtml(html) {
  const meta = {};
  for (const match of html.matchAll(/<meta\b[^>]{0,5000}>/gi)) {
    const attr = attributes(match[0]);
    const key = (attr.property || attr.name || "").toLowerCase();
    if (
      attr.content &&
      ["og:site_name", "og:title", "og:description", "description"].includes(
        key,
      )
    )
      meta[key] = redact(plain(attr.content), 1_000);
  }
  const title = redact(
    plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
    200,
  );
  const text = redact(plain(html), 8_000);
  const language =
    attributes(html.match(/<html\b[^>]*>/i)?.[0] || "").lang || "";
  return {
    title: meta["og:title"] || title,
    name: meta["og:site_name"] || title.split(/\s[|–—-]\s/)[0],
    description: meta["og:description"] || meta.description || "",
    text,
    language,
  };
}

function platformOf(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const [domain, platform] of [
    ["instagram.com", "instagram"],
    ["linkedin.com", "linkedin"],
    ["tiktok.com", "tiktok"],
    ["youtube.com", "youtube"],
    ["youtu.be", "youtube"],
    ["facebook.com", "facebook"],
    ["fb.com", "facebook"],
    ["x.com", "x"],
    ["twitter.com", "x"],
    ["threads.net", "threads"],
    ["threads.com", "threads"],
    ["pinterest.com", "pinterest"],
    ["reddit.com", "reddit"],
    ["snapchat.com", "snapchat"],
    ["discord.com", "discord"],
    ["t.me", "telegram"],
    ["telegram.me", "telegram"],
  ])
    if (host === domain || host.endsWith(`.${domain}`)) return platform;
  return "website";
}

function blockedPage(document) {
  return (
    /(?:sign\s*in|log\s*in|iniciar sesi[oó]n|acceso denegado|access denied|just a moment|verify you are human|security check|attention required)/i.test(
      document.title,
    ) ||
    (document.text.length < 1_000 &&
      /(?:captcha|verify (?:that )?you are human|enable javascript|habilita javascript|checking your browser|cloudflare ray id)/i.test(
        document.text,
      ))
  );
}

async function inspectUrl(value, { fetcher, lookup }) {
  const url = new URL(value);
  const platform = platformOf(url);
  const evidence = {
    id: randomUUID(),
    url: url.href,
    title: url.hostname.replace(/^www\./, ""),
    excerpt: "",
    status: "linked",
    platform,
  };
  if (platform !== "website")
    return {
      evidence: {
        ...evidence,
        reason:
          "Enlace guardado. No se ha leído este perfil ni su audiencia; aporta contenido propio para incorporarlo al contexto.",
      },
    };
  const policy = webAccessPolicy(url.href, "website");
  if (!policy.allowed)
    return { evidence: { ...evidence, reason: policy.reason } };
  if (
    /\/(?:login|signin|sign-in|auth|oauth|accounts?|dashboard|admin|wp-admin|iniciar-sesion)(?:\/|$)/i.test(
      url.pathname,
    )
  )
    return {
      evidence: {
        ...evidence,
        reason:
          "Esta ruta requiere o gestiona acceso. Añade una página pública o pega contenido propio.",
      },
    };
  try {
    // Validation is explicit so a future alternative fetcher cannot bypass SSRF protection.
    await validatePublicUrl(url.href, lookup ? { lookup } : {});
    const response = await fetcher(url.href, {
      policyPurpose: "website",
      timeout: 8_000,
      maxBytes: MAX_BYTES,
      maxRedirects: 2,
      headers: { accept: "text/html, text/plain;q=0.9" },
      validateRedirect(destination) {
        const target = publicUrl(
          destination instanceof URL ? destination.href : destination,
        );
        assertWebReadAllowed(target.href, "website");
        if (
          platformOf(target) !== "website" ||
          /\/(?:login|signin|sign-in|auth|oauth|accounts?|dashboard|admin|wp-admin|iniciar-sesion)(?:\/|$)/i.test(
            target.pathname,
          )
        )
          fail(
            400,
            "La página redirige a una red social o acceso restringido; aporta contenido propio.",
          );
      },
    });
    if (!response.ok)
      return {
        evidence: {
          ...evidence,
          status: "failed",
          reason: [401, 403, 429].includes(response.status)
            ? "El sitio restringe el acceso público. No intentamos eludirlo; pega contenido que puedas compartir."
            : `El sitio respondió HTTP ${response.status}. Revisa el enlace o aporta el texto.`,
        },
      };
    const contentType = response.headers.get("content-type") || "";
    if (
      !/^(?:text\/(?:html|plain)|application\/xhtml\+xml)(?:;|$)/i.test(
        contentType,
      )
    )
      return {
        evidence: {
          ...evidence,
          status: "failed",
          reason:
            "Este formato no se puede leer aquí. Usa una página HTML pública o pega su texto.",
        },
      };
    const raw = await response.text();
    if (Buffer.byteLength(raw) > MAX_BYTES)
      return {
        evidence: {
          ...evidence,
          status: "failed",
          reason:
            "La página supera el tamaño de lectura. Aporta una página más breve o su texto.",
        },
      };
    const document = /(?:html|xhtml)/i.test(contentType)
      ? readHtml(raw)
      : {
          title: evidence.title,
          name: "",
          description: "",
          text: redact(raw, 8_000),
          language: "",
        };
    if (blockedPage(document))
      return {
        evidence: {
          ...evidence,
          status: "failed",
          reason:
            "La página muestra una barrera de acceso o verificación. No se ha importado su contenido.",
        },
      };
    if (document.text.length < 60 && document.description.length < 40)
      return {
        evidence: {
          ...evidence,
          status: "failed",
          reason:
            "No encontramos suficiente contenido público legible. Prueba otra página o pega una descripción.",
        },
      };
    return {
      evidence: {
        ...evidence,
        title: document.title || evidence.title,
        excerpt: redact(
          [document.description, document.text].filter(Boolean).join(" "),
          2_000,
        ),
        status: "read",
        permissionUrls: response.accessTrail || [url.href],
      },
      document,
    };
  } catch {
    return {
      evidence: {
        ...evidence,
        status: "failed",
        reason:
          "No se pudo leer esta página de forma segura. Revisa que sea pública o aporta el texto; los demás enlaces se conservan.",
      },
    };
  }
}

const TOPICS = [
  {
    pattern:
      /\b(?:inteligencia artificial|artificial intelligence|generative ai|ia generativa|automatiza\w*|machine learning|chatgpt|\bIA\b)\b/iu,
    pillar: "Aplicación de inteligencia artificial",
  },
  {
    pattern: /\b(?:ventas|sales|comercial\w*|crm|revenue)\b/iu,
    pillar: "Ventas y crecimiento comercial",
    segment: {
      name: "Equipos comerciales",
      role: "Ventas y dirección comercial",
      needs: "Encontrar prácticas para mejorar ventas y procesos comerciales.",
    },
  },
  {
    pattern:
      /\b(?:educaci[oó]n|educativo\w*|edtech|aprendizaje|formaci[oó]n|cursos?|education|learning)\b/iu,
    pillar: "Formación y aprendizaje",
    segment: {
      name: "Responsables de formación",
      role: "Formación y gestión educativa",
      needs:
        "Evaluar soluciones y contenidos aplicables al aprendizaje de sus equipos o estudiantes.",
    },
  },
  {
    // Medical word families exclude medición/mediciones (measurement).
    pattern:
      /\b(?:salud|healthtech|hospital\w*|m[eé]dic(?:[oa]s?|in\w*|ament\w*|al\w*|aci[oó]n(?:es)?|at\w*)|healthcare)\b/iu,
    pillar: "Innovación en salud",
    segment: {
      name: "Equipos de gestión en salud",
      role: "Dirección y operaciones en salud",
      needs:
        "Identificar prácticas y soluciones pertinentes para organizaciones de salud.",
    },
  },
  {
    pattern: /\b(?:marketing|contenido|comunicaci[oó]n|social media)\b/iu,
    pillar: "Marketing y contenido",
    segment: {
      name: "Equipos de marketing",
      role: "Marketing y comunicación",
      needs:
        "Decidir qué contenido crear y cómo comunicar el valor de su empresa.",
    },
  },
  {
    pattern:
      /\b(?:operaciones|productividad|procesos|operations|productivity)\b/iu,
    pillar: "Procesos y productividad",
    segment: {
      name: "Responsables de operaciones",
      role: "Operaciones y dirección de equipos",
      needs: "Mejorar procesos y evaluar oportunidades de productividad.",
    },
  },
  {
    pattern: /\b(?:finanzas|financiero\w*|fintech|finance|banking)\b/iu,
    pillar: "Finanzas y tecnología",
  },
  {
    pattern: /\b(?:ecommerce|e-commerce|retail|tienda|comercio)\b/iu,
    pillar: "Comercio y experiencia del cliente",
  },
];

function statedAudience(text) {
  // Keep a clearly declared target group more specific than a topic match.
  // This is supplied company context, never an observed consumer profile.
  const proposed = text.match(
    /(?:^|[.!?]\s+)audiencia editorial propuesta\s*:\s*([^.!?]{2,500})(?=[.!?]|$)/iu,
  );
  if (proposed) {
    const interest = proposed[1]
      .trim()
      .match(/^(.{2,160}?)\s+interesad[oa]s?\s+en\s+(.{3,400})$/iu);
    const name = redact(interest?.[1] || proposed[1], 120);
    return {
      name,
      role: name,
      needs: interest
        ? redact(interest[2], 400)
        : "Validar qué contenido resulta útil para este grupo propuesto.",
    };
  }
  const match = text.match(
    /(?:^|[.!?]\s+)(?:ayudamos|acompañamos|apoyamos)\s+a\s+([^.!?]{2,160}?)\s+que\s+necesita(?:n)?\s+([^.!?]{3,400})(?=[.!?]|$)/iu,
  );
  if (!match) return null;
  const name = redact(match[1], 120);
  return { name, role: name, needs: redact(match[2], 400) };
}

function makeDraft(input, results) {
  const documents = results.map((item) => item.document).filter(Boolean);
  const corpus = redact(
    [
      input.text,
      ...documents.flatMap((item) => [item.description, item.text]),
    ].join(" "),
    40_000,
  );
  const topics = TOPICS.filter((item) => item.pattern.test(corpus));
  const declaredAudience = statedAudience(input.text);
  const segments = declaredAudience
    ? [declaredAudience]
    : topics
        .filter((item) => item.segment)
        .slice(0, 3)
        .map((item) => item.segment);
  const audience = segments.map((segment) => ({
    id: randomUUID(),
    ...segment,
    stage: "Por confirmar",
    description:
      "Hipótesis sugerida a partir del contenido de la empresa. Requiere validación del equipo; no procede de perfiles de consumidores.",
  }));
  if (!audience.length && topics[0]?.pillar === TOPICS[0].pillar)
    audience.push({
      id: randomUUID(),
      name: "Líderes que evalúan IA",
      role: "Dirección y gestión de equipos",
      stage: "Por confirmar",
      needs:
        "Entender aplicaciones de IA y evaluar su utilidad para la empresa.",
      description:
        "Hipótesis editorial por validar; no representa una audiencia observada.",
    });
  let name = documents.find((item) => item.name)?.name || "";
  if (!name && input.text) {
    const firstLine =
      input.firstLine ||
      input.text
        .split(/\r?\n/)
        .find((line) => line.trim())
        ?.trim() ||
      "";
    name =
      firstLine.match(
        /^(?:empresa|marca|compañ[ií]a)\s*:\s*(.{2,120})$/iu,
      )?.[1] ||
      (firstLine.length <= 65 && !/[.!?]/.test(firstLine) ? firstLine : "");
  }
  if (
    !name &&
    input.website &&
    platformOf(new URL(input.website)) === "website"
  )
    name = new URL(input.website).hostname.replace(/^www\./, "").split(".")[0];
  const languageTag = documents.find((item) => item.language)?.language || "";
  const spanish = (
    corpus.match(
      /\b(?:para|empresa|equipo|aprendizaje|ventas|nuestra|nuestro|servicios|somos|con|que)\b/gi,
    ) || []
  ).length;
  const english = (
    corpus.match(
      /\b(?:the|for|your|our|with|company|team|services|we|learning)\b/gi,
    ) || []
  ).length;
  let industry = "";
  if (
    /educaci[oó]n|edtech|education|learning|formaci[oó]n|cursos?/iu.test(corpus)
  )
    industry = "Educación y formación";
  else if (/salud|healthtech|healthcare|hospital/iu.test(corpus))
    industry = "Salud";
  else if (/fintech|finanzas|finance|banking/iu.test(corpus))
    industry = "Finanzas";
  else if (/ecommerce|e-commerce|retail|comercio/iu.test(corpus))
    industry = "Comercio";
  else if (TOPICS[0].pattern.test(corpus))
    industry = "Tecnología e inteligencia artificial";
  else if (/marketing|comunicaci[oó]n/iu.test(corpus))
    industry = "Marketing y comunicación";
  return {
    name: redact(name, 120),
    industry,
    description: redact(
      documents.find((item) => item.description)?.description ||
        input.text ||
        documents[0]?.text ||
        "",
      2_000,
    ),
    website:
      input.website ||
      results.find(
        (item) =>
          item.evidence.platform === "website" &&
          item.evidence.status === "read",
      )?.evidence.url ||
      "",
    market: /latinoam[eé]rica|am[eé]rica latina|\blatam\b/iu.test(corpus)
      ? "Latinoamérica"
      : "",
    language:
      /^es(?:-|$)/i.test(languageTag) || (spanish > english && spanish > 1)
        ? "Español"
        : /^en(?:-|$)/i.test(languageTag) || (english > spanish && english > 1)
          ? "Inglés"
          : "",
    tone: corpus ? "Claro, cercano y práctico" : "",
    pillars: topics.map((item) => item.pillar).slice(0, 6),
    audience,
  };
}

export async function inspectCompany(
  input,
  { fetcher = safeFetch, lookup, now = Date.now } = {},
) {
  const validated = validateInput(input);
  const results = [];
  // Two concurrent pages bound origin load and keep imports responsive.
  for (let offset = 0; offset < validated.urls.length; offset += 2) {
    results.push(
      ...(await Promise.all(
        validated.urls
          .slice(offset, offset + 2)
          .map((url) => inspectUrl(url, { fetcher, lookup })),
      )),
    );
  }
  const evidence = results.map((item) => item.evidence);
  if (validated.text)
    evidence.push({
      id: randomUUID(),
      title: "Contenido aportado por tu equipo",
      excerpt: redact(plain(validated.text), 2_000),
      status: "provided",
      platform: "provided",
      reason: "Texto aportado por el equipo; no se ha verificado externamente.",
    });
  const warnings = [INFERENCE_NOTICE];
  if (evidence.some((item) => item.status === "linked"))
    warnings.push(
      "Los enlaces marcados como guardados no se han usado para inferir contenido ni audiencia.",
    );
  if (evidence.some((item) => item.status === "failed"))
    warnings.push(
      "Algunas páginas no pudieron leerse. Puedes continuar con lo disponible y completar el contexto con texto propio.",
    );
  if (!evidence.some((item) => ["read", "provided"].includes(item.status)))
    warnings.push(
      "Aún no hay contenido legible para sugerir tu propuesta o audiencia. Pega una descripción de tu empresa para continuar.",
    );
  const safeInput = {
    ...validated,
    text: redact(plain(validated.text), MAX_TEXT),
    firstLine: redact(
      plain(validated.text.split(/\r?\n/).find((line) => line.trim()) || ""),
      200,
    ),
  };
  return {
    id: randomUUID(),
    inspectedAt: new Date(
      typeof now === "function" ? now() : now,
    ).toISOString(),
    method: "heuristic",
    draft: makeDraft(safeInput, results),
    evidence,
    warnings,
  };
}

function publicInspection(record) {
  assertInspectionPermission(record);
  const { id, inspectedAt, method, draft, evidence, warnings } = record;
  const redactText = (value) =>
    typeof value === "string" ? redact(value, Infinity) : value;
  const redactFields = (item, fields) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.entries(item).map(([key, value]) => [
        key,
        fields.includes(key) ? redactText(value) : value,
      ]),
    );
  };
  // Older imports also need safe responses; preserve the stored evidence and IDs.
  return {
    id,
    inspectedAt,
    method,
    draft: redactFields(draft, ["description"]),
    evidence: Array.isArray(evidence)
      ? evidence.map((item) =>
          redactFields(item, ["title", "excerpt", "reason", "error"]),
        )
      : evidence,
    warnings: Array.isArray(warnings) ? warnings.map(redactText) : warnings,
  };
}

function inspectionPermissionAllowed(record) {
  return (record.evidence || []).every(
    (item) =>
      item.status !== "read" ||
      (item.permissionUrls || [item.url]).every(
        (url) => webAccessPolicy(url, "website").allowed,
      ),
  );
}
function assertInspectionPermission(record) {
  if (!inspectionPermissionAllowed(record))
    fail(
      403,
      "El permiso de una web de esta inspección ha caducado o fue retirado. Aporta contenido propio o solicita una nueva revisión.",
    );
}

function currentOwner(req) {
  const membership = db
    .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
    .get(req.params.brandId, req.user.id);
  if (!membership || !getBrand(req.params.brandId))
    fail(404, "No se encontró la marca.");
  if (membership.role !== "owner")
    fail(403, "Solo el propietario puede realizar esta acción.");
}

export function createCompanyContextRouter({
  fetcher = safeFetch,
  lookup,
  now = Date.now,
} = {}) {
  const router = express.Router();
  const cache = new Map();
  const pending = new Map();
  const clock = () => (typeof now === "function" ? now() : now);
  function prune() {
    for (const [id, item] of cache)
      if (item.expiresAt <= clock()) cache.delete(id);
    while (cache.size >= 1_000) cache.delete(cache.keys().next().value);
  }
  async function inspectForUser(userId, input) {
    const validated = validateInput(input);
    const key = `${userId}:${createHash("sha256")
      .update(
        JSON.stringify({
          validated,
          permissions: validated.urls.map((url) =>
            webAccessPolicy(url, "website"),
          ),
        }),
      )
      .digest("hex")}`;
    prune();
    const existing = [...cache.values()].find((item) => item.key === key);
    if (existing && inspectionPermissionAllowed(existing.inspection))
      return existing.inspection;
    if (pending.has(key)) return pending.get(key);
    if (
      [...pending.keys()].filter((id) => id.startsWith(`${userId}:`)).length >=
        2 ||
      pending.size >= 25
    )
      fail(
        429,
        "Ya hay inspecciones en curso. Espera un momento y vuelve a intentarlo.",
      );
    const operation = inspectCompany(input, {
      fetcher,
      lookup,
      now: clock,
    }).then((inspection) => {
      prune();
      const own = [...cache.entries()].filter(
        ([, item]) => item.userId === userId,
      );
      if (own.length >= 10) cache.delete(own[0][0]);
      cache.set(inspection.id, {
        userId,
        key,
        inspection,
        expiresAt: clock() + CACHE_TTL,
      });
      return inspection;
    });
    pending.set(key, operation);
    try {
      return await operation;
    } finally {
      pending.delete(key);
    }
  }
  function persist(req, inspection) {
    assertInspectionPermission(inspection);
    currentOwner(req);
    const saved = saveRecord(req.params.brandId, "contextImports", inspection);
    addActivity(
      req.params.brandId,
      "Se añadió contexto de empresa. Las sugerencias requieren revisión del equipo.",
    );
    return publicInspection(saved);
  }

  router.post("/context/inspect", requireAuth, async (req, res) =>
    res.json(await inspectForUser(req.user.id, req.body)),
  );
  router.use("/brands/:brandId/context", requireAuth, requireBrand);
  router.get("/brands/:brandId/context", (req, res) =>
    res.json({
      imports: listRecords(req.params.brandId, "contextImports").map(
        publicInspection,
      ),
    }),
  );
  router.post("/brands/:brandId/context/commit", requireOwner, (req, res) => {
    const id = inputText(req.body?.inspectionId, "La inspección", 100);
    prune();
    const item = cache.get(id);
    if (!item || item.userId !== req.user.id)
      fail(
        404,
        "La inspección ya no está disponible. Vuelve a inspeccionar tu empresa y conserva los datos que revisaste.",
      );
    const saved = persist(req, item.inspection);
    cache.delete(id);
    res.status(201).json({ import: saved });
  });
  router.post(
    "/brands/:brandId/context/import",
    requireOwner,
    async (req, res) => {
      const inspection = await inspectForUser(req.user.id, req.body);
      const saved = persist(req, inspection);
      cache.delete(inspection.id);
      res.status(201).json(saved);
    },
  );
  router.delete("/brands/:brandId/context/:id", requireOwner, (req, res) => {
    if (!deleteRecord(req.params.brandId, "contextImports", req.params.id))
      fail(404, "No se encontró esta importación en la empresa.");
    res.json({ ok: true });
  });
  return router;
}
