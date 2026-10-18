import https from "node:https";
import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";
import { createHash, randomBytes } from "node:crypto";
import {
  getRecord,
  saveRecord,
  getSecret,
  setSecret,
  publicIntegrations,
  addActivity,
} from "./db.mjs";

export { publicIntegrations };
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
  const {
    timeout = 12000,
    maxBytes = 3 * 1024 * 1024,
    maxRedirects = 2,
    requireHttps = false,
  } = options;
  const { url, addresses } = await validatePublicUrl(value, { requireHttps });
  const body = options.body;
  const headers = {
    "user-agent": "30XRadar/1.0 (public editorial feed reader)",
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
          integrationError("El proveedor agotó el tiempo de espera."),
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
    return safeFetch(redirectUrl, {
      ...options,
      headers: redirectHeaders,
      maxRedirects: maxRedirects - 1,
    });
  }
  return response;
}

export function getAiConfig(brandId) {
  const stored = getSecret(brandId, "ai");
  if (stored?.disabled) return null;
  const apiKey = stored?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: stored?.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    baseUrl: stored?.baseUrl || "https://api.openai.com/v1",
  };
}

// Plain HTTP Responses API, no browser credentials or client-side API keys.
export async function generateStructured(
  brandId,
  { name, schema, instructions, input, image },
  { fetcher = safeFetch } = {},
) {
  const config = getAiConfig(brandId);
  if (!config) return null;
  const content = [{ type: "input_text", text: String(input).slice(0, 60000) }];
  if (image)
    content.push({ type: "input_image", image_url: image, detail: "auto" });
  const response = await fetcher(
    `${config.baseUrl.replace(/\/$/, "")}/responses`,
    {
      requireHttps: true,
      maxRedirects: 0,
      timeout: 60000,
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: false,
        instructions,
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
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
  const output =
    result.output_text ||
    result.output
      ?.flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("");
  try {
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
  // Validate the whole request before saving any setting.
  const changes = {};
  if (input.ai !== undefined) {
    if (input.ai === null || input.ai.disabled) changes.ai = { disabled: true };
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
  if (input.telegram !== undefined) {
    if (input.telegram === null) changes.telegram = null;
    else {
      const previous = getSecret(brandId, "telegram") || {};
      const botToken = String(
        input.telegram.botToken || previous.botToken || "",
      ).trim();
      const chatId = String(
        input.telegram.chatId || previous.chatId || "",
      ).trim();
      if (
        !/^\d+:[\w-]{20,}$/.test(botToken) ||
        !/^(-?\d+|@[\w_]{4,})$/.test(chatId)
      )
        throw integrationError(
          "Introduce un token de bot y un chatId de Telegram válidos.",
        );
      changes.telegram = {
        botToken,
        chatId,
        inboxSecret: previous.inboxSecret || randomBytes(24).toString("hex"),
      };
    }
  }
  if (input.webhook !== undefined) {
    if (input.webhook === null) changes.webhook = null;
    else {
      const previous = getSecret(brandId, "webhook") || {};
      const url = String(input.webhook.url || previous.url || "");
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

export async function telegramRequest(
  config,
  method,
  payload,
  { fetcher = safeFetch } = {},
) {
  const response = await fetcher(
    `https://api.telegram.org/bot${config.botToken}/${method}`,
    {
      method: "POST",
      maxRedirects: 0,
      requireHttps: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw integrationError("Telegram devolvió una respuesta inválida.", 502);
  }
  if (!response.ok || !data.ok) {
    const error = integrationError(
      `Telegram rechazó el envío (HTTP ${response.status}). Comprueba el bot y sus permisos.`,
      502,
    );
    error.definitelyRejected = true;
    throw error;
  }
  return data.result;
}

function publicationDestination(brand, piece) {
  const telegram = getSecret(brand.id, "telegram");
  const webhook = getSecret(brand.id, "webhook");
  const useTelegram =
    piece.channel === "telegram" && telegram?.botToken && telegram?.chatId;
  let destination = null;
  if (useTelegram)
    destination = { provider: "telegram", chatId: telegram.chatId };
  else if (webhook?.url) {
    const url = new URL(webhook.url);
    const parametersHidden = !!(url.search || url.hash);
    url.search = "";
    url.hash = "";
    destination = { provider: "webhook", url: url.href, parametersHidden };
  }
  // Opaque confirmation token: a settings change invalidates an open dialog.
  const destinationKey = destination
    ? createHash("sha256")
        .update(JSON.stringify(useTelegram ? telegram : webhook))
        .digest("base64url")
    : null;
  return { telegram, webhook, useTelegram, destination, destinationKey };
}

function telegramPublicationText(piece) {
  return [piece.title, piece.caption || piece.script, piece.cta]
    .filter(Boolean)
    .join("\n\n");
}

export function getPublicationState(brand, piece) {
  const current = publicationDestination(brand, piece);
  const journal = getSecret(brand.id, `publication:${piece.id}`);
  const receipt = journal?.receipt || piece.publicationReceipt;
  const status = receipt
    ? "delivered"
    : ["sending", "uncertain", "failed"].includes(journal?.status)
      ? journal.status
      : "ready";
  return {
    status,
    destination:
      (["sending", "uncertain", "delivered"].includes(status) &&
        (journal?.destination || receipt?.destination)) || current.destination,
    destinationKey: current.destinationKey,
    ...(current.useTelegram
      ? {
          previewText: telegramPublicationText(piece).slice(0, 4096),
          textTruncated: telegramPublicationText(piece).length > 4096,
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
    const { telegram, webhook, useTelegram, destination } =
      publicationDestination(brand, piece);
    if (!useTelegram && !webhook?.url)
      throw integrationError(
        "Conecta Telegram para ese canal o un webhook de publicación. Puedes exportar la pieza mientras tanto.",
        409,
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
      if (useTelegram) {
        const result = await telegramRequest(
          telegram,
          "sendMessage",
          {
            chat_id: telegram.chatId,
            text: telegramPublicationText(piece).slice(0, 4096),
            disable_web_page_preview: true,
          },
          options,
        );
        if (!Number.isInteger(result?.message_id) || result.message_id <= 0)
          throw integrationError(
            "Telegram no devolvió un recibo de mensaje válido. Comprueba el chat antes de intentar otro envío.",
            502,
          );
        receipt = {
          provider: "telegram",
          messageId: result.message_id,
          chatId: result.chat?.id ?? telegram.chatId,
          destination,
          publishedAt: new Date().toISOString(),
        };
      } else {
        const response = await (options.fetcher || safeFetch)(webhook.url, {
          method: "POST",
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
            response.status >= 400 && response.status < 500 && response.status !== 408;
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
      }
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
