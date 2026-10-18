import net from "node:net";
import { isPublicAddress } from "./connectors.mjs";
import { containsUrlContactDetails } from "./url-privacy.mjs";

function fail(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

// Local admissibility of citation text only. No DNS lookup or page request is
// made here; an accepted URL does not establish access or that content was read.
export function publicCitationUrl(value, label = "Enlace") {
  if (!value) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} debe ser una URL pública completa.`);
  }
  // URL canonicalizes numeric/encoded IP literals and IDNA. A final DNS root
  // dot must not allow localhost/local/internal names to escape classification.
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example|lan|home|corp|onion)$|(?:^|\.)home\.arpa$/i.test(
      host,
    ) ||
    (net.isIP(host) ? !isPublicAddress(host) : !host.includes("."))
  )
    fail(
      `${label} debe usar HTTP o HTTPS y un dominio público sin credenciales.`,
    );
  if (
    /(?:^|\/)(?:login|signin|sign-in|auth|account)(?:\/|$)/i.test(
      url.pathname,
    ) ||
    [...url.searchParams.keys()].some((key) =>
      /^(?:access_token|token|password|email|session|auth)$/i.test(key),
    ) ||
    containsUrlContactDetails(url.href)
  )
    fail(
      `${label} no puede depender de una sesión ni incluir datos personales.`,
    );
  return url.href;
}
