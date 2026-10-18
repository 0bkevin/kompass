function normalizedText(value) {
  return typeof value === "string"
    ? value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    : "";
}

// These checks find explicit contact details and record structures. They do
// not guess whether an unlabelled proper name belongs to a person or company.
export function containsAudienceContactDetails(value) {
  const text = normalizedText(value);
  return (
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) ||
    /(?:\+\d[\s().-]*)?(?:\d[\s().-]*){9,}/.test(text)
  );
}

const PERSONAL_IDENTITY_FIELDS = new Set([
  "nombre completo",
  "nombres y apellidos",
  "nombre y apellidos",
  "apellidos",
  "persona",
  "full name",
  "first name",
  "last name",
]);
const PERSONAL_ATTRIBUTE_FIELDS = new Set([
  "cargo",
  "edad",
  "profesion",
  "ocupacion",
  "fecha de nacimiento",
  "dni",
  "cedula",
  "documento de identidad",
  "age",
  "job title",
]);
const CONTACT_RECORD_FIELDS = new Set([
  "contacto",
  "lead",
  "alumno",
  "alumna",
  "estudiante",
  "participante",
  "paciente",
  "contact",
  "student",
  "participant",
]);
const AUDIENCE_DETAIL_FIELDS = new Set([
  "necesidad",
  "necesidades",
  "interes",
  "intereses",
  "objetivo",
  "objetivos",
  "problema",
  "respuesta",
  "resultado",
  "empresa",
  "company",
  "need",
  "needs",
]);

function fieldName(value) {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+(?:sintetic[oa]|fictici[oa]|individual|personal)$/, "");
}

function hasAny(fields, candidates) {
  return [...candidates].some((candidate) => fields.has(candidate));
}

function fieldsDescribePerson(fields) {
  if (hasAny(fields, PERSONAL_IDENTITY_FIELDS)) return true;
  const personalAttribute = hasAny(fields, PERSONAL_ATTRIBUTE_FIELDS);
  if ((fields.has("nombre") || fields.has("name")) && personalAttribute)
    return true;
  return (
    hasAny(fields, CONTACT_RECORD_FIELDS) &&
    (personalAttribute || hasAny(fields, AUDIENCE_DETAIL_FIELDS))
  );
}

export function containsIndividualAudienceRecord(value) {
  const text = normalizedText(value);
  const labelled = [
    ...text.matchAll(
      /(?:^|[\n.;|,{])\s*["']?([a-z][a-z _-]{1,45})["']?\s*[:=]\s*\S/g,
    ),
  ];
  const fields = new Set(labelled.map((match) => fieldName(match[1])));
  if (fieldsDescribePerson(fields)) return true;
  const individualRecord =
    /\b(?:ficha|perfil|registro|fila|expediente)\s+(?:individual|personal)\b/.test(
      text,
    );
  if (individualRecord && fields.size > 0) return true;

  // A row of named audience attributes is still an individual record when
  // pasted as CSV/TSV or a Markdown table instead of labelled prose.
  const lines = text.split(/\r?\n/);
  return lines.slice(0, -1).some((line, index) => {
    const cells = line
      .split(/[|,;\t]/)
      .map(fieldName)
      .filter(Boolean);
    return (
      cells.length > 1 &&
      fieldsDescribePerson(new Set(cells)) &&
      lines.slice(index + 1).some((row) => /[a-z0-9]/.test(row))
    );
  });
}

export function assertAggregateAudienceText(value, label = "Texto") {
  if (
    containsAudienceContactDetails(value) ||
    containsIndividualAudienceRecord(value)
  ) {
    const error = new Error(
      `${label}: registra necesidades agregadas del grupo; elimina emails, teléfonos y fichas o datos de personas.`,
    );
    error.status = 400;
    throw error;
  }
  return value;
}
