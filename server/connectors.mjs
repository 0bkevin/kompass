import { resolveAiConfig } from "./integration-config.mjs";
import https from "node:https";
import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";
import {
  assertOutboundAllowed,
  assertAiProviderAllowed,
  assertWebhookAllowed,
  assertReferenceUseAllowed,
} from "./access-policy.mjs";
import { robotsAllows } from "./robots-policy.mjs";
import { createHash } from "node:crypto";
import {
  getRecord,
  saveRecord,
  getSecret,
  setSecret,
  publicIntegrations,
  addActivity,
} from "./db.mjs";

import { publicPublicationReceipt } from "./publication-receipt.mjs";

export { publicIntegrations };
// Below the documented 10,000 requests/IP/hour ceiling. Shared across brands
// within this process; operators must also budget other clients on the same IP.
const hnRequests = [];
function reserveDiscoveryRequest(url, purpose) {
  if (purpose !== "discovery" || url.hostname !== "hn.algolia.com") return;
  const now = Date.now();
  while (hnRequests.length && hnRequests[0] <= now - 3600000)
    hnRequests.shift();
  if (hnRequests.length >= 1000)
    throw integrationError(
      "Hacker News alcanzó el límite conservador de 1000 consultas por hora de este servidor. No se hizo otra solicitud.",
      429,
    );
  hnRequests.push(now);
}
export function integrationError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// Only public unicast addresses. DNS is resolved once and pinned on the actual socket.
export function isPublicAddress(address) {
  let ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(ip) === 6) ip = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  if (net.isIP(ip) === 4) {
    const [a, b, c, d] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          // IANA: 192.0.0.0/24, with globally reachable PCP/TURN anycast exceptions.
          (b === 0 && c === 0 && d !== 9 && d !== 10) ||
          (b === 0 && c === 2) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Denies loopback, link-local, ULA, multicast, IPv4-mapped and other transition ranges.
  return (
    net.isIP(ip) === 6 &&
    /^[23][\da-f]{0,3}:/.test(ip) &&
    !ip.startsWith("2001:db8:") &&
    !/^2001:(?:0:|:)/.test(ip) &&
    !ip.startsWith("2002:") &&
    !ip.startsWith("3fff:")
  );
}

export async function validatePublicUrl(
  value,
  { requireHttps = false, lookup = dns.lookup } = {},
) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw integrationError("La URL debe ser absoluta y pública.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (requireHttps && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw integrationError(
      requireHttps
        ? "Usa una URL HTTPS pública sin credenciales."
        : "Usa una URL HTTP o HTTPS pública sin credenciales.",
    );
  }
  if (url.port && !["80", "443"].includes(url.port))
    throw integrationError("Solo se permiten puertos HTTP/HTTPS estándar.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(
      hostname,
    )
  )
    throw integrationError("No se permite acceder a direcciones privadas.");
  let addresses;
  let dnsTimer;
  try {
    addresses = net.isIP(hostname)
      ? [{ address: hostname, family: net.isIP(hostname) }]
      : await Promise.race([
          lookup(hostname, { all: true, verbatim: true }),
          new Promise((_resolve, reject) => {
            dnsTimer = setTimeout(() => reject(new Error("DNS timeout")), 5000);
          }),
        ]);
  } catch {
    throw integrationError("No se pudo resolver el dominio público.");
  } finally {
    clearTimeout(dnsTimer);
  }
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw integrationError(
      "No se permite acceder a direcciones privadas o reservadas.",
    );
  return { url, addresses };
}

export async function safeFetch(value, options = {}) {
  const purpose = options.policyPurpose || "metadata";
  assertOutboundAllowed(value, purpose);
  const {
    timeout = 12000,
    maxBytes = 3 * 1024 * 1024,
    maxRedirects = 2,
    requireHttps = false,
  } = options;
  const { url, addresses } = await validatePublicUrl(value, { requireHttps });
  reserveDiscoveryRequest(url, purpose);
  if (["website", "metadata", "rss"].includes(purpose)) {
    const robotsUrl = new URL("/robots.txt", url.origin).href;
    const robots = await safeFetch(robotsUrl, {
      policyPurpose: "robots",
      maxBytes: 512 * 1024,
      timeout: 8000,
      maxRedirects: 2,
    });
    if (
      ![404, 410].includes(robots.status) &&
      (!robots.ok ||
        !/^text\/plain(?:;|$)/i.test(
          robots.headers.get("content-type") || "",
        ) ||
        !robotsAllows(await robots.text(), url.href))
    )
      throw integrationError(
        "El sitio no permite esta lectura automatizada o no se pudo verificar robots.txt. El enlace se conserva sin leer.",
        403,
      );
  }
  const body = options.body;
  const headers = {
    "user-agent": "kompass/1.0 (public editorial feed reader)",
    accept: "*/*",
    ...options.headers,
  };
  const response = await new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: options.method || "GET",
        headers,
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions?.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
      },
      (incoming) => {
        const chunks = [];
        let size = 0;
        if (Number(incoming.headers["content-length"]) > maxBytes) {
          incoming.destroy();
          request.destroy();
          reject(integrationError("La respuesta supera el tamaño permitido."));
          return;
        }
        incoming.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            incoming.destroy();
            request.destroy();
            reject(
              integrationError("La respuesta supera el tamaño permitido."),
            );
          } else chunks.push(chunk);
        });
        incoming.on("error", () =>
          reject(integrationError("No se pudo leer la respuesta remota.")),
        );
        incoming.on("end", () => {
          const status = incoming.statusCode || 502;
          resolve(
            new Response(
              [204, 205, 304].includes(status) ? null : Buffer.concat(chunks),
              { status, headers: incoming.headers },
            ),
          );
        });
      },
    );
    const timer = setTimeout(
      () =>
        request.destroy(
          integrationError("El proveedor agotó el tiempo de espera.", 504),
        ),
      timeout,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", (error) =>
      reject(
        error.status
          ? error
          : integrationError("No se pudo conectar con el proveedor remoto."),
      ),
    );
    if (body) request.write(body);
    request.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (!maxRedirects || (options.method && options.method !== "GET"))
      throw integrationError(
        "El proveedor redirigió la solicitud; revisa su URL.",
      );
    const location = response.headers.get("location");
    if (!location)
      throw integrationError(
        "El proveedor devolvió una redirección sin destino.",
      );
    const redirectUrl = new URL(location, url).href;
    if (options.validateRedirect) await options.validateRedirect(redirectUrl);
    const redirectHeaders = { ...options.headers };
    for (const name of Object.keys(redirectHeaders))
      if (/authorization|cookie|secret/i.test(name))
        delete redirectHeaders[name];
    const redirected = await safeFetch(redirectUrl, {
      ...options,
      headers: redirectHeaders,
      maxRedirects: maxRedirects - 1,
    });
    Object.defineProperty(redirected, "accessTrail", {
      value: Object.freeze([
        url.href,
        ...(redirected.accessTrail || [redirectUrl]),
      ]),
      configurable: true,
    });
    return redirected;
  }
  Object.defineProperty(response, "accessTrail", {
    value: Object.freeze([url.href]),
    configurable: true,
  });
  return response;
}

export function getAiConfig(brandId) {
  return resolveAiConfig(getSecret(brandId, "ai"));
}

// Responses API by default; Google's documented compatibility endpoint uses
// Chat Completions. Select by the exact official base, never a hostname suffix.
// Credentials remain server-side and both transports use the same access gate.
export async function generateStructured(
  brandId,
  { name, schema, instructions, input, image },
  { fetcher = safeFetch } = {},
) {
  const config = getAiConfig(brandId);
  if (!config) return null;
  assertAiProviderAllowed(config.baseUrl);
  if (
    image &&
    !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)
  )
    throw integrationError(
      "Aporta una imagen propia; no se envían URLs de medios de terceros al proveedor de IA.",
      403,
    );
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const gemini =
    baseUrl === "https://generativelanguage.googleapis.com/v1beta/openai";
  const inputText = String(input).slice(0, 60000);
  const content = [{ type: "input_text", text: inputText }];
  if (image)
    content.push({ type: "input_image", image_url: image, detail: "auto" });
  const response = await fetcher(
    `${baseUrl}/${gemini ? "chat/completions" : "responses"}`,
    {
      requireHttps: true,
      policyPurpose: "ai",
      maxRedirects: 0,
      timeout: 60000,
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        gemini
          ? {
              model: config.model,
              // Google's default thinking can exceed an interactive request's
              // deadline; low is supported by its documented compatibility API.
              reasoning_effort: "low",
              messages: [
                { role: "system", content: instructions },
                {
                  role: "user",
                  content: [
                    { type: "text", text: inputText },
                    ...(image
                      ? [{ type: "image_url", image_url: { url: image } }]
                      : []),
                  ],
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: { name, strict: true, schema },
              },
            }
          : {
              model: config.model,
              store: false,
              instructions,
              input: [{ role: "user", content }],
              text: {
                format: { type: "json_schema", name, strict: true, schema },
              },
            },
      ),
    },
  );
  if (!response.ok)
    throw integrationError(
      `El proveedor de IA rechazó la solicitud (HTTP ${response.status}). Revisa la clave, modelo y cuota.`,
      502,
    );
  let result;
  try {
    result = await response.json();
  } catch {
    throw integrationError(
      "El proveedor de IA devolvió una respuesta inválida.",
      502,
    );
  }
  try {
    const choice = gemini ? result?.choices?.[0] : null;
    if (
      gemini &&
      (choice?.finish_reason !== "stop" ||
        choice?.message?.refusal ||
        choice?.message?.tool_calls?.length ||
        typeof choice?.message?.content !== "string")
    )
      throw new Error();
    const output = gemini
      ? choice.message.content
      : result.output_text ||
        result.output
          ?.flatMap((item) => item.content || [])
          .filter((item) => item.type === "output_text")
          .map((item) => item.text)
          .join("");
    const value = JSON.parse(output);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw integrationError(
      "La IA no devolvió el contenido estructurado esperado. No se guardaron resultados inventados.",
      502,
    );
  }
}

export async function configureIntegrations(brandId, input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["ai", "webhook"].includes(key))
  )
    throw integrationError(
      "La configuración contiene un conector no disponible.",
    );
  // Validate the whole request before saving any setting.
  const changes = {};
  if (input.ai !== undefined) {
    if (
      input.ai !== null &&
      (typeof input.ai !== "object" || Array.isArray(input.ai))
    )
      throw integrationError("La configuración de IA debe ser un objeto.");
    if (input.ai?.usePlatform === true) {
      if (Object.keys(input.ai).some((key) => key !== "usePlatform"))
        throw integrationError(
          "Usar la IA de la plataforma no admite ajustes adicionales.",
        );
      changes.ai = null;
    } else if (input.ai === null || input.ai.disabled)
      changes.ai = { disabled: true };
    else {
      const previous = getSecret(brandId, "ai") || {};
      const apiKey = String(input.ai.apiKey || previous.apiKey || "").trim();
      if (!apiKey)
        throw integrationError(
          "Introduce una API key de IA o desactiva el conector.",
        );
      const baseUrl = String(
        input.ai.baseUrl || previous.baseUrl || "https://api.openai.com/v1",
      ).replace(/\/$/, "");
      assertAiProviderAllowed(baseUrl);
      await validatePublicUrl(baseUrl, { requireHttps: true });
      changes.ai = {
        apiKey,
        model: String(input.ai.model || previous.model || "gpt-4.1-mini").slice(
          0,
          100,
        ),
        baseUrl,
      };
    }
  }
  if (input.webhook !== undefined) {
    if (input.webhook === null) changes.webhook = null;
    else {
      const previous = getSecret(brandId, "webhook") || {};
      const url = String(input.webhook.url || previous.url || "");
      assertWebhookAllowed(url);
      await validatePublicUrl(url, { requireHttps: true });
      changes.webhook = {
        url,
        secret: String(input.webhook.secret || previous.secret || ""),
      };
    }
  }
  for (const [key, value] of Object.entries(changes))
    setSecret(brandId, key, value);
  return publicIntegrations(brandId);
}

function publicationDestination(brand, piece) {
  const webhook = getSecret(brand.id, "webhook");
  let destination = null;
  // Never redirect a saved piece from a removed channel to another connector.
  if (piece.channel !== "telegram" && webhook?.url) {
    const url = new URL(webhook.url);
    const parametersHidden = !!(url.search || url.hash);
    url.search = "";
    url.hash = "";
    destination = { provider: "webhook", url: url.href, parametersHidden };
  }
  // Opaque confirmation token: a settings change invalidates an open dialog.
  const destinationKey = destination
    ? createHash("sha256").update(JSON.stringify(webhook)).digest("base64url")
    : null;
  return { webhook, destination, destinationKey };
}

export function getPublicationState(brand, piece) {
  const current = publicationDestination(brand, piece);
  const journal = getSecret(brand.id, `publication:${piece.id}`);
  const receipt = publicPublicationReceipt(
    journal?.receipt || piece.publicationReceipt,
  );
  const status = receipt
    ? "delivered"
    : ["sending", "uncertain", "failed"].includes(journal?.status)
      ? journal.status
      : "ready";
  return {
    status,
    destination:
      receipt?.provider === "legacy"
        ? null
        : (["sending", "uncertain", "delivered"].includes(status) &&
            (journal?.destination?.provider === "webhook"
              ? journal.destination
              : receipt?.destination)) ||
          current.destination,
    destinationKey: current.destinationKey,
    ...(piece.channel === "telegram"
      ? {
          unavailableReason:
            "Este canal ya no está disponible. Elige otro canal y vuelve a aprobar la pieza antes de enviarla.",
        }
      : {}),
    ...(receipt ? { receipt } : {}),
    ...(piece.publicationError ? { error: piece.publicationError } : {}),
  };
}

const publicationLocks = new Set();
export async function publishPiece(brand, value, options = {}) {
  const key = `${brand.id}:${value.id}`;
  if (publicationLocks.has(key))
    throw integrationError("Esta pieza ya se está enviando.", 409);
  publicationLocks.add(key);
  try {
    const piece = getRecord(brand.id, "pieces", value.id);
    if (!piece) throw integrationError("Pieza no encontrada.", 404);
    if (piece.channel === "telegram")
      throw integrationError(
        "Este canal ya no está disponible. Elige otro canal y vuelve a aprobar la pieza antes de enviarla.",
        409,
      );
    if (piece.status === "published" && piece.publicationReceipt) return piece;
    if (!["approved", "scheduled"].includes(piece.status))
      throw integrationError("Aprueba la pieza antes de publicarla.", 409);
    const deliveryKey = `publication:${piece.id}`;
    const previous = getSecret(brand.id, deliveryKey);
    if (["sending", "uncertain"].includes(previous?.status))
      throw integrationError(
        "El envío anterior no está confirmado. Comprueba el destino antes de intentar otro envío.",
        409,
      );
    if (previous?.status === "delivered")
      return saveRecord(brand.id, "pieces", {
        ...piece,
        status: "published",
        publishedAt: previous.receipt.publishedAt,
        publicationReceipt: previous.receipt,
        publicationError: undefined,
      });
    const { webhook, destination } = publicationDestination(brand, piece);
    if (!webhook?.url)
      throw integrationError(
        "Conecta un webhook de publicación. Puedes exportar la pieza mientras tanto.",
        409,
      );
    assertWebhookAllowed(webhook.url);
    const reference =
      piece.referenceId && getRecord(brand.id, "references", piece.referenceId);
    if (reference)
      assertReferenceUseAllowed(
        reference,
        reference.sourceId &&
          getRecord(brand.id, "sources", reference.sourceId),
      );
    const idempotencyKey = createHash("sha256")
      .update(`${brand.id}:${piece.id}`)
      .digest("hex");
    setSecret(brand.id, deliveryKey, {
      status: "sending",
      startedAt: new Date().toISOString(),
      idempotencyKey,
      destination,
    });
    let receipt;
    try {
      const response = await (options.fetcher || safeFetch)(webhook.url, {
        method: "POST",
        policyPurpose: "webhook",
        maxRedirects: 0,
        requireHttps: true,
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          ...(webhook.secret
            ? { authorization: `Bearer ${webhook.secret}` }
            : {}),
        },
        body: JSON.stringify({
          event: "piece.publish",
          idempotencyKey,
          brand: { id: brand.id, name: brand.name },
          piece,
        }),
      });
      if (!response.ok) {
        const definitelyRejected =
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408;
        const error = integrationError(
          definitelyRejected
            ? `El webhook rechazó la pieza (HTTP ${response.status}).`
            : `El webhook respondió HTTP ${response.status}. No se pudo confirmar el envío; comprueba el destino antes de repetirlo.`,
          502,
        );
        error.definitelyRejected = definitelyRejected;
        throw error;
      }
      receipt = {
        provider: "webhook",
        status: response.status,
        requestId: response.headers.get("x-request-id") || idempotencyKey,
        destination,
        publishedAt: new Date().toISOString(),
      };
      setSecret(brand.id, deliveryKey, {
        status: "delivered",
        receipt,
        idempotencyKey,
        destination,
      });
    } catch (error) {
      setSecret(brand.id, deliveryKey, {
        status: error.definitelyRejected ? "failed" : "uncertain",
        idempotencyKey,
        destination,
      });
      const current = getRecord(brand.id, "pieces", piece.id) || piece;
      saveRecord(brand.id, "pieces", {
        ...current,
        publicationError: error.message,
      });
      throw error;
    }
    const current = getRecord(brand.id, "pieces", piece.id) || piece;
    const saved = saveRecord(brand.id, "pieces", {
      ...current,
      status: "published",
      publishedAt: receipt.publishedAt,
      publicationReceipt: receipt,
      publicationError: undefined,
    });
    addActivity(
      brand.id,
      `Publicada «${piece.title}» mediante ${receipt.provider}.`,
    );
    return saved;
  } finally {
    publicationLocks.delete(key);
  }
}
