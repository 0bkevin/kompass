import { publicPublicationReceipt } from "./publication-receipt.mjs";
import express from "express";
import multer from "multer";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  db,
  UPLOAD_DIR,
  getBrand,
  saveBrand,
  listRecords,
  getRecord,
  saveRecord,
  deleteRecord,
  addActivity,
  publicIntegrations,
  getSecret,
} from "./db.mjs";
import {
  resolveUser,
  publicUser,
  hashPassword,
  verifyPassword,
  createUser,
  issueSession,
  clearSession,
  authRateLimit,
  tokenHash,
} from "./auth.mjs";
import { canonicalSocialSourceUrl } from "./social-providers.mjs";
import { PIECE_LIMITS } from "./piece-contract.mjs";
import { publicCitationUrl } from "./public-citation-url.mjs";
import { assertPublicContentText } from "./content-privacy.mjs";
import {
  assertSourceCollectionAllowed,
  sourceAccessPolicy,
  publicAccessPolicies,
  referenceUsePolicy,
} from "./access-policy.mjs";
import {
  deduplicateReferences,
  referenceIdentity,
} from "./reference-identity.mjs";
import {
  filenameAwareUpload,
  cleanUploadName,
  encodedDownloadName,
} from "./upload-filenames.mjs";

function pieceApprovalContent(piece) {
  return {
    title: piece.title ?? "",
    hook: piece.hook ?? "",
    script: piece.script ?? "",
    caption: piece.caption ?? "",
    cta: piece.cta ?? "",
    format: piece.format ?? "post",
    channel: piece.channel ?? "linkedin",
    segmentId: piece.segmentId ?? null,
    assignee: piece.assignee ?? null,
    assetIds: piece.assetIds ?? [],
    scenes: (piece.scenes ?? []).map((scene) => ({
      id: scene.id ?? "",
      text: scene.text ?? "",
      duration: scene.duration ?? 5,
      assetId: scene.assetId ?? null,
    })),
    referenceId: piece.referenceId ?? null,
    ideaId: piece.ideaId ?? null,
  };
}

export function publicPiece(piece) {
  if (!piece) return piece;
  const approvalVersion = createHash("sha256")
    .update(JSON.stringify(pieceApprovalContent(piece)))
    .digest("base64url");
  return {
    ...piece,
    ...(piece.publicationReceipt
      ? {
          publicationReceipt: publicPublicationReceipt(
            piece.publicationReceipt,
          ),
        }
      : {}),
    approvalVersion,
  };
}

function approvalConflict() {
  fail(
    409,
    "La pieza cambió desde que la revisaste. Actualiza y revisa la versión actual antes de aprobar.",
  );
}

function requireApprovalVersion(piece, expectedApprovalVersion) {
  if (
    typeof expectedApprovalVersion !== "string" ||
    expectedApprovalVersion !== publicPiece(piece).approvalVersion
  )
    approvalConflict();
}

function requireEditVersion(piece, expectedEditVersion) {
  if (
    typeof expectedEditVersion !== "string" ||
    expectedEditVersion !== publicPiece(piece).approvalVersion
  )
    fail(
      409,
      "La pieza cambió mientras la editabas. Conservamos tus cambios locales; compara o expórtalos antes de cargar la versión actual.",
    );
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "Envía un objeto JSON válido.");
  return value;
}
function text(value, label, max = 2000, required = false) {
  if (value === undefined || value === null) {
    if (required) fail(400, `${label} es obligatorio.`);
    return "";
  }
  if (typeof value !== "string") fail(400, `${label} debe ser texto.`);
  const output = value.trim();
  if ((required && !output) || output.length > max)
    fail(400, `${label}: longitud inválida (máximo ${max}).`);
  return output;
}
function options(value, allowed, label) {
  if (!allowed.includes(value)) fail(400, `${label} no es válido.`);
  return value;
}
function stringArray(value, label, maxItems = 30) {
  if (!Array.isArray(value) || value.length > maxItems)
    fail(400, `${label} debe ser una lista de hasta ${maxItems} elementos.`);
  return [...new Set(value.map((item) => text(item, label, 300, true)))];
}
function number(value, label, min = 0, max = 1000000000) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(400, `${label} debe estar entre ${min} y ${max}.`);
  return value;
}
function url(value, label = "URL") {
  const result = text(value, label, 3000);
  if (result) {
    let parsed;
    try {
      parsed = new URL(result);
    } catch {
      fail(400, `${label} no es válida.`);
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      fail(400, `${label} debe usar http o https sin credenciales.`);
  }
  return result;
}
function assertRecord(brandId, kind, id, label) {
  if (!getRecord(brandId, kind, id))
    fail(400, `${label || "Registro"} no pertenece a esta marca.`);
  return id;
}
function assertSegment(brand, id) {
  if (id && !brand.audience.some((item) => item.id === id))
    fail(400, "El segmento no pertenece a esta marca.");
  return id || undefined;
}
function isOwner(req) {
  return req.membership.role === "owner";
}
export function requireAuth(req, res, next) {
  req.user = publicUser(resolveUser(req));
  if (!req.user)
    return res.status(401).json({ error: "Inicia sesión para continuar." });
  next();
}
export function requireBrand(req, res, next) {
  const id = req.params.brandId;
  const membership = db
    .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
    .get(id, req.user.id);
  if (!membership)
    return res.status(404).json({ error: "No se encontró la marca." });
  req.brand = getBrand(id);
  if (!req.brand)
    return res.status(404).json({ error: "No se encontró la marca." });
  req.membership = { ...membership, brandId: id, userId: req.user.id };
  next();
}
export function requireEditor(req, res, next) {
  if (!["owner", "editor"].includes(req.membership.role))
    return res.status(403).json({ error: "Necesitas permisos de edición." });
  next();
}
export function requireOwner(req, res, next) {
  if (!isOwner(req))
    return res
      .status(403)
      .json({ error: "Solo el propietario puede realizar esta acción." });
  next();
}
export function publicAsset(asset) {
  if (!asset) return asset;
  const { storageName, filePath, path: internalPath, ...safe } = asset;
  return safe;
}
export function publicSource(source) {
  const accessPolicy = sourceAccessPolicy(source);
  return {
    ...source,
    enabled: !!source.enabled && accessPolicy.allowed,
    accessPolicy,
  };
}
export function publicReference(reference, context) {
  if (!reference) return reference;
  const { mediaUrl: _privateMediaUrl, ...safe } = reference;
  delete safe.originalUrlOmitted;
  if (safe.url) {
    try {
      publicCitationUrl(safe.url, "URL");
    } catch {
      // Preserve the historical record; do not offer an inadmissible original
      // as a public citation in the inbox, detail or workspace readback.
      delete safe.url;
      safe.originalUrlOmitted = true;
    }
  }
  const policy = referenceUsePolicy(
    reference,
    context && typeof context === "object" ? context.source : undefined,
  );
  if (!policy.allowed)
    return {
      id: safe.id,
      title: "Referencia con acceso restringido",
      source: "Acceso restringido",
      url: safe.url,
      format: "post",
      status: safe.status || "new",
      createdAt: safe.createdAt,
      accessPolicy: policy,
    };
  return safe;
}
export function brandState(brandId, userId) {
  const membership = db
    .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
    .get(brandId, userId);
  if (!membership) fail(404, "No se encontró la marca.");
  return {
    brand: { ...getBrand(brandId), role: membership.role },
    references: listRecords(brandId, "references").map((reference) =>
      publicReference(reference, {
        source:
          reference.sourceId &&
          getRecord(brandId, "sources", reference.sourceId),
      }),
    ),
    ideas: listRecords(brandId, "ideas"),
    pieces: listRecords(brandId, "pieces").map(publicPiece),
    assets: listRecords(brandId, "assets").map(publicAsset),
    sources: listRecords(brandId, "sources").map(publicSource),
    accessPolicies: publicAccessPolicies(),
    members: db
      .prepare(
        "SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.brand_id=? ORDER BY u.name",
      )
      .all(brandId),
    activity: db
      .prepare(
        "SELECT id,text,created_at AS createdAt FROM activity WHERE brand_id=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(brandId),
    integrations: publicIntegrations(brandId),
  };
}
function session(user) {
  return {
    user: publicUser(user),
    brands: user
      ? db
          .prepare(
            "SELECT b.data,m.role FROM brands b JOIN members m ON m.brand_id=b.id WHERE m.user_id=? ORDER BY b.rowid DESC",
          )
          .all(user.id)
          .map((row) => ({ ...JSON.parse(row.data), role: row.role }))
      : [],
  };
}
function credentials(body, register = false) {
  object(body);
  const email = text(body.email, "Correo", 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, "Ingresa un correo válido.");
  const password = text(body.password, "Contraseña", 256, true);
  if (register && password.length < 10)
    fail(400, "La contraseña debe tener al menos 10 caracteres.");
  return {
    email,
    password,
    ...(register ? { name: text(body.name, "Nombre", 100, true) } : {}),
  };
}
function brandInput(body, current = {}) {
  object(body);
  const result = { ...current };
  for (const [key, fallback, max] of [
    ["name", "", 120],
    ["industry", "", 150],
    ["description", "", 10000],
    ["tone", "Claro, cercano y práctico", 2000],
    ["language", "Español", 100],
    ["market", "Latinoamérica", 150],
  ])
    result[key] = text(
      body[key] ?? current[key] ?? fallback,
      key,
      max,
      key === "name",
    );
  result.website = url(body.website ?? current.website ?? "");
  for (const [key, fallback] of [
    ["color", "#c4f168"],
    ["secondaryColor", "#161b17"],
  ]) {
    const color = body[key] ?? current[key] ?? fallback;
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))
      fail(400, `${key} debe ser un color hexadecimal de seis dígitos.`);
    result[key] = color;
  }
  result.goals = stringArray(
    body.goals ?? current.goals ?? ["Generar contenido relevante y útil"],
    "Objetivos",
  );
  result.pillars = stringArray(
    body.pillars ?? current.pillars ?? [],
    "Pilares",
  );
  result.weeklyTarget = number(
    body.weeklyTarget ?? current.weeklyTarget ?? 3,
    "Meta semanal",
    1,
    50,
  );
  if (!Number.isInteger(result.weeklyTarget))
    fail(400, "La meta semanal debe ser un número entero.");
  const audiences = body.audience ?? current.audience ?? [];
  if (!Array.isArray(audiences) || audiences.length > 30)
    fail(400, "La marca admite hasta 30 segmentos.");
  result.audience = audiences.map((audience) => {
    object(audience);
    const previous = (current.audience || []).find(
      (segment) => segment.id === audience.id,
    );
    // Keep untouched legacy profiles usable while requiring complete new edits.
    const changed =
      !previous ||
      ["name", "role", "stage", "needs", "description"].some(
        (key) => (audience[key] ?? "") !== (previous[key] ?? ""),
      );
    const role = text(audience.role, "Rol", 300);
    const needs = text(audience.needs, "Necesidades", 3000);
    if (changed && !role)
      fail(
        400,
        "El rol o responsabilidad es obligatorio. Escribe texto, no solo espacios.",
      );
    if (changed && !needs)
      fail(
        400,
        "Las necesidades e intereses son obligatorias. Escribe texto, no solo espacios.",
      );
    return {
      id: audience.id
        ? text(audience.id, "ID segmento", 100, true)
        : randomUUID(),
      name: text(audience.name, "Nombre segmento", 150, true),
      role,
      stage: text(audience.stage, "Etapa", 300),
      needs,
      description: text(audience.description, "Descripción", 3000),
    };
  });
  if (
    new Set(result.audience.map((item) => item.id)).size !==
    result.audience.length
  )
    fail(400, "Los segmentos deben tener identificadores distintos.");
  if (body.logoAssetId !== undefined) {
    if (body.logoAssetId === "" || body.logoAssetId === null)
      delete result.logoAssetId;
    else {
      const logo = getRecord(
        current.id,
        "assets",
        text(body.logoAssetId, "Logo", 100, true),
      );
      if (!logo || logo.type !== "image")
        fail(400, "El logo debe ser una imagen de esta marca.");
      result.logoAssetId = logo.id;
    }
  }
  return result;
}
function defaults(brandId) {
  const market = getBrand(brandId)
    .market.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const countries = {
    mexico: "MX",
    colombia: "CO",
    argentina: "AR",
    chile: "CL",
    peru: "PE",
    espana: "ES",
    spain: "ES",
    brasil: "BR",
    brazil: "BR",
    venezuela: "VE",
    "estados unidos": "US",
    "united states": "US",
  };
  const geo = countries[market];
  const sources = [
    {
      name: "Noticias globales · GDELT",
      type: "gdelt",
      query: "",
      enabled: true,
    },
    {
      name: "Hacker News · tecnología",
      type: "hackernews",
      query: "",
      enabled: true,
    },
    {
      name: "Hacker News · RSS oficial",
      type: "rss",
      url: "https://news.ycombinator.com/rss",
      enabled: true,
    },
    {
      name: "Google Trends · Estados Unidos",
      type: "rss",
      url: "https://trends.google.com/trending/rss?geo=US",
      enabled: true,
    },
    ...(geo && geo !== "US"
      ? [
          {
            name: `Google Trends · ${geo}`,
            type: "rss",
            url: `https://trends.google.com/trending/rss?geo=${geo}`,
            enabled: true,
          },
        ]
      : []),
  ];
  for (const source of sources) saveRecord(brandId, "sources", source);
}
function referenceInput(body, current, req) {
  const result = { ...current };
  for (const field of ["title", "text"])
    if (typeof body[field] === "string")
      assertPublicContentText(body[field], "Referencia");
  if (
    current.id &&
    !referenceUsePolicy(
      current,
      current.sourceId && getRecord(req.brand.id, "sources", current.sourceId),
    ).allowed
  )
    result.ingestionRestricted = true;
  for (const key of ["title", "text", "language", "market", "format"])
    if (body[key] !== undefined)
      result[key] = text(body[key], key, key === "text" ? 30000 : 500);
  if (body.source !== undefined) {
    const label = text(body.source, "source", 100);
    const reservedProviderLabel =
      /^(?:youtube(?:\s+data\s+api)?|apify)(?:\b|\s|[·:])/i.test(label);
    result.source = reservedProviderLabel
      ? current.id && current.source === label
        ? current.source
        : "manual"
      : label || "manual";
  } else if (!current.id) result.source = "manual";
  if (body.url !== undefined)
    result.url = publicCitationUrl(text(body.url, "URL", 3000), "URL") || "";
  if (body.tags !== undefined)
    result.tags = stringArray(body.tags, "Etiquetas");
  if (body.assetId !== undefined)
    result.assetId = body.assetId
      ? assertRecord(
          req.brand.id,
          "assets",
          text(body.assetId, "Asset", 100, true),
          "Asset",
        )
      : undefined;
  if (body.status !== undefined) {
    options(body.status, ["new", "analyzed", "saved", "dismissed"], "Estado");
    if (body.status === "analyzed" && !current.analysis)
      fail(400, "Analiza la referencia antes de marcarla como analizada.");
    result.status = body.status;
  }
  result.title ||=
    result.text?.slice(0, 100) || result.url || "Referencia adjunta";
  const contentChanged =
    current.id &&
    ["title", "text", "url", "assetId"].some(
      (key) =>
        body[key] !== undefined &&
        JSON.stringify(result[key]) !== JSON.stringify(current[key]),
    );
  if (contentChanged) {
    delete result.analysis;
    delete result.brandRelevance;
    for (const key of [
      "videoAnalysis",
      "analysisCoverage",
      "contentScope",
      "platform",
      "videoId",
      "thumbnailUrl",
      "duration",
      "durationSeconds",
      "mediaUrl",
      "mediaAccess",
      "mediaProvider",
      "mediaExpiresAt",
    ])
      delete result[key];
    result.status = body.status === "dismissed" ? "dismissed" : "new";
  }
  if (current.id && body.url !== undefined && result.url !== current.url) {
    for (const key of [
      "trend",
      "trendHistory",
      "metrics",
      "evidence",
      "externalId",
      "sourceId",
      "sourceUrl",
      "publishedAt",
      "firstSeenAt",
      "officialTraffic",
      "officialRank",
      "signalType",
      "relatedUrls",
      "publisher",
      "author",
      "platform",
      "videoId",
      "thumbnailUrl",
      "duration",
      "durationSeconds",
      "mediaUrl",
      "mediaAccess",
      "mediaProvider",
      "mediaExpiresAt",
      "contentScope",
      "videoAnalysis",
      "analysisCoverage",
    ])
      delete result[key];
    if (body.source === undefined) result.source = "manual";
  }
  if (!result.url && !result.text && !result.assetId)
    fail(400, "Añade un enlace, texto o archivo a la referencia.");
  return {
    source: "manual",
    language: "Desconocido",
    market: "Sin definir",
    format: "post",
    status: "new",
    tags: [],
    ...result,
  };
}
function ideaInput(body, current, req) {
  const result = { ...current };
  for (const field of ["title", "angle"])
    if (typeof body[field] === "string")
      assertPublicContentText(body[field], "Idea");
  if (body.title !== undefined || !current.id)
    result.title = text(body.title, "Título", 300, true);
  if (body.angle !== undefined || !current.id)
    result.angle = text(body.angle, "Enfoque", 10000);
  if (body.referenceIds !== undefined)
    result.referenceIds = stringArray(body.referenceIds, "Referencias").map(
      (id) => assertRecord(req.brand.id, "references", id, "Referencia"),
    );
  if (body.segmentId !== undefined)
    result.segmentId = assertSegment(req.brand, body.segmentId);
  if (body.status !== undefined)
    result.status = options(
      body.status,
      ["proposed", "approved", "dismissed"],
      "Estado",
    );
  return { status: "proposed", referenceIds: [], ...result };
}
function assertPieceMutable(brandId, id) {
  const delivery = getSecret(brandId, `publication:${id}`);
  if (["sending", "uncertain"].includes(delivery?.status))
    fail(
      409,
      "La pieza tiene un envío pendiente de confirmar. Comprueba el destino antes de editarla o eliminarla.",
    );
}
function pieceText(value, key, current, max) {
  if (typeof value !== "string") return text(value, key, max, key === "title");
  if (current.id && value.length > max && value === current[key])
    return current[key];
  return text(value, key, max, key === "title");
}
function pieceInput(body, current, req) {
  if (current.id) assertPieceMutable(req.brand.id, current.id);
  for (const field of ["title", "hook", "script", "caption", "cta"])
    if (typeof body[field] === "string")
      assertPublicContentText(body[field], "Contenido");
  const result = { ...current };
  if (
    current.status === "published" &&
    Object.keys(body).some((key) => key !== "metrics")
  )
    fail(
      409,
      "Una pieza publicada solo admite actualizar sus resultados. Crea un borrador nuevo para editarla.",
    );
  for (const key of ["title", "hook", "script", "caption", "cta"])
    if (body[key] !== undefined || (!current.id && key === "title"))
      result[key] = pieceText(body[key], key, current, PIECE_LIMITS[key]);
  if (body.format !== undefined)
    result.format = options(
      body.format,
      ["reel", "carousel", "post", "video", "newsletter"],
      "Formato",
    );
  if (body.channel !== undefined)
    result.channel = options(
      body.channel,
      ["instagram", "linkedin", "tiktok", "youtube"],
      "Canal",
    );
  for (const [key, kind] of [
    ["referenceId", "references"],
    ["ideaId", "ideas"],
  ])
    if (body[key] !== undefined)
      result[key] = body[key]
        ? assertRecord(req.brand.id, kind, text(body[key], key, 100, true))
        : undefined;
  if (body.segmentId !== undefined)
    result.segmentId = assertSegment(req.brand, body.segmentId);
  if (body.assignee !== undefined) {
    const id = text(body.assignee, "Responsable", 100);
    if (
      id &&
      !db
        .prepare("SELECT 1 FROM members WHERE brand_id=? AND user_id=?")
        .get(req.brand.id, id)
    )
      fail(400, "El responsable no pertenece al equipo.");
    result.assignee = id || undefined;
  }
  if (body.assetIds !== undefined)
    result.assetIds = stringArray(body.assetIds, "Assets", 100).map((id) =>
      assertRecord(req.brand.id, "assets", id, "Asset"),
    );
  if (body.scenes !== undefined) {
    if (!Array.isArray(body.scenes) || body.scenes.length > PIECE_LIMITS.scenes)
      fail(400, `Máximo ${PIECE_LIMITS.scenes} escenas.`);
    result.scenes = body.scenes.map((scene) => {
      object(scene);
      if (typeof scene.text === "string")
        assertPublicContentText(scene.text, "Escena");
      return {
        id: text(scene.id || randomUUID(), "ID escena", 100, true),
        text: text(scene.text, "Escena", PIECE_LIMITS.sceneText),
        duration: number(scene.duration ?? 5, "Duración", 1, 60),
        ...(scene.assetId
          ? {
              assetId: assertRecord(
                req.brand.id,
                "assets",
                text(scene.assetId, "Asset", 100, true),
                "Asset",
              ),
            }
          : {}),
      };
    });
  }
  if (body.metrics !== undefined) {
    object(body.metrics);
    result.metrics = {
      views: number(body.metrics.views ?? 0, "Vistas"),
      engagement: number(body.metrics.engagement ?? 0, "Interacciones"),
      leads: number(body.metrics.leads ?? 0, "Leads"),
    };
  }
  const from = current.status || "draft";
  const to = body.status ?? from;
  options(
    to,
    ["draft", "review", "approved", "scheduled", "published"],
    "Estado",
  );
  if (to === "published" && from !== "published")
    fail(
      400,
      "Publica mediante un conector configurado; no se puede declarar publicada manualmente.",
    );
  const allowed = {
    draft: ["draft", "review"],
    review: ["review", "draft", "approved"],
    approved: ["approved", "draft", "review", "scheduled"],
    scheduled: ["scheduled", "approved", "draft", "review"],
    published: ["published"],
  };
  if (!allowed[from].includes(to))
    fail(
      409,
      `Transición inválida: ${from} → ${to}. Primero envía la pieza a revisión y apruébala.`,
    );
  if (to === "approved" && from === "review" && !isOwner(req))
    fail(
      403,
      "La aprobación requiere un propietario o revisor desde la acción de revisión.",
    );
  const approvalContentChanged =
    JSON.stringify(pieceApprovalContent(result)) !==
    JSON.stringify(pieceApprovalContent(current));
  if (
    approvalContentChanged &&
    ["approved", "scheduled"].includes(from) &&
    !["draft", "review"].includes(to)
  )
    fail(
      409,
      "Los cambios de contenido requieren volver a borrador o revisión para renovar la aprobación.",
    );
  if (body.scheduledFor !== undefined) {
    if (!body.scheduledFor) result.scheduledFor = undefined;
    else {
      const timestamp = Date.parse(body.scheduledFor);
      if (!Number.isFinite(timestamp))
        fail(400, "La fecha de programación no es válida.");
      result.scheduledFor = new Date(timestamp).toISOString();
    }
  }
  // A date only belongs to the active plan or retained publication history.
  // Invalidating approval must cancel scheduling even when a client omits null.
  if (!["scheduled", "published"].includes(to)) result.scheduledFor = undefined;
  if (
    to === "scheduled" &&
    (!result.scheduledFor || Date.parse(result.scheduledFor) <= Date.now())
  )
    fail(400, "Elige una fecha futura para programar la pieza.");
  result.status = to;
  return {
    title: "",
    hook: "",
    script: "",
    caption: "",
    cta: "",
    format: "post",
    channel: "linkedin",
    scenes: [],
    assetIds: [],
    comments: [],
    ...result,
  };
}
function sourceInput(body, current) {
  const result = { ...current };
  if (body.name !== undefined || !current.id)
    result.name = text(body.name, "Nombre fuente", 200, true);
  if (body.type !== undefined || !current.id)
    result.type = options(
      body.type,
      ["hackernews", "reddit", "rss", "gdelt", "youtube", "apify"],
      "Tipo de fuente",
    );
  const acceptsUrl = ["rss", "reddit", "youtube", "apify"].includes(
    result.type,
  );
  const queryKind = (type) =>
    type === "rss" ? null : type === "reddit" ? "community" : "topic";
  // Clear incompatible inherited values before applying the new input.
  // URLs identify different resources across connectors; subreddit selectors
  // are not topic queries, and RSS has no query field in its editor.
  if (!acceptsUrl || current.type !== result.type) delete result.url;
  if (
    !queryKind(result.type) ||
    queryKind(current.type) !== queryKind(result.type)
  )
    delete result.query;
  if (acceptsUrl && body.url !== undefined)
    result.url = url(body.url, "URL fuente");
  if (queryKind(result.type) && body.query !== undefined)
    result.query = text(body.query, "Consulta", 300);
  if (body.platform !== undefined)
    result.platform = options(
      body.platform,
      ["youtube", "instagram", "tiktok", "facebook", "x"],
      "Plataforma",
    );
  else if (current.id && current.type !== result.type) {
    if (result.type === "youtube") result.platform = "youtube";
    else if (result.type === "apify")
      result.platform = ["instagram", "tiktok"].includes(current.platform)
        ? current.platform
        : "instagram";
  }
  if (body.limit !== undefined) {
    result.limit = number(body.limit, "Límite de resultados", 1, 50);
    if (!Number.isInteger(result.limit))
      fail(400, "El límite de resultados debe ser un número entero.");
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean")
      fail(400, "enabled debe ser booleano.");
    result.enabled = body.enabled;
  }
  if (result.type === "rss" && !result.url) fail(400, "RSS requiere una URL.");
  if (result.type === "youtube") {
    if (result.platform && result.platform !== "youtube")
      fail(400, "Una fuente YouTube solo puede usar la plataforma YouTube.");
    result.platform = "youtube";
    result.limit ??= 20;
  }
  if (result.type === "apify") {
    if (!result.platform || !["instagram", "tiktok"].includes(result.platform))
      fail(400, "Apify admite fuentes de Instagram o TikTok.");
    result.limit ??= 20;
  }
  if (["youtube", "apify"].includes(result.type)) {
    try {
      result.url = canonicalSocialSourceUrl(
        result.type,
        result.platform,
        result.url,
      );
    } catch (error) {
      fail(error.status || 400, error.message);
    }
  }
  const socialType = ["youtube", "apify"].includes(result.type);
  const becameSocial =
    socialType && (!current.id || current.type !== result.type);
  if (body.enabled === undefined && becameSocial) result.enabled = false;
  else if (!current.id && body.enabled === undefined) result.enabled = true;
  if (body.enabled === true) assertSourceCollectionAllowed(result);
  if (!sourceAccessPolicy(result).allowed) result.enabled = false;
  return result;
}
const validators = {
  references: referenceInput,
  ideas: ideaInput,
  pieces: pieceInput,
  sources: sourceInput,
};
function cleanAssetPath(asset) {
  const target = asset.storageName
    ? path.resolve(UPLOAD_DIR, asset.storageName)
    : asset.filePath
      ? path.resolve(asset.filePath)
      : null;
  if (!target || !target.startsWith(`${UPLOAD_DIR}${path.sep}`)) return null;
  return target;
}
const MAX_ASSET_FILE_BYTES = 25 * 1024 * 1024;
const upload = filenameAwareUpload({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: {
    fileSize: MAX_ASSET_FILE_BYTES,
    files: 1,
    fields: 5,
    fieldSize: 4096,
  },
});
const receiveAssetFile = upload.single("file");
function uploadAssetFile(req, res, next) {
  receiveAssetFile(req, res, (error) => {
    if (error?.code === "LIMIT_FILE_SIZE")
      return next(
        Object.assign(
          new Error(
            "El archivo supera el máximo de 25 MiB. Selecciona uno más pequeño.",
          ),
          { status: 413 },
        ),
      );
    next(error);
  });
}
function isUtf8TextFile(file) {
  const fd = fs.openSync(file.path, "r");
  const chunk = Buffer.alloc(64 * 1024);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  // Inspect every byte within the upload limit using fixed memory. Streaming
  // decoding preserves multibyte characters split between reads.
  const binaryControls = /[\u0000-\u0008\u000B\u000E-\u001F\u007F-\u009F]/;
  try {
    let position = 0;
    while (position < file.size) {
      const count = fs.readSync(
        fd,
        chunk,
        0,
        Math.min(chunk.length, file.size - position),
        position,
      );
      if (!count) return false;
      if (
        binaryControls.test(
          decoder.decode(chunk.subarray(0, count), { stream: true }),
        )
      )
        return false;
      position += count;
    }
    return !binaryControls.test(decoder.decode());
  } catch (error) {
    if (error.code === "ERR_ENCODING_INVALID_ENCODED_DATA") return false;
    throw error;
  } finally {
    fs.closeSync(fd);
  }
}

function assertTextAssetPrivacy(file) {
  const fd = fs.openSync(file.path, "r");
  const chunk = Buffer.alloc(64 * 1024);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let tail = "";
  try {
    let position = 0;
    while (position < file.size) {
      const count = fs.readSync(
        fd,
        chunk,
        0,
        Math.min(chunk.length, file.size - position),
        position,
      );
      if (!count) fail(400, "No se pudo revisar el archivo. Vuelve a subirlo.");
      const text =
        tail + decoder.decode(chunk.subarray(0, count), { stream: true });
      assertPublicContentText(text, "Archivo de texto");
      tail = text.slice(-4096);
      position += count;
    }
    assertPublicContentText(tail + decoder.decode(), "Archivo de texto");
  } finally {
    fs.closeSync(fd);
  }
}
function detectFile(file) {
  const fd = fs.openSync(file.path, "r");
  const header = Buffer.alloc(1024);
  const count = fs.readSync(fd, header, 0, 1024, 0);
  fs.closeSync(fd);
  const bytes = header.subarray(0, count);
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return ["image", "image/png"];
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return ["image", "image/jpeg"];
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString()))
    return ["image", "image/gif"];
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return ["image", "image/webp"];
  if (bytes.subarray(0, 5).toString() === "%PDF-")
    return ["document", "application/pdf"];
  if (bytes.subarray(4, 8).toString() === "ftyp") {
    const audio = file.mimetype.startsWith("audio/");
    return [audio ? "audio" : "video", audio ? "audio/mp4" : "video/mp4"];
  }
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return [
      file.mimetype.startsWith("audio/") ? "audio" : "video",
      file.mimetype.startsWith("audio/") ? "audio/webm" : "video/webm",
    ];
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WAVE"
  )
    return ["audio", "audio/wav"];
  if (bytes.subarray(0, 4).toString() === "OggS") return ["audio", "audio/ogg"];
  if (
    bytes.subarray(0, 3).toString() === "ID3" ||
    (bytes[0] === 255 && (bytes[1] & 224) === 224)
  )
    return ["audio", "audio/mpeg"];
  if (["text/plain", "text/markdown", "text/csv"].includes(file.mimetype)) {
    if (!isUtf8TextFile(file))
      fail(
        400,
        "El archivo no contiene texto UTF-8 válido o contiene datos binarios. Guárdalo como texto UTF-8 y vuelve a subirlo.",
      );
    return ["document", file.mimetype];
  }
  fail(
    400,
    "Formato no admitido. Sube PNG, JPG, WebP, GIF, PDF, texto, audio o MP4/WebM válidos.",
  );
}

export function createCoreRouter() {
  const router = express.Router();
  router.get("/health", (_req, res) => res.json({ ok: true }));
  router.get("/session", (req, res) => res.json(session(resolveUser(req))));
  router.post("/auth/register", authRateLimit, async (req, res) => {
    const input = credentials(req.body, true);
    if (db.prepare("SELECT id FROM users WHERE email=?").get(input.email))
      fail(409, "Ya existe una cuenta con este correo.");
    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      user = createUser({ ...input, passwordHash });
    } catch (error) {
      if (
        error.code?.includes("CONSTRAINT") ||
        error.message.includes("UNIQUE constraint")
      )
        fail(409, "Ya existe una cuenta con este correo.");
      throw error;
    }
    issueSession(req, res, user.id);
    res.status(201).json(session(user));
  });
  router.post("/auth/login", authRateLimit, async (req, res) => {
    const input = credentials(req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(input.email);
    const matched = await verifyPassword(
      input.password,
      user?.password_hash ||
        "01234567890123456789012345678901:" + "0".repeat(128),
    );
    if (!user || !matched) fail(401, "Correo o contraseña incorrectos.");
    issueSession(req, res, user.id);
    res.json(session(user));
  });
  router.post("/auth/logout", (req, res) => {
    clearSession(req, res);
    res.json({ ok: true });
  });
  router.post("/auth/demo", authRateLimit, async (req, res) => {
    const user = createUser({
      name: "Explorador de kompass",
      email: `demo-${randomUUID()}@example.invalid`,
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
    });
    const brand = saveBrand({ ...brandInput(demoBrandInput()), isDemo: true });
    db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
      brand.id,
      user.id,
      "owner",
    );
    defaults(brand.id);
    seedDemo(brand.id);
    issueSession(req, res, user.id);
    res.status(201).json(session(user));
  });
  router.post("/brands", requireAuth, (req, res) => {
    if (
      db
        .prepare("SELECT COUNT(*) AS total FROM members WHERE user_id=?")
        .get(req.user.id).total >= 50
    )
      fail(400, "Tu cuenta alcanzó el límite de 50 marcas.");
    const brand = saveBrand(brandInput(req.body));
    db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
      brand.id,
      req.user.id,
      "owner",
    );
    defaults(brand.id);
    addActivity(
      brand.id,
      `${req.user.name} creó la marca. Configura su contexto y captura tu primera referencia.`,
    );
    res.status(201).json({ ...brand, role: "owner" });
  });
  router.post("/invitations/:token/accept", requireAuth, (req, res) => {
    const hashed = tokenHash(req.params.token);
    const invite = db
      .prepare(
        "SELECT * FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
      )
      .get(hashed, Date.now());
    if (!invite)
      fail(404, "La invitación venció, ya fue utilizada o no existe.");
    const inviter = db
      .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
      .get(invite.brand_id, invite.created_by);
    if (inviter?.role !== "owner")
      fail(403, "El creador de esta invitación ya no administra la marca.");
    db.exec("BEGIN IMMEDIATE");
    try {
      const consumed = db
        .prepare(
          "UPDATE invitations SET used_at=? WHERE token_hash=? AND used_at IS NULL",
        )
        .run(Date.now(), hashed);
      if (!consumed.changes) fail(409, "La invitación ya fue utilizada.");
      db.prepare(
        "INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?) ON CONFLICT(brand_id,user_id) DO NOTHING",
      ).run(invite.brand_id, req.user.id, invite.role);
      addActivity(invite.brand_id, `${req.user.name} se unió al equipo.`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const member = db
      .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
      .get(invite.brand_id, req.user.id);
    res.json({ ...getBrand(invite.brand_id), role: member.role });
  });

  router.use("/brands/:brandId", requireAuth, requireBrand);
  router.get("/brands/:brandId/state", (req, res) =>
    res.json(brandState(req.brand.id, req.user.id)),
  );
  router.patch("/brands/:brandId", requireOwner, (req, res) => {
    const input = brandInput(req.body, req.brand);
    if (req.body.audience !== undefined) {
      const nextIds = new Set(input.audience.map((segment) => segment.id));
      const removedIds = new Set(
        (req.brand.audience || [])
          .filter((segment) => !nextIds.has(segment.id))
          .map((segment) => segment.id),
      );
      if (removedIds.size) {
        const linkedPieces = listRecords(req.brand.id, "pieces").filter(
          (piece) => removedIds.has(piece.segmentId),
        );
        const linkedIdeas = listRecords(req.brand.id, "ideas").filter((idea) =>
          removedIds.has(idea.segmentId),
        );
        if (linkedPieces.length || linkedIdeas.length) {
          const usage = [];
          if (linkedPieces.length)
            usage.push(
              `${linkedPieces.length} ${linkedPieces.length === 1 ? "pieza" : "piezas"}`,
            );
          if (linkedIdeas.length)
            usage.push(
              `${linkedIdeas.length} ${linkedIdeas.length === 1 ? "idea" : "ideas"}`,
            );
          fail(
            409,
            `No puedes eliminar la audiencia: ${usage.join(" y ")} todavía tienen vínculos. Reasigna esas piezas e ideas a otra audiencia antes de eliminarla.`,
          );
        }
      }
    }
    const brand = saveBrand(input);
    addActivity(brand.id, `${req.user.name} actualizó el perfil editorial.`);
    res.json({ ...brand, role: req.membership.role });
  });
  router.post("/brands/:brandId/demo-seed", requireOwner, (req, res) => {
    seedDemo(req.brand.id);
    res.json(brandState(req.brand.id, req.user.id));
  });
  router.post("/brands/:brandId/invitations", requireOwner, (req, res) => {
    const role = options(object(req.body).role, ["editor", "reviewer"], "Rol");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    db.prepare(
      "INSERT INTO invitations(token_hash,brand_id,role,expires_at,created_by) VALUES(?,?,?,?,?)",
    ).run(
      tokenHash(token),
      req.brand.id,
      role,
      Date.parse(expiresAt),
      req.user.id,
    );
    addActivity(
      req.brand.id,
      `${req.user.name} creó una invitación para ${role === "editor" ? "editor" : "revisor"} (válida 7 días).`,
    );
    res.status(201).json({ token, expiresAt });
  });
  router.patch("/brands/:brandId/members/:userId", requireOwner, (req, res) => {
    const role = options(
      object(req.body).role,
      ["owner", "editor", "reviewer"],
      "Rol",
    );
    const member = db
      .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
      .get(req.brand.id, req.params.userId);
    if (!member) fail(404, "Miembro no encontrado.");
    if (
      member.role === "owner" &&
      role !== "owner" &&
      db
        .prepare(
          "SELECT COUNT(*) AS total FROM members WHERE brand_id=? AND role='owner'",
        )
        .get(req.brand.id).total <= 1
    )
      fail(409, "La marca necesita al menos un propietario.");
    db.prepare("UPDATE members SET role=? WHERE brand_id=? AND user_id=?").run(
      role,
      req.brand.id,
      req.params.userId,
    );
    addActivity(
      req.brand.id,
      `${req.user.name} actualizó los permisos de un miembro.`,
    );
    res.json({ ok: true });
  });
  router.delete(
    "/brands/:brandId/members/:userId",
    requireOwner,
    (req, res) => {
      const member = db
        .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
        .get(req.brand.id, req.params.userId);
      if (!member) fail(404, "Miembro no encontrado.");
      if (
        member.role === "owner" &&
        db
          .prepare(
            "SELECT COUNT(*) AS total FROM members WHERE brand_id=? AND role='owner'",
          )
          .get(req.brand.id).total <= 1
      )
        fail(409, "La marca necesita al menos un propietario.");
      db.prepare("DELETE FROM members WHERE brand_id=? AND user_id=?").run(
        req.brand.id,
        req.params.userId,
      );
      addActivity(
        req.brand.id,
        `${req.user.name} retiró a un miembro del equipo.`,
      );
      res.json({ ok: true });
    },
  );
  for (const [kind, validate] of Object.entries(validators)) {
    router.get(`/brands/:brandId/${kind}`, (req, res) => {
      const records = listRecords(req.brand.id, kind);
      res.json(
        kind === "references"
          ? records.map((reference) =>
              publicReference(reference, {
                source:
                  reference.sourceId &&
                  getRecord(req.brand.id, "sources", reference.sourceId),
              }),
            )
          : kind === "pieces"
            ? records.map(publicPiece)
            : kind === "sources"
              ? records.map(publicSource)
              : records,
      );
    });
    router.post(`/brands/:brandId/${kind}`, requireEditor, (req, res) => {
      object(req.body);
      if (kind === "references") {
        const input = validate(req.body, {}, req);
        let record,
          reused = false;
        // The identity check and insert share the SQLite write lock, including
        // when more than one API process receives retries for this brand.
        db.exec("BEGIN IMMEDIATE");
        try {
          const records = listRecords(req.brand.id, kind);
          const identity = referenceIdentity(input);
          record =
            identity &&
            deduplicateReferences(records.filter((item) => !item.isDemo)).find(
              (item) => referenceIdentity(item) === identity,
            );
          reused = !!record;
          if (!record) {
            if (records.length >= 10000)
              fail(400, "Se alcanzó el límite de registros de esta marca.");
            record = saveRecord(req.brand.id, kind, input);
            addActivity(
              req.brand.id,
              `${req.user.name} añadió una referencia: ${record.title}.`,
            );
          }
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return res.status(reused ? 200 : 201).json(publicReference(record));
      }
      if (
        listRecords(req.brand.id, kind).length >=
        (kind === "sources" ? 100 : 10000)
      )
        fail(400, "Se alcanzó el límite de registros de esta marca.");
      const record = saveRecord(
        req.brand.id,
        kind,
        validate(req.body, {}, req),
      );
      addActivity(
        req.brand.id,
        `${req.user.name} añadió ${kind === "references" ? "una referencia" : kind === "ideas" ? "una idea" : kind === "sources" ? "una fuente" : "una pieza"}: ${record.title || record.name}.`,
      );
      res
        .status(201)
        .json(
          kind === "references"
            ? publicReference(record)
            : kind === "pieces"
              ? publicPiece(record)
              : kind === "sources"
                ? publicSource(record)
                : record,
        );
    });
    router.patch(`/brands/:brandId/${kind}/:id`, requireEditor, (req, res) => {
      object(req.body);
      const current = getRecord(req.brand.id, kind, req.params.id);
      if (!current) fail(404, "Registro no encontrado.");
      if (kind === "pieces" && req.body.expectedEditVersion !== undefined)
        requireEditVersion(current, req.body.expectedEditVersion);
      const next = validate(req.body, current, req);
      if (
        kind === "pieces" &&
        current.status === "review" &&
        next.status === "approved"
      ) {
        requireApprovalVersion(current, req.body.expectedApprovalVersion);
        if (
          publicPiece(next).approvalVersion !==
          publicPiece(current).approvalVersion
        )
          approvalConflict();
      }
      const record = saveRecord(req.brand.id, kind, next);
      res.json(
        kind === "references"
          ? publicReference(record)
          : kind === "pieces"
            ? publicPiece(record)
            : kind === "sources"
              ? publicSource(record)
              : record,
      );
    });
    router.delete(`/brands/:brandId/${kind}/:id`, requireEditor, (req, res) => {
      const record = getRecord(req.brand.id, kind, req.params.id);
      if (!record) fail(404, "Registro no encontrado.");
      if (kind === "pieces") assertPieceMutable(req.brand.id, record.id);
      if (kind === "pieces" && record.status === "published")
        fail(
          409,
          "Las piezas publicadas se conservan para mantener su historial.",
        );
      deleteRecord(req.brand.id, kind, record.id);
      if (kind === "references") {
        for (const idea of listRecords(req.brand.id, "ideas"))
          if (idea.referenceIds.includes(record.id))
            saveRecord(req.brand.id, "ideas", {
              ...idea,
              referenceIds: idea.referenceIds.filter((id) => id !== record.id),
            });
        for (const piece of listRecords(req.brand.id, "pieces"))
          if (piece.referenceId === record.id)
            saveRecord(req.brand.id, "pieces", {
              ...piece,
              referenceId: undefined,
            });
      }
      if (kind === "ideas")
        for (const piece of listRecords(req.brand.id, "pieces"))
          if (piece.ideaId === record.id)
            saveRecord(req.brand.id, "pieces", { ...piece, ideaId: undefined });
      res.json({ ok: true });
    });
  }
  router.post("/brands/:brandId/pieces/:id/comments", (req, res) => {
    const piece = getRecord(req.brand.id, "pieces", req.params.id);
    if (!piece) fail(404, "Pieza no encontrada.");
    const comment = {
      id: randomUUID(),
      author: req.user.name,
      text: text(object(req.body).text, "Comentario", 5000, true),
      createdAt: new Date().toISOString(),
    };
    if ((piece.comments?.length || 0) >= 500)
      fail(400, "La pieza alcanzó el límite de comentarios.");
    res.json(
      publicPiece(
        saveRecord(req.brand.id, "pieces", {
          ...piece,
          comments: [...(piece.comments || []), comment],
        }),
      ),
    );
  });
  router.post("/brands/:brandId/pieces/:id/review", (req, res) => {
    if (!["owner", "reviewer"].includes(req.membership.role))
      fail(403, "La aprobación requiere un propietario o revisor.");
    const body = object(req.body);
    const action = options(
      body.action,
      ["approve", "request_changes"],
      "Acción",
    );
    const piece = getRecord(req.brand.id, "pieces", req.params.id);
    if (!piece) fail(404, "Pieza no encontrada.");
    if (piece.status !== "review")
      fail(409, "La pieza debe estar en revisión.");
    if (action === "approve")
      requireApprovalVersion(piece, body.expectedApprovalVersion);
    const message = text(body.comment, "Comentario", 5000);
    const comment = {
      id: randomUUID(),
      author: req.user.name,
      text: `${action === "approve" ? "Aprobada" : "Cambios solicitados"}${message ? `: ${message}` : "."}`,
      createdAt: new Date().toISOString(),
    };
    const saved = saveRecord(req.brand.id, "pieces", {
      ...piece,
      status: action === "approve" ? "approved" : "draft",
      comments: [...(piece.comments || []), comment],
    });
    addActivity(
      req.brand.id,
      `${req.user.name} ${action === "approve" ? "aprobó" : "solicitó cambios en"} «${piece.title}».`,
    );
    res.json(publicPiece(saved));
  });
  router.get("/brands/:brandId/assets", (req, res) =>
    res.json(listRecords(req.brand.id, "assets").map(publicAsset)),
  );
  router.post(
    "/brands/:brandId/assets",
    requireEditor,
    uploadAssetFile,
    (req, res, next) => {
      try {
        if (!req.file) fail(400, "Selecciona un archivo en el campo file.");
        const pieceId = req.body.pieceId
          ? assertRecord(
              req.brand.id,
              "pieces",
              text(req.body.pieceId, "Pieza", 100, true),
              "Pieza",
            )
          : undefined;
        const [type, mimeType] = detectFile(req.file);
        const textReview = mimeType.startsWith("text/");
        assertPublicContentText(
          cleanUploadName(req.file.originalname),
          "Nombre del archivo",
        );
        if (textReview) assertTextAssetPrivacy(req.file);
        const id = randomUUID();
        const asset = saveRecord(req.brand.id, "assets", {
          id,
          name: cleanUploadName(req.file.originalname),
          type,
          mimeType,
          size: req.file.size,
          storageName: req.file.filename,
          url: `/api/brands/${req.brand.id}/assets/${id}/file`,
          origin: "upload",
          privacyReview: {
            mode: textReview ? "text-patterns" : "manual-required",
            checkedAt: new Date().toISOString(),
            complete: false,
          },
          pieceId,
        });
        addActivity(req.brand.id, `${req.user.name} subió «${asset.name}».`);
        res.status(201).json(publicAsset(asset));
      } catch (error) {
        if (req.file) fs.rmSync(req.file.path, { force: true });
        next(error);
      }
    },
  );
  router.get("/brands/:brandId/assets/:id/file", (req, res) => {
    const asset = getRecord(req.brand.id, "assets", req.params.id);
    const filePath = asset && cleanAssetPath(asset);
    if (!asset || !filePath || !fs.existsSync(filePath))
      fail(404, "Archivo no encontrado.");
    res.set({
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    const disposition =
      asset.type === "document" || req.query.download !== undefined
        ? "attachment"
        : "inline";
    res.set(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodedDownloadName(asset.name)}`,
    );
    res.sendFile(path.relative(UPLOAD_DIR, filePath), { root: UPLOAD_DIR });
  });
  router.delete("/brands/:brandId/assets/:id", requireEditor, (req, res) => {
    const asset = getRecord(req.brand.id, "assets", req.params.id);
    if (!asset) fail(404, "Archivo no encontrado.");
    if (
      listRecords(req.brand.id, "pieces").some(
        (piece) =>
          ["approved", "scheduled", "published"].includes(piece.status) &&
          (piece.assetIds.includes(asset.id) ||
            piece.scenes.some((scene) => scene.assetId === asset.id)),
      )
    )
      fail(
        409,
        "El archivo está asociado a una pieza aprobada, programada o publicada.",
      );
    const target = cleanAssetPath(asset);
    if (target) fs.rmSync(target, { force: true });
    deleteRecord(req.brand.id, "assets", asset.id);
    for (const piece of listRecords(req.brand.id, "pieces"))
      if (
        piece.assetIds.includes(asset.id) ||
        piece.scenes.some((scene) => scene.assetId === asset.id)
      )
        saveRecord(req.brand.id, "pieces", {
          ...piece,
          assetIds: piece.assetIds.filter((id) => id !== asset.id),
          scenes: piece.scenes.map((scene) => ({
            ...scene,
            ...(scene.assetId === asset.id ? { assetId: undefined } : {}),
          })),
        });
    for (const reference of listRecords(req.brand.id, "references"))
      if (reference.assetId === asset.id)
        saveRecord(req.brand.id, "references", {
          ...reference,
          assetId: undefined,
        });
    if (req.brand.logoAssetId === asset.id)
      saveBrand({ ...req.brand, logoAssetId: undefined });
    res.json({ ok: true });
  });
  return router;
}

function demoBrandInput() {
  return {
    name: "Empresa de ejemplo",
    industry: "Educación y transformación con IA",
    description:
      "Espacio de demostración con referencias, hipótesis y piezas ficticias identificadas. Ayudamos a equipos latinoamericanos a convertir la IA en trabajo útil.",
    tone: "Directo, curioso, práctico. Sin exageraciones ni promesas mágicas.",
    language: "Español",
    market: "Latinoamérica",
    color: "#c4f168",
    secondaryColor: "#171d17",
    weeklyTarget: 4,
    goals: [
      "Educar con ejemplos accionables",
      "Generar conversaciones con líderes",
      "Aumentar consultas de formación",
    ],
    pillars: [
      "IA aplicada",
      "Productividad real",
      "Equipos y cultura",
      "Criterio tecnológico",
    ],
    audience: [
      {
        id: randomUUID(),
        name: "Líderes que exploran IA",
        role: "Fundadores y directivos",
        stage: "Exploración",
        needs: "Entender oportunidades y decidir qué probar primero.",
      },
      {
        id: randomUUID(),
        name: "Equipos que implementan",
        role: "Operaciones, marketing y producto",
        stage: "Implementación",
        needs:
          "Casos concretos, pasos y criterios para llevar pilotos a producción.",
      },
    ],
  };
}
export function seedDemo(brandId) {
  if (listRecords(brandId, "references").some((reference) => reference.isDemo))
    return;
  const brand = getBrand(brandId);
  const now = Date.now();
  const entries = [
    [
      "Tu próximo compañero de trabajo es un agente",
      "Los equipos están pasando de preguntar a una IA a delegar pequeños flujos. ¿Qué tarea entregarías primero?",
      "Hacker News",
      "Agentes de IA",
      "low",
      92,
      "La oportunidad está en enseñar un flujo concreto que un equipo pueda probar en una tarde.",
    ],
    [
      "El problema de la IA no es la herramienta: es el proceso",
      "Un mapa sencillo del antes y después de automatizar el cierre semanal de un equipo.",
      "LinkedIn",
      "IA en operaciones",
      "medium",
      88,
      "Mostrar el proceso actual y quitar una fricción antes de automatizar.",
    ],
    [
      "Deja de guardar prompts. Documenta decisiones.",
      "Las mejores plantillas enseñan a decidir qué contexto necesita el modelo para una tarea específica.",
      "Reddit",
      "Criterio y prompts",
      "high",
      82,
      "Cambiar la lista de prompts por una guía de decisiones aplicable a un caso local.",
    ],
    [
      "Un equipo de tres puede operar como uno de diez",
      "Ejemplo ficticio de un equipo pequeño que combina herramientas y revisión humana para ampliar capacidad.",
      "YouTube",
      "Equipos pequeños",
      "medium",
      87,
      "Describir límites, responsabilidades y puntos de revisión para evitar promesas irreales.",
    ],
    [
      "La demo funciona. El lunes se rompe.",
      "La diferencia entre un experimento de IA y un proceso que alguien usa cada semana.",
      "Hacker News",
      "De piloto a producción",
      "low",
      95,
      "Enseñar una checklist de datos, responsable, evaluación y recuperación de errores.",
    ],
    [
      "Así se ve una semana con IA en marketing",
      "Desglose ficticio de tres tareas de marketing apoyadas por IA: investigar, redactar y revisar.",
      "Instagram",
      "Marketing con IA",
      "high",
      75,
      "Presentar una semana realista con tiempos, revisión editorial y ejemplos cercanos.",
    ],
    [
      "¿Quién revisa al agente?",
      "La revisión humana necesita criterios concretos: qué se aprueba, qué se escala y qué nunca se delega.",
      "Reddit",
      "Confianza y evaluación",
      "low",
      90,
      "Crear un árbol de decisión para responsables de equipos.",
    ],
    [
      "La ventaja no es tener el último modelo",
      "El valor está en el contexto de tu negocio y los datos que sabes usar, no solo en cambiar de herramienta.",
      "LinkedIn",
      "Estrategia de IA",
      "medium",
      84,
      "Proponer una auditoría sencilla de contexto y conocimiento interno.",
    ],
  ];
  const refs = entries.map(
    (
      [title, content, source, topic, saturation, relevance, adaptation],
      index,
    ) =>
      saveRecord(brandId, "references", {
        title,
        text: `[EJEMPLO] ${content}`,
        source: `${source} · ejemplo`,
        language: "Inglés",
        market: "Internacional",
        format: index % 3 === 0 ? "video" : "post",
        status: index === 6 ? "new" : "analyzed",
        tags: [topic, "Ejemplo"],
        isDemo: true,
        createdAt: new Date(now - index * 9 * 3600_000).toISOString(),
        ...(index === 6
          ? {}
          : {
              analysis: {
                hook: title,
                format: index % 3 === 0 ? "video" : "post",
                hypothesis:
                  "Hipótesis de ejemplo: combina una tensión reconocible con una solución que parece alcanzable. No contamos con métricas de rendimiento.",
                saturation,
                saturationReason:
                  "Estimación ilustrativa para mostrar la interfaz. No representa saturación de mercado.",
                relevance,
                adaptation,
                segmentIds: brand.audience
                  .slice(0, 2)
                  .map((segment) => segment.id),
                signals: [
                  "Dato de demostración",
                  "No se consultaron métricas de esta publicación",
                ],
                confidence: "low",
                engine: "heuristic",
                analyzedAt: new Date(now - index * 3600_000).toISOString(),
              },
            }),
      }),
  );
  const ideas = refs.slice(0, 4).map((reference, index) =>
    saveRecord(brandId, "ideas", {
      title: reference.title,
      angle: reference.analysis.adaptation,
      referenceIds: [reference.id],
      segmentId: brand.audience[index % Math.max(brand.audience.length, 1)]?.id,
      status: index === 0 ? "approved" : "proposed",
      isDemo: true,
    }),
  );
  const titles = [
    "De preguntar a delegar: tu primer agente en 30 minutos",
    "3 preguntas antes de automatizar un proceso",
    "La checklist para que tu piloto sobreviva al lunes",
    "El contexto es tu verdadera ventaja",
    "Una semana de IA sin sumar más herramientas",
  ];
  const statuses = ["draft", "review", "approved", "scheduled", "draft"];
  const scripts = [
    "Tu primer agente no necesita dirigir toda tu empresa.\n\nEmpieza por una tarea repetible y con un resultado fácil de revisar. Por ejemplo: resumir las consultas semanales de clientes y preparar un primer borrador de respuesta.\n\nDefine tres cosas: el contexto que necesita, cómo reconocer una buena respuesta y cuándo pedir ayuda a una persona.\n\nPrueba con diez casos reales antes de delegar el siguiente paso. La meta es aprender dónde funciona y dónde necesita revisión.",
    "Antes de automatizar, responde estas tres preguntas.\n\nUno: ¿qué problema concreto estamos quitando? Si no puedes describir el problema, una herramienta más no lo resuelve.\n\nDos: ¿quién revisa el resultado? Asigna una persona y un criterio de calidad.\n\nTres: ¿cómo sabremos si mejoró? Compara tiempo, errores y utilidad con el proceso anterior.\n\nEmpieza pequeño, mide y repite.",
  ];
  titles.forEach((title, index) =>
    saveRecord(brandId, "pieces", {
      title,
      referenceId: refs[index].id,
      ideaId: ideas[index % ideas.length].id,
      segmentId: brand.audience[index % Math.max(brand.audience.length, 1)]?.id,
      format: ["reel", "carousel", "post", "post", "newsletter"][index],
      channel: index === 0 ? "instagram" : "linkedin",
      status: statuses[index],
      hook: title,
      script: scripts[index % 2],
      caption:
        "La IA se vuelve útil cuando sabemos qué trabajo queremos mejorar. Guarda estas ideas para tu próxima reunión de equipo.\n\nContenido de demostración.",
      cta: "¿Qué proceso de tu equipo probarías primero?",
      scenes: [
        { id: randomUUID(), text: title, duration: 5 },
        {
          id: randomUUID(),
          text: "Empieza por una tarea concreta. Define contexto, revisión y criterio de éxito.",
          duration: 8,
        },
      ],
      assetIds: [],
      comments:
        index === 1
          ? [
              {
                id: randomUUID(),
                author: "Equipo de ejemplo",
                text: "¿Podemos añadir un caso de una empresa de servicios latinoamericana?",
                createdAt: new Date().toISOString(),
              },
            ]
          : [],
      ...(index === 3
        ? { scheduledFor: new Date(now + 48 * 3600_000).toISOString() }
        : {}),
      generationEngine: "heuristic",
      isDemo: true,
    }),
  );
  const id = randomUUID();
  const storageName = `${id}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" role="img" aria-labelledby="title description">
  <title id="title">kompass · tarjeta de demostración</title>
  <desc id="description">Le damos dirección a tu contenido. Plantilla de ejemplo, no publicada.</desc>
  <rect width="1200" height="1200" fill="#0c0c10"/>
  <g transform="translate(80 88) scale(2)" fill="none" stroke="#bea5f5" stroke-width="1.5">
    <rect x="1" y="1" width="11" height="11" rx="2" fill="#bea5f5" stroke="none"/>
    <rect x="18" y="1" width="11" height="11" rx="2"/>
    <rect x="1" y="18" width="11" height="11" rx="2"/>
    <rect x="18" y="18" width="11" height="11" rx="2" fill="#bea5f5" stroke="none"/>
    <path d="m10 10 10 10M10 20l10-10"/>
  </g>
  <text x="166" y="133" font-family="Geist, Arial, sans-serif" font-size="38" fill="#f3f1f7">kompass · EJEMPLO</text>
  <path d="M80 212h1040M80 982h1040" stroke="#2c2b35" stroke-width="2"/>
  <text x="80" y="422" font-family="Hedvig Letters Serif, Georgia, serif" font-size="100" letter-spacing="-2" fill="#f3f1f7" aria-label="Le damos dirección a tu contenido.">
    <tspan x="80" dy="0">Le damos</tspan>
    <tspan x="80" dy="122">dirección a tu</tspan>
    <tspan x="80" dy="122">contenido.</tspan>
  </text>
  <g transform="translate(850 384) scale(8)" fill="none" stroke="#bea5f5" stroke-width=".7">
    <rect x="1" y="1" width="11" height="11" rx="1.5" fill="#bea5f5" stroke="none"/>
    <rect x="18" y="1" width="11" height="11" rx="1.5"/>
    <rect x="1" y="18" width="11" height="11" rx="1.5"/>
    <rect x="18" y="18" width="11" height="11" rx="1.5" fill="#bea5f5" stroke="none"/>
    <path d="m10 10 10 10M10 20l10-10"/>
  </g>
  <text x="80" y="850" font-family="Geist, Arial, sans-serif" font-size="30" fill="#aaa7b7">De una pregunta a una pieza con fundamento.</text>
  <text x="80" y="1060" font-family="Geist, Arial, sans-serif" font-size="27" fill="#bea5f5">Plantilla de demostración · no publicada</text>
  <text x="80" y="1110" font-family="Geist, Arial, sans-serif" font-size="22" fill="#aaa7b7">Material de ejemplo para explorar tu espacio de trabajo.</text>
</svg>`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storageName), svg, { mode: 0o600 });
  saveRecord(brandId, "assets", {
    id,
    name: "kompass · tarjeta de ejemplo.svg",
    type: "image",
    mimeType: "image/svg+xml",
    size: Buffer.byteLength(svg),
    storageName,
    url: `/api/brands/${brandId}/assets/${id}/file`,
    origin: "template",
    isDemo: true,
  });
  addActivity(
    brandId,
    "Se cargaron datos de demostración: las referencias y señales son ejemplos, no tendencias verificadas ni publicaciones reales.",
  );
}
