import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "../..");
const directory = path.join(root, "docs/remediation");
const read = (file) => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
const write = (file, data) => fs.writeFileSync(path.join(directory, file), data);
const assignments = read("assignments.json");
const resolutions = read("results.json");
assert.equal(assignments.length, 25);
assert.equal(new Set(assignments.map((item) => item.agent)).size, 25);
assert.deepEqual(Object.keys(resolutions).sort(), assignments.map((item) => item.id).sort());
const validation = read("validation.json");
assert.equal(validation.tests.exitCode, 0, "La suite conjunta debe aprobarse");
assert.equal(validation.tests.fail, 0);
assert.equal(validation.tests.cancelled, 0);
assert.equal(validation.tests.skipped, 0);
assert.equal(validation.tests.pass, validation.tests.tests);
assert.equal(validation.build.exitCode, 0, "Build y TypeScript deben aprobarse");
assert.equal(validation.browser.status, "PASS", "Falta recorrido integrado en navegador");

function filesUnder(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : entry.isFile() ? [relative] : [];
  });
}
function digest(files) {
  const hash = createHash("sha256");
  const byPathComponents = (left, right) => {
    const a = left.split("/"), b = right.split("/");
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
    }
    return a.length - b.length;
  };
  for (const file of files.sort(byPathComponents)) {
    hash.update(file + "\0");
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update("\0");
  }
  return { files: files.length, sha256: hash.digest("hex") };
}
assert.deepEqual(digest([
  ...["src", "server", "tests"].flatMap(filesUnder),
  "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
]), validation.implementation, "El código cambió después de validar");
assert.deepEqual(digest(filesUnder("dist")), validation.productionBuild, "El build cambió después del recorrido");

const baseline = read("audit-baseline.json");
for (const [file, digest] of Object.entries(baseline)) {
  const actual = createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
  assert.equal(actual, digest, `Se modificó el original adversarial ${file}`);
}

const issues = assignments.map((assignment) => {
  const report = JSON.parse(fs.readFileSync(path.join(root, assignment.report), "utf8"));
  assert.equal(report.issueId, assignment.id);
  assert.equal(report.agent.replace(/^\/root\//, ""), assignment.agent);
  assert.equal(report.status, "fixed", `No está resuelto ${assignment.id}`);
  assert.ok(report.verification.length && report.changes.length);
  for (const file of report.artifacts || [])
    assert.ok(fs.existsSync(path.resolve(root, file)), `Falta evidencia ${file}`);
  return { ...assignment, status: "verified", resolution: resolutions[assignment.id], reportDetails: report };
});

const summary = {
  completedAt: new Date().toISOString(),
  distinctIssues: issues.length,
  originalFindings: issues.flatMap((issue) => issue.members).length,
  independentFixAgents: new Set(issues.map((issue) => issue.agent)).size,
  originalAuditPreserved: { files: Object.keys(baseline).length, sha256Verified: true },
  validation,
  issues,
};
write("summary.json", JSON.stringify(summary, null, 2) + "\n");
write("assignments.json", JSON.stringify(issues.map(({ reportDetails, resolution, ...assignment }) => assignment), null, 2) + "\n");

const cell = (value) => String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
const markdown = [
  "# Correcciones de la revisión adversarial",
  "",
  `${summary.distinctIssues} defectos resueltos por ${summary.independentFixAgents} agentes distintos. Cubren los ${summary.originalFindings} hallazgos originales; la duplicación de referencias apareció en dos revisiones y tiene un único responsable. Los informes adversariales anteriores se mantienen como evidencia histórica.`,
  "",
  `La suite integrada aprobó ${validation.tests.pass}/${validation.tests.tests} pruebas (${validation.tests.fail} fallos, ${validation.tests.cancelled} canceladas). Build Vite y TypeScript aprobados. La línea base tenía 170 pruebas; los informes individuales conservan las reproducciones rojas y sus comprobaciones posteriores.`,
  "",
  `Se verificó por SHA-256 que los ${summary.originalAuditPreserved.files} archivos de la auditoría original permanecen intactos.`,
  "",
  "## Responsables y resultados",
  "",
  "| Punto | Responsable independiente | Corrección comprobada |",
  "| --- | --- | --- |",
  ...issues.map((issue) => `| [${issue.id}](reports/${issue.id}.md) | ${cell(issue.agent)} | ${cell(issue.resolution)} |`),
  "",
  "## Verificación integrada",
  "",
  ...validation.browser.checks.map((check) => `- ${check}`),
  "",
  "Los comandos, resultados y artefactos conjuntos están en [validation.json](validation.json). Cada informe por punto conserva pruebas, capturas y límites específicos. Las expectativas anteriores ajustadas explícitamente están en [CONTRACTS.md](CONTRACTS.md).",
  "",
  "## Límites de la comprobación",
  "",
  "La lectura real de NASA se comprobó por separado. Las pruebas de publicación y proveedores de pago usan transportes controlados; no acreditan entrega externa, precisión de modelos, costos reales ni resultados comerciales. La activación de cada proveedor requiere sus credenciales y permisos. El crecimiento exige historia comparable, y los resultados siguen siendo registros manuales identificados como tales.",
  "",
  "La detección de fichas/contactos es estructural; no identifica universalmente nombres en prosa libre. El saneamiento de lecturas históricas no equivale a un borrado físico de datos previos. Los datos de las pruebas son sintéticos.",
  "",
];
write("SUMMARY.md", markdown.join("\n"));
console.log(JSON.stringify({ issues: issues.length, agents: summary.independentFixAgents, tests: validation.tests, auditPreserved: summary.originalAuditPreserved }));
