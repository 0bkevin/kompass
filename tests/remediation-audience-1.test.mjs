import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "remediation-audience-1-"),
);
process.env.DATA_DIR = directory;
const { db, getBrand, saveBrand } = await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const { createCoreRouter } = await import("../server/core.mjs");

let server;
let origin;
const valid = () => ({
  id: randomUUID(),
  name: "Operaciones — prueba sintética",
  role: "Responsable de operaciones",
  stage: "Explorando",
  needs: "Comparar herramientas para coordinar al equipo.",
  description: "",
});

function account(audience = []) {
  const user = createUser({
    name: "QA audiencia sintética",
    email: `${randomUUID()}@example.test`,
    passwordHash: "test-only",
  });
  const brand = saveBrand({ name: "Empresa sintética", audience });
  db.prepare(
    "INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'owner')",
  ).run(brand.id, user.id);
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), user.id, Date.now() + 3_600_000);
  return { brand, cookie: `radar_session=${token}` };
}

async function request(session, body, creating = false) {
  const response = await fetch(
    `${origin}/api/brands${creating ? "" : `/${session.brand.id}`}`,
    {
      method: creating ? "POST" : "PATCH",
      headers: { cookie: session.cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, data: await response.json() };
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createCoreRouter());
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("original HTTP repro: three spaces in role and needs cannot persist an empty profile", async () => {
  const session = account();
  const before = getBrand(session.brand.id);
  const result = await request(session, {
    audience: [{ ...valid(), role: "   ", needs: "   " }],
  });
  assert.equal(result.status, 400, JSON.stringify(result.data));
  assert.deepEqual(getBrand(session.brand.id), before);
});

test("new profiles require name, role and needs after trimming ASCII and Unicode whitespace", async () => {
  for (const field of ["name", "role", "needs"]) {
    for (const value of [
      undefined,
      null,
      "",
      " \t\r\n",
      "\u00a0\u2003\u202f\u3000\ufeff",
    ]) {
      const session = account();
      const result = await request(session, {
        audience: [{ ...valid(), [field]: value }],
      });
      assert.equal(
        result.status,
        400,
        `${field}=${JSON.stringify(value)}: ${JSON.stringify(result.data)}`,
      );
      assert.deepEqual(getBrand(session.brand.id).audience, []);
    }
  }
});

test("brand creation also enforces required audience details while an empty audience remains valid", async () => {
  const session = account();
  for (const field of ["name", "role", "needs"]) {
    const before = db
      .prepare("SELECT COUNT(*) AS total FROM brands")
      .get().total;
    const result = await request(
      session,
      {
        name: "Alta sintética inválida",
        audience: [{ ...valid(), [field]: "\u2003 " }],
      },
      true,
    );
    assert.equal(
      result.status,
      400,
      `${field}: ${JSON.stringify(result.data)}`,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM brands").get().total,
      before,
    );
  }
  const empty = await request(
    session,
    { name: "Sin audiencia sintética", audience: [] },
    true,
  );
  assert.equal(empty.status, 201, JSON.stringify(empty.data));
  assert.deepEqual(empty.data.audience, []);
});

test("edited profiles require details and reject atomically without changing another profile", async () => {
  for (const field of ["name", "role", "needs"]) {
    const first = valid();
    const second = {
      ...valid(),
      description: "Contexto editorial sintético que debe conservarse.",
    };
    const session = account([first, second]);
    const before = getBrand(session.brand.id);
    const result = await request(session, {
      audience: [first, { ...second, [field]: "\u00a0\u3000" }],
    });
    assert.equal(
      result.status,
      400,
      `${field}: ${JSON.stringify(result.data)}`,
    );
    assert.deepEqual(getBrand(session.brand.id), before);
    const corrected = {
      ...second,
      [field]: "Texto corregido para la prueba sintética",
    };
    const retry = await request(session, { audience: [first, corrected] });
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    assert.deepEqual(getBrand(session.brand.id).audience, [first, corrected]);
  }
});

test("Unicode text and exact field limits survive trimming; over-limit fields reject without writes", async () => {
  const session = account();
  const profile = {
    ...valid(),
    name: "名".repeat(150),
    role: "é".repeat(300),
    needs: "ا".repeat(3000),
  };
  const padded = Object.fromEntries(
    Object.entries(profile).map(([key, value]) => [
      key,
      key === "id" ? value : `\u00a0\u2003${value}\u3000`,
    ]),
  );
  const saved = await request(session, { audience: [padded] });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(getBrand(session.brand.id).audience, [profile]);
  for (const field of ["name", "role", "needs"]) {
    const before = getBrand(session.brand.id);
    const result = await request(session, {
      audience: [{ ...profile, [field]: `${profile[field]}x` }],
    });
    assert.equal(
      result.status,
      400,
      `${field}: ${JSON.stringify(result.data)}`,
    );
    assert.deepEqual(getBrand(session.brand.id), before);
  }
});

test("company-only updates and editing a different audience preserve untouched incomplete legacy profiles", async () => {
  const legacy = {
    id: randomUUID(),
    name: "Legacy sintético",
    stage: "Explorando",
  };
  const complete = valid();
  const session = account([legacy, complete]);
  const company = await request(session, {
    name: "Empresa sintética renombrada",
  });
  assert.equal(company.status, 200, JSON.stringify(company.data));
  const [unchangedLegacy, current] = getBrand(session.brand.id).audience;
  assert.equal(unchangedLegacy.id, legacy.id);
  assert.equal(unchangedLegacy.role, "");
  assert.equal(unchangedLegacy.needs, "");
  const edited = {
    ...current,
    needs: "Formar al equipo en decisiones operativas.",
  };
  const mixed = await request(session, { audience: [unchangedLegacy, edited] });
  assert.equal(mixed.status, 200, JSON.stringify(mixed.data));
  assert.deepEqual(getBrand(session.brand.id).audience, [
    unchangedLegacy,
    edited,
  ]);
  const invalidEdit = await request(session, {
    audience: [{ ...unchangedLegacy, name: "Legacy modificado" }, edited],
  });
  assert.equal(invalidEdit.status, 400, JSON.stringify(invalidEdit.data));
  assert.deepEqual(getBrand(session.brand.id).audience, [
    unchangedLegacy,
    edited,
  ]);
  const fixedLegacy = {
    ...unchangedLegacy,
    role: "Líder de equipo",
    needs: "Aprender a medir resultados.",
  };
  const repaired = await request(session, { audience: [fixedLegacy, edited] });
  assert.equal(repaired.status, 200, JSON.stringify(repaired.data));
  assert.deepEqual(getBrand(session.brand.id).audience, [fixedLegacy, edited]);
});

test("whitespace edits to incomplete legacy details require correction, but deletion remains possible", async () => {
  const legacy = { ...valid(), role: "", needs: "" };
  const session = account([legacy]);
  const result = await request(session, {
    audience: [{ ...legacy, role: "   ", needs: "   " }],
  });
  assert.equal(result.status, 400, JSON.stringify(result.data));
  assert.deepEqual(getBrand(session.brand.id).audience, [legacy]);
  const removed = await request(session, { audience: [] });
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.deepEqual(getBrand(session.brand.id).audience, []);
});
