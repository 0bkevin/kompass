import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicContentText,
  inspectPublicContentText,
  PUBLIC_CONTENT_ISSUE_CODES,
} from "../server/content-privacy.mjs";

function rejected(text, issue) {
  const report = inspectPublicContentText(text);
  assert.equal(report.allowed, false, `Should reject: ${text}`);
  assert.ok(
    report.issues.includes(issue),
    `${issue}: ${JSON.stringify(report)}`,
  );
  assert.throws(
    () => assertPublicContentText(text, "Referencia"),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "PUBLIC_CONTENT_PRIVACY");
      assert.deepEqual(error.issues, report.issues);
      assert.match(error.message, /^Referencia:/);
      assert.ok(!error.message.includes(text));
      return true;
    },
  );
}

test("contacts are found in public text, Unicode variants and formatted numbers", () => {
  for (const text of [
    "Escribir a editorial.persona@example.test.",
    "<a href='mailto:persona+publica@example.test'>Contacto</a>",
    "persona＠example．test",
    "per\u200Bsona@example.test",
  ])
    rejected(text, "contact_email");
  for (const text of [
    "Contacto: +34 612 345 678",
    "Teléfono: 612345678",
    "WhatsApp 04141234567",
    '{"phone":"5551234"}',
    "Se puede llamar al (212) 555-0199.",
    "Disponible en 612 345 678.",
    "Llamar al 212-555-0199",
  ])
    rejected(text, "contact_phone");
});

test("personal identifiers need an explicit label or a distinctive identifier shape", () => {
  for (const text of [
    "DNI: 12345678Z",
    "Cédula: V-12345678",
    "Pasaporte: AB1234567",
    "SSN: 123-45-6789",
    "CURP: ABCD001231HDFXYZ09",
    "ID de persona: cliente-0042",
    '{"personId":"persona-0042"}',
    '{"userId":"usuario-0042"}',
    "Fecha de nacimiento: 2000-12-31",
    "Dirección personal: Calle de ejemplo 5",
    "DNI\tTema\n12345678Z\tAprendizaje",
    "| customer_id | necesidad |\n| --- | --- |\n| 0042 | Aprender |",
    "El identificador aportado es X1234567L.",
    "Cuenta bancaria: ES91 2100 0418 4502 0005 1332",
  ])
    rejected(text, "personal_identifier");
});

test("individual dossiers are detected in labelled text, nested JSON and tables", () => {
  for (const text of [
    "Nombre completo: Persona de ejemplo",
    "Nombre: Persona ficticia; Edad: 35; Necesidad: ventas",
    "Contacto: Persona ficticia; Respuesta: necesita formación",
    '{"record":{"fullName":"Persona de ejemplo","jobTitle":"Editora"}}',
    '{"nombre":"Persona de ejemplo","edad":35}',
    "- **Nombre completo:** Persona de ejemplo\n- Cargo: Editora",
    "Paciente: Persona ficticia; Diagnóstico: consulta de ejemplo",
    "Ficha individual\nNombre: Persona ficticia\nNecesidad: formación",
    "name,age,need\nPersona ficticia,35,Aprender",
    "| nombre | cargo | necesidad |\n| --- | --- | --- |\n| Persona ficticia | Editora | Aprender |",
    "nombre\tcargo\n<NOMBRE>\t<CARGO>\nPersona ficticia\tEditora",
  ])
    rejected(text, "individual_record");
});

test("credentials are rejected without reading the operator environment", () => {
  for (const text of [
    "OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345",
    "Usar sk-abc123def456ghi789jkl012mno345",
    "API key: abc123def456ghi789jkl012",
    "AWS_SECRET_ACCESS_KEY=abc123def456ghi789jkl012",
    "DB_PASSWORD=SoloPruebas42",
    "access_token=abc123def456ghi789jkl012",
    "Contraseña: Ejemplo-Sintetico-42",
    '{"config":{"password":"hunter2"}}',
    "Authorization: Bearer abc123def456ghi789jkl012",
    "Basic YWxndWllbjpjbGF2ZV9maWN0aWNpYQ==",
    "-----BEGIN PRIVATE KEY-----\nmaterial de prueba\n-----END PRIVATE KEY-----",
    "ghp_abc123def456ghi789jkl012mno345",
    "AIzaSyAbc123Def456Ghi789Jkl012Mno345Pqr",
    "AKIAABCDEFGHIJKLMNOP",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaWN0aWNpbyJ9.abc123def456ghi789jkl012",
  ])
    rejected(text, "possible_credential");
});

test("encoded citation contacts, nested fields and URL credentials cannot bypass local inspection", () => {
  for (const url of [
    "https://example.test/read?email=persona%2540example.test",
    "https://example.test/read?x=%ZZ&email=persona%40example.test",
    "https://example.test/contact/name/Persona%20Ficticia",
    "https://example.test/read?personId=0042",
    "https://example.test/read?record=%7B%22full_name%22%3A%22Persona%20Ficticia%22%7D",
    "https://example.test/phone/612345678",
  ])
    rejected(`Fuente pública: ${url}`, "personal_identifier");
  for (const url of [
    "https://user:password@example.test/article",
    "https://example.test/read?access_token=abc123def456ghi789",
    "https://example.test/read?access%255Ftoken=abc123def456ghi789",
    "https://example.test/read?record=%7B%22password%22%3A%22hunter2%22%7D",
  ])
    rejected(`Fuente pública: ${url}`, "possible_credential");
});

test("JSON provider inputs expose embedded strings before inspection, including escaped labels", () => {
  for (const [text, issue] of [
    ["DNI: 12345678", "personal_identifier"],
    ["Nombre: Persona ficticia\nCargo: Editora", "individual_record"],
    ["password: PruebaSintetica42", "possible_credential"],
    ["Teléfono: 612345678", "contact_phone"],
  ])
    rejected(
      JSON.stringify({ reference: { title: "Referencia", text } }),
      issue,
    );
  rejected(
    '{"reference":{"text":"DNI\\u003a 12345678"}}',
    "personal_identifier",
  );
});

test("dates, business figures, public citations and essential copy stay usable", () => {
  for (const text of [
    "Publicado el 2026-10-18 a las 12:34:56Z; revisión 18/10/2026.",
    "2026-10-18T12:34:56.789Z; 20261018T123456Z; DOI: 10.1234/1234567890",
    "Ingresos: 1234567890 EUR. Ventas: 123 456 789. Crecimiento: 12,5 %.",
    "La empresa facturó 123.456.789 euros y cuenta con 123 456 789 usuarios.",
    "Revenue: +1 234 567 890 USD. Total: 123.456.789.",
    "Teléfono: 2026-10-18",
    "El teléfono se usa para llamar; no guardes emails ni teléfonos de personas.",
    "No compartas contraseñas, credenciales ni fichas individuales.",
    "El guion no debe inventar testimonios, casos ni métricas.",
    "Autor: Ada Lovelace; Cargo: autora de la publicación. Fuente: GDELT Project.",
    "Por @autora_publica. Nombre de empresa: kompass. Sector: edición.",
    "Nombre: kompass\nEmpresa: kompass\nNecesidad: mejorar la edición pública",
    "https://news.ycombinator.com/item?id=1234567890",
    "https://example.test/article/1234567890?date=20261018&author=Ada%20Lovelace",
    "https://www.gdeltproject.org/ · Hacker News · Google Trends",
    "Fecha,Ingresos,Empresa\n2026-10-18,1234567890,kompass",
    "name,company,need\nkompass,kompass,Edición pública",
    "OPENAI_API_KEY=<TU_CLAVE>\npassword: <PASSWORD>\naccess_token: [REDACTED]",
    "API key: process.env.OPENAI_API_KEY\nAuthorization: Bearer <TOKEN>",
    "Authorization: Bearer YOUR_TOKEN_HERE\npassword: string",
    '{"fullName":"<NOMBRE>","jobTitle":"<CARGO>"}',
    "| full name | age |\n| --- | --- |\n| <NOMBRE> | <EDAD> |",
    "Texto original con tildes, espacios y saltos.\nSegunda línea.",
    "",
  ]) {
    assert.deepEqual(
      inspectPublicContentText(text),
      { allowed: true, issues: [] },
      text,
    );
    assert.equal(assertPublicContentText(text), text);
  }
});

test("reports and errors contain stable unique codes rather than sensitive values", () => {
  const text =
    "Nombre completo: Persona ficticia\nCorreo: persona@example.test\nTeléfono: +34 612 345 678\nDNI: 12345678Z\npassword: hunter2";
  const report = inspectPublicContentText(text);
  assert.deepEqual(report.issues, PUBLIC_CONTENT_ISSUE_CODES.slice(1));
  assert.equal(report.allowed, false);
  assert.doesNotMatch(
    JSON.stringify(report),
    /persona@example|612|12345678Z|hunter2/,
  );
  assert.throws(
    () => assertPublicContentText(text),
    (error) => {
      assert.doesNotMatch(
        JSON.stringify(error),
        /persona@example|612|12345678Z|hunter2/,
      );
      assert.doesNotMatch(
        error.message,
        /persona@example|612|12345678Z|hunter2/,
      );
      return true;
    },
  );
  report.issues.length = 0;
  assert.equal(inspectPublicContentText(text).allowed, false);
});

test("non-text inputs are rejected explicitly instead of stringifying binary files or records", () => {
  for (const input of [
    undefined,
    null,
    1234567890,
    false,
    {},
    [],
    Buffer.from("persona@example.test"),
  ]) {
    assert.deepEqual(inspectPublicContentText(input), {
      allowed: false,
      issues: ["invalid_text"],
    });
    assert.throws(() => assertPublicContentText(input), {
      status: 400,
      code: "PUBLIC_CONTENT_PRIVACY",
    });
  }
});

test("the documented heuristic cannot classify free names or look inside media", () => {
  assert.equal(
    inspectPublicContentText("Ada Lovelace presenta un tema editorial.")
      .allowed,
    true,
  );
  // Deliberately ambiguous without contact context: it could be a company total.
  assert.equal(inspectPublicContentText("1234567890").allowed, true);
  assert.equal(
    inspectPublicContentText("Archivo adjunto: retrato.png").allowed,
    true,
  );
});

test("long text is inspected through its suffix without treating ambiguous prose as a contact", () => {
  const longText = "a".repeat(80_000);
  assert.equal(inspectPublicContentText(longText).allowed, true);
  assert.equal(inspectPublicContentText(`${longText}@invalid`).allowed, true);
  assert.equal(
    inspectPublicContentText(`${longText}\nEditorial: persona@example.test`)
      .allowed,
    false,
  );
  rejected(`${longText}\npassword: PruebaDeSufijo42`, "possible_credential");
});
