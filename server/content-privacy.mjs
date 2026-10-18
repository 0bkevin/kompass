import { Buffer } from "node:buffer";
import { containsIndividualAudienceRecord } from "./aggregate-privacy.mjs";
import { containsUrlContactDetails } from "./url-privacy.mjs";

export const PUBLIC_CONTENT_ISSUE_CODES = Object.freeze([
  "invalid_text",
  "contact_email",
  "contact_phone",
  "personal_identifier",
  "individual_record",
  "possible_credential",
]);

function normalizedText(value) {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

function jsonStringValues(value) {
  if (!/^\s*[{[]/.test(value)) return "";
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return "";
  }
  const pending = [parsed];
  const strings = [];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "string") strings.push(current);
    else if (current && typeof current === "object") {
      for (const item of Object.values(current)) pending.push(item);
    }
  }
  return strings.join("\n");
}

function fieldText(value) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\*\*/g, "")
    .replace(/^\s*(?:[-*>]+|\d+[.)])\s+/gm, "")
    .toLowerCase();
}

const PLACEHOLDER =
  /^(?:<[^>]+>|\[[^\]]+\]|\$\{[^}]+\}|(?:process\.)?env\.[\w.]+|(?:your|tu|su|example|ejemplo|insert|replace)_(?:api_key|token|secret|password|clave|credencial)(?:_here)?|redacted|removed|omitid[oa]|ocult[oa]|placeholder|string(?:schema)?|undefined|null|true|false|x{3,}|\*{3,})$/i;

function concreteValue(value, minLength = 1) {
  const trimmed = value.trim();
  return trimmed.length >= minLength && !PLACEHOLDER.test(trimmed);
}

function* tableRows(text, relevantHeader) {
  let headers;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      headers = undefined;
      continue;
    }
    const cells = line.split(/[|,;\t]/).map((cell) => cell.trim());
    const names = cells.map((cell) =>
      fieldText(cell)
        .replace(/^["']|["']$/g, "")
        .trim(),
    );
    if (!headers && names.length > 1 && relevantHeader(names)) {
      headers = names;
    } else if (headers && cells.length === headers.length) {
      yield headers.map((name, column) => ({
        name,
        value: cells[column].replace(/^:?-{2,}:?$/, ""),
      }));
    }
  }
}

// Inspect explicit labels and table headers. Unlabelled names and public author
// attributions are deliberately left alone; this is not a person classifier.
function hasIndividualRecord(text, fields) {
  const describePerson = (values) => {
    const concrete = values.filter(({ value }) => concreteValue(value));
    if (
      containsIndividualAudienceRecord(
        concrete.map(({ name, value }) => `${name}: ${value}`).join("\n"),
      )
    )
      return true;
    return (
      concrete.some(({ name }) =>
        /^(?:patient|paciente|persona|person|contacto|contact|alumno|student)$/.test(
          name,
        ),
      ) &&
      concrete.some(({ name }) =>
        /^(?:diagnostico|diagnosis|tratamiento|treatment|historial clinico|domicilio|salario)$/.test(
          name,
        ),
      )
    );
  };
  if (describePerson(fields)) return true;
  if (
    fields.some(({ value }) => concreteValue(value)) &&
    /(?:^|\n)\s*(?:ficha|perfil|registro|fila|expediente)\s+(?:individual|personal)(?:\s*[:=]|\s*$)/im.test(
      fieldText(text),
    )
  )
    return true;
  for (const row of tableRows(text, (names) =>
    describePerson(names.map((name) => ({ name, value: "dato" }))),
  )) {
    if (describePerson(row)) return true;
  }
  return false;
}

const PERSONAL_FIELD =
  /^(?:dni|nie|cedula|ssn|curp|rut|run|passport|pasaporte|documento(?: de identidad)?|numero de documento|identificador personal|(?:personal|national|tax|social security) (?:id|number)|(?:id|identificador|numero) (?:de )?(?:persona|contacto|cliente|paciente|alumno|empleado|usuario|participante)|(?:person|contact|customer|patient|student|employee|user|participant) (?:id|identifier)|fecha de nacimiento|date of birth|dob|iban|cuenta bancaria|bank account|(?:credit card|tarjeta(?: de credito)?) (?:number|numero)|direccion personal|domicilio particular|home address)$/;

function labelledValues(text) {
  const lines = text
    .replace(/\*\*/g, "")
    .replace(/^\s*(?:[-*>]+|\d+[.)])\s+/gm, "");
  return [
    ...lines.matchAll(
      /(?=(?:^|[\n\r;|,{?&])\s*["']?([a-z][a-z0-9 _.\[\]-]{0,60})["']?\s*[:=]\s*(?:"([^"\n]{1,512})"|'([^'\n]{1,512})'|([^\n;|,}&]{1,512})))/gi,
    ),
  ].map((match) => ({
    name: fieldText(match[1]).replace(/\s+/g, " ").trim(),
    value: (match[2] ?? match[3] ?? match[4]).trim(),
  }));
}

function hasPersonalIdentifier(text, fields) {
  if (
    /(?<![\p{L}\p{N}])(?:\d{8}[a-z]|[xyz]\d{7}[a-z]|\d{3}-\d{2}-\d{4})(?![\p{L}\p{N}])/iu.test(
      text,
    )
  )
    return true;
  if (
    fields.some(
      ({ name, value }) =>
        PERSONAL_FIELD.test(name) &&
        concreteValue(value) &&
        (/\d/.test(value) ||
          /^(?:direccion personal|domicilio particular|home address)$/.test(
            name,
          )),
    )
  )
    return true;

  // A CSV/TSV/Markdown row with an explicit personal identifier is also a
  // record. A generic business/content `id` column is not personal context.
  for (const row of tableRows(text, (names) =>
    names.some((name) => PERSONAL_FIELD.test(name)),
  )) {
    if (
      row.some(
        ({ name, value }) =>
          PERSONAL_FIELD.test(name) && concreteValue(value) && /\d/.test(value),
      )
    )
      return true;
  }
  return false;
}

function phoneNumber(value) {
  const digits = value.replace(/\D/g, "");
  return (
    digits.length >= 7 &&
    digits.length <= 15 &&
    !/^\+?(?:(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2})$/.test(
      value.trim(),
    )
  );
}

function isCompanyTotal(text, match) {
  const before = text.slice(Math.max(0, match.index - 60), match.index);
  const after = text.slice(
    match.index + match[0].length,
    match.index + match[0].length + 45,
  );
  return (
    /(?:[$€£¥]\s*|\b(?:ingresos|facturacion|ventas|revenue|turnover|total|visitas|views|usuarios|users|impresiones|descargas|poblacion|population)\s*[:=]?\s*)$/i.test(
      before,
    ) ||
    /^\s*(?:[$€£¥]|(?:euros?|dolares|usd|eur|gbp|mxn|cop|ars|usuarios|users|personas|people|visitas|views|impresiones|unidades|units|empresas|companies|resultados|descargas)\b)/i.test(
      after,
    )
  );
}

function hasPhone(text) {
  if (
    [
      ...text.matchAll(
        /\b(?:tel(?:efono|ephone)?|phone|mobile|movil|celular|whatsapp|fax)\b\s*["']?\s*(?::|=|es\b|is\b)?\s*["']?\s*(\+?\(?\d[\d ()\t.-]{5,32}\d)/gi,
      ),
    ].some((match) => phoneNumber(match[1]))
  )
    return true;
  if (
    [...text.matchAll(/(?<![\p{L}\p{N}])\+\d[\d ()\t.-]{5,32}\d/gu)].some(
      (match) => phoneNumber(match[0]) && !isCompanyTotal(text, match),
    )
  )
    return true;

  return [
    ...text.matchAll(
      /(?<![\d.,])(?:\(\d{2,4}\)[ \t]*\d{3,4}[ -]\d{3,4}|\d{3}([ .-])\d{3}\1\d{3,4})(?!\d|[.,]\d)/g,
    ),
  ].some((match) => {
    // Grouped company totals must not be classified as contact numbers.
    return !isCompanyTotal(text, match) && phoneNumber(match[0]);
  });
}

const CREDENTIAL_FIELD =
  /^(?:(?:[a-z0-9]+ )*(?:api key|api token|access token|refresh token|client secret|private key|secret access key|access key|secret key|password|contrasena)|secret|token|authorization)$/;
const KNOWN_CREDENTIAL =
  /\b(?:sk-(?:proj-|svcacct-)?[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{30,}|AIza[a-z0-9_-]{30,}|AKIA[A-Z0-9]{16})\b|\beyJ[a-z0-9_-]{8,}\.eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b|-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/i;

function hasCredential(text, fields) {
  return (
    KNOWN_CREDENTIAL.test(text) ||
    [...text.matchAll(/\b(?:Bearer|Basic)\s+([a-z0-9_+/.=-]{12,})/gi)].some(
      (match) => concreteValue(match[1]),
    ) ||
    fields.some(
      ({ name, value }) =>
        CREDENTIAL_FIELD.test(name) &&
        concreteValue(value.replace(/^(?:Bearer|Basic)\s+/i, ""), 6),
    )
  );
}

function decodedUrl(value) {
  let text = value;
  while (true) {
    const decoded = text.replace(/(?:%[0-9a-f]{2})+/gi, (bytes) =>
      Buffer.from(bytes.replace(/%/g, ""), "hex").toString("utf8"),
    );
    if (decoded === text) return normalizedText(text);
    text = decoded;
  }
}

/**
 * Local, heuristic inspection of a string intended for the public editorial
 * corpus. Returns only stable issue codes, never excerpts or detected values.
 * No network, storage, credential lookup, mutation or automatic redaction.
 * `allowed` means no supported pattern was found, not DLP certification.
 * @param {unknown} value
 * @returns {{ allowed: boolean, issues: string[] }}
 */
export function inspectPublicContentText(value) {
  if (typeof value !== "string")
    return { allowed: false, issues: ["invalid_text"] };
  const text = normalizedText(`${value}\n${jsonStringValues(value)}`);
  const fields = labelledValues(text);
  const issues = new Set();
  // Bounded components avoid quadratic backtracking on long uploaded prose.
  if (
    text.includes("@") &&
    /[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]{1,64}@[\p{L}\p{N}](?:[\p{L}\p{N}.-]{0,251}[\p{L}\p{N}])?\.[a-z]{2,63}/iu.test(
      text,
    )
  )
    issues.add("contact_email");
  if (hasPhone(text)) issues.add("contact_phone");
  if (hasPersonalIdentifier(text, fields)) issues.add("personal_identifier");
  if (hasIndividualRecord(text, fields)) issues.add("individual_record");
  if (hasCredential(text, fields)) issues.add("possible_credential");

  for (const [url] of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const decoded = decodedUrl(url);
    if (containsUrlContactDetails(url)) issues.add("personal_identifier");
    if (
      /\/(?:contact|contacto|persona|person|patient|paciente|participant|participante|student|alumno)\/(?:name|nombre|id|identifier|identificador)\/[^/?#&]+/i.test(
        decoded,
      )
    )
      issues.add("personal_identifier");
    if (hasPersonalIdentifier(decoded, labelledValues(decoded)))
      issues.add("personal_identifier");
    if (hasCredential(decoded, labelledValues(decoded)))
      issues.add("possible_credential");
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) issues.add("possible_credential");
    } catch {
      // Malformed citation text is left to the existing URL validator.
    }
  }
  const ordered = PUBLIC_CONTENT_ISSUE_CODES.filter((code) => issues.has(code));
  return { allowed: ordered.length === 0, issues: ordered };
}

/**
 * Returns the original string unchanged or throws HTTP 400 with a fixed code
 * and value-free `issues`. Supply a fixed field label, never user content.
 * Optional/missing fields must be handled by the caller before this assertion.
 * @param {unknown} value
 * @param {string} [label]
 * @returns {string}
 */
export function assertPublicContentText(value, label = "Contenido") {
  const result = inspectPublicContentText(value);
  if (!result.allowed) {
    const message = result.issues.includes("invalid_text")
      ? `${label} debe ser texto.`
      : `${label}: elimina contactos, identificadores personales, fichas individuales o posibles credenciales antes de añadir contenido público.`;
    throw Object.assign(new Error(message), {
      status: 400,
      code: "PUBLIC_CONTENT_PRIVACY",
      issues: result.issues,
    });
  }
  return value;
}
