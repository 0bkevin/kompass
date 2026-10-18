import { Buffer } from "node:buffer";
import {
  containsAudienceContactDetails,
  containsIndividualAudienceRecord,
} from "./aggregate-privacy.mjs";

function decodedUrlText(value) {
  let text = value.normalize("NFKC");
  while (true) {
    // Decode valid byte runs independently: a malformed escape elsewhere must
    // not hide an encoded contact. Each decoding reduces the remaining escapes,
    // so nested encodings are inspected without a bypass at a depth limit.
    const decoded = text
      .replace(/(?:%[0-9a-f]{2})+/gi, (bytes) =>
        Buffer.from(bytes.replace(/%/g, ""), "hex").toString("utf8"),
      )
      .normalize("NFKC");
    if (decoded === text)
      return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    text = decoded;
  }
}

function fieldName(value) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.\[\]-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const CONTACT_FIELD =
  /^(?:contact|contacto|lead|participant|participante|patient|paciente|student|alumno)$/;
const PHONE_FIELD =
  /(?:^| )(?:phone|telephone|telefono|tel|mobile|movil|celular|whatsapp|fax)(?: |$)/;
const PERSONAL_IDENTITY_FIELD =
  /^(?:(?:contact|contacto|person|persona|patient|paciente|participant|participante|lead) (?:id|identifier|identificador|name|nombre)|(?:nombre|id|identificador) (?:de )?(?:contacto|persona)|person name|dni|cedula|ssn|passport|pasaporte|documento de identidad)$/;
const FUNCTIONAL_VALUE =
  /^(?:0|1|true|false|yes|no|on|off|enabled|disabled|form|public|private|support|sales|info|asc|desc)$/i;

// This is a local inspection of citation text, not a fetch or an assertion
// that the public page was read. Generic numeric content IDs and @handles are
// not contact details. Names require explicit personal/contact field context.
export function containsUrlContactDetails(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const text = decodedUrlText(value);
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) return true;

  // Lookahead retains overlapping path fields and nested query/record fields.
  const fields = [
    ...text.matchAll(
      /(?=(?:^|[/?#&;=,{])\s*["']?([a-z][a-z0-9_.\[\] -]{0,60})["']?\s*(?:=|:|\/)\s*([^/?#&;{}]+))/gi,
    ),
  ]
    .map((match) => ({
      name: fieldName(match[1]),
      value: match[2].replace(/\+/g, " ").replace(/^[\s"']+|[\s"']+$/g, ""),
    }))
    .filter((field) => field.value && !FUNCTIONAL_VALUE.test(field.value));

  for (const field of fields) {
    if (
      (PHONE_FIELD.test(field.name) || CONTACT_FIELD.test(field.name)) &&
      containsAudienceContactDetails(field.value)
    )
      return true;
    if (PERSONAL_IDENTITY_FIELD.test(field.name)) return true;
    // The contact label supplies personal context; an unqualified `name` or
    // public author/company name is deliberately not guessed from its words.
    if (
      CONTACT_FIELD.test(field.name) &&
      /^[a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*)+$/i.test(field.value)
    )
      return true;
  }

  return containsIndividualAudienceRecord(
    fields.map((field) => `${field.name}: ${field.value}`).join("\n"),
  );
}
