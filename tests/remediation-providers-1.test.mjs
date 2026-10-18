import { after, before, test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";

// Isolated, synthetic transport: no request in this suite can reach a provider.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "radar-providers-1-"));
process.env.DATA_DIR = temporary;
process.env.DISCOVERY_ENABLED = "false";
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  delete process.env[key];
const database = await import("../server/db.mjs");
const { createApp } = await import("../server/index.mjs");
let server, origin, owner, outsider, brand;
const attempts = [];
let mode = "success",
  release;
mock.method(dns, "lookup", async () => [
  { address: "93.184.216.34", family: 4 },
]);
mock.method(https, "request", (url, options, callback) => {
  assert.ok(
    ["api.telegram.org", "webhook.example.test"].includes(url.hostname),
    "Only synthetic provider targets are allowed",
  );
  const request = new EventEmitter();
  let body = "";
  request.write = (chunk) => {
    body += chunk;
  };
  request.destroy = (error) => {
    if (error) request.emit("error", error);
    request.emit("close");
  };
  request.end = () => {
    attempts.push({
      provider: url.hostname === "api.telegram.org" ? "telegram" : "webhook",
      headers: options.headers,
      body: JSON.parse(body),
    });
    const finish = () => {
      if (mode === "uncertain")
        return request.destroy(
          new Error("SIMULATED connection lost after write"),
        );
      const incoming = new EventEmitter();
      incoming.statusCode =
        mode === "requestTimeout"
          ? 408
          : mode === "serverError"
            ? 500
            : mode === "reject"
              ? 403
              : url.hostname === "api.telegram.org"
                ? 200
                : 202;
      incoming.headers = {
        "content-type": "application/json",
        "x-request-id": "SIMULATED-request-1",
      };
      incoming.destroy = () => {};
      callback(incoming);
      incoming.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            ok: mode !== "reject",
            result:
              mode === "invalidReceipt"
                ? {}
                : { message_id: 701, chat: { id: -1001234567890 } },
          }),
        ),
      );
      incoming.emit("end");
      request.emit("close");
    };
    if (mode === "pending") release = finish;
    else queueMicrotask(finish);
  };
  return request;
});
async function request(
  route,
  { method = "GET", cookie = owner?.cookie, body } = {},
) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function account(name) {
  const response = await request("/auth/register", {
    method: "POST",
    cookie: null,
    body: {
      name,
      email: `${name}@example.test`,
      password: "synthetic-providers-password",
    },
  });
  assert.equal(response.status, 201);
  return response;
}
function configure({ telegram = true, webhook = true } = {}) {
  database.setSecret(
    brand.id,
    "telegram",
    telegram
      ? {
          botToken: "123456789:SIMULATED_TRANSPORT_ONLY_ABCDEFGHIJKLMNOP",
          chatId: "-1001234567890",
        }
      : null,
  );
  database.setSecret(
    brand.id,
    "webhook",
    webhook
      ? {
          url: "https://webhook.example.test/SIMULATED?private=SIMULATED_QUERY",
          secret: "SIMULATED_WEBHOOK_SECRET",
        }
      : null,
  );
}
const base = () => `/brands/${brand.id}`;
const route = (piece) => `${base()}/pieces/${piece.id}`;
async function piece(channel = "telegram", approve = true) {
  const created = await request(`${base()}/pieces`, {
    method: "POST",
    body: {
      title: "SIMULATED provider workflow",
      channel,
      format: "post",
      caption: "SIMULATED approved text",
      script: "Synthetic script",
      cta: "Synthetic CTA",
    },
  });
  assert.equal(created.status, 201);
  if (!approve) return created.data;
  const review = await request(route(created.data), {
    method: "PATCH",
    body: { status: "review" },
  });
  const approved = await request(`${route(created.data)}/review`, {
    method: "POST",
    body: {
      action: "approve",
      expectedApprovalVersion: review.data.approvalVersion,
    },
  });
  assert.equal(approved.status, 200);
  return approved.data;
}
async function confirmation(value) {
  const reply = await request(`${route(value)}/publish`);
  assert.equal(reply.status, 200, JSON.stringify(reply.data));
  return {
    expectedApprovalVersion: reply.data.approvalVersion,
    expectedDestinationKey: reply.data.destinationKey,
  };
}
before(async () => {
  server = createApp({ apiOnly: true }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  owner = await account("providers-owner-synthetic");
  outsider = await account("providers-outsider-synthetic");
  const created = await request("/brands", {
    method: "POST",
    body: { name: "SIMULATED publication workspace", industry: "Education" },
  });
  assert.equal(created.status, 201);
  brand = created.data;
  configure();
});
after(async () => {
  mock.restoreAll();
  await new Promise((resolve) => server.close(resolve));
  database.db.close();
  fs.rmSync(temporary, { recursive: true, force: true });
});

test("the explicit publish flow exposes its actual destination and journal without credentials", async () => {
  configure();
  const approved = await piece();
  const state = await request(`${route(approved)}/publish`);
  assert.equal(
    state.status,
    200,
    "Approved piece must expose a safe publication state for the UI",
  );
  assert.equal(state.data.status, "ready");
  assert.equal(state.data.destination.provider, "telegram");
  assert.equal(state.data.destination.chatId, "-1001234567890");
  assert.equal(state.data.approvalVersion, approved.approvalVersion);
  assert.equal(
    state.data.previewText,
    [approved.title, approved.caption, approved.cta].join("\n\n"),
  );
  assert.doesNotMatch(
    JSON.stringify(state.data),
    /SIMULATED_TRANSPORT_ONLY|SIMULATED_WEBHOOK_SECRET|SIMULATED_QUERY/,
  );
  const webhook = await piece("linkedin");
  const webhookState = await request(`${route(webhook)}/publish`);
  assert.equal(webhookState.data.destination.provider, "webhook");
  assert.equal(
    webhookState.data.destination.url,
    "https://webhook.example.test/SIMULATED",
  );
  assert.doesNotMatch(
    JSON.stringify(webhookState.data),
    /SIMULATED_QUERY|SIMULATED_WEBHOOK_SECRET/,
  );
});

test("the API preserves authentication, brand, editor, approval and missing-connector gates", async () => {
  const draft = await piece("telegram", false);
  const before = attempts.length;
  assert.equal(
    (await request(`${route(draft)}/publish`, { cookie: null })).status,
    401,
  );
  assert.equal(
    (await request(`${route(draft)}/publish`, { cookie: outsider.cookie }))
      .status,
    404,
  );
  assert.equal(
    (await request(`${route(draft)}/publish`, { method: "POST", body: {} }))
      .status,
    409,
  );
  const approved = await piece();
  const body = await confirmation(approved);
  database.db
    .prepare(
      "UPDATE members SET role='reviewer' WHERE brand_id=? AND user_id=?",
    )
    .run(brand.id, owner.data.user.id);
  try {
    assert.equal(
      (await request(`${route(approved)}/publish`, { method: "POST", body }))
        .status,
      403,
    );
    assert.equal(
      (await request(`${route(approved)}/publish`)).status,
      200,
      "Reviewers may inspect receipts without sending",
    );
  } finally {
    database.db
      .prepare("UPDATE members SET role='owner' WHERE brand_id=? AND user_id=?")
      .run(brand.id, owner.data.user.id);
  }
  configure({ telegram: false, webhook: false });
  assert.equal(
    (
      await request(`${route(approved)}/publish`, {
        method: "POST",
        body: await confirmation(approved),
      })
    ).status,
    409,
  );
  assert.equal(attempts.length, before);
  configure();
});

test("an explicit confirmation is bound to the current approved version and destination", async () => {
  configure();
  const approved = await piece();
  const body = await confirmation(approved);
  const before = attempts.length;
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body: {} }))
      .status,
    409,
  );
  assert.equal(
    (
      await request(`${route(approved)}/publish`, {
        method: "POST",
        body: { ...body, expectedApprovalVersion: "stale-version" },
      })
    ).status,
    409,
  );
  database.setSecret(brand.id, "telegram", {
    botToken: "SIMULATED_ONLY",
    chatId: "@SIMULATED_CHANGED_DESTINATION",
  });
  const changed = await request(`${route(approved)}/publish`, {
    method: "POST",
    body,
  });
  assert.equal(changed.status, 409);
  assert.match(changed.data.error, /destino|conector/i);
  configure({ telegram: false, webhook: false });
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body }))
      .status,
    409,
    "Disconnecting after confirmation must never send to another destination",
  );
  configure();
  await request(route(approved), {
    method: "PATCH",
    body: { status: "draft", caption: "A second content version" },
  });
  const secondReview = await request(route(approved), {
    method: "PATCH",
    body: { status: "review" },
  });
  const secondApproval = await request(`${route(approved)}/review`, {
    method: "POST",
    body: {
      action: "approve",
      expectedApprovalVersion: secondReview.data.approvalVersion,
    },
  });
  assert.equal(secondApproval.status, 200);
  assert.notEqual(
    secondApproval.data.approvalVersion,
    body.expectedApprovalVersion,
  );
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body }))
      .status,
    409,
    "A renewed approval cannot reuse confirmation of the old content",
  );
  assert.equal(attempts.length, before);
  configure();
});

test("approved and scheduled Telegram pieces send once and persist a final receipt", async () => {
  configure();
  mode = "success";
  for (const scheduled of [false, true]) {
    let approved = await piece();
    const before = attempts.length;
    if (scheduled) {
      const result = await request(route(approved), {
        method: "PATCH",
        body: {
          status: "scheduled",
          scheduledFor: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      assert.equal(result.status, 200);
      approved = result.data;
      assert.equal(attempts.length, before, "Scheduling must never send");
    }
    const body = await confirmation(approved);
    const reply = await request(`${route(approved)}/publish`, {
      method: "POST",
      body,
    });
    assert.equal(reply.status, 200, JSON.stringify(reply.data));
    assert.equal(reply.data.status, "published");
    assert.equal(reply.data.publicationReceipt.provider, "telegram");
    assert.equal(reply.data.publicationReceipt.messageId, 701);
    assert.equal(
      attempts.at(-1).provider,
      "telegram",
      "Configured Telegram wins only for its channel",
    );
    assert.equal(
      (await request(`${route(approved)}/publish`)).data.status,
      "delivered",
    );
    assert.equal(
      (await request(`${route(approved)}/publish`, { method: "POST", body }))
        .status,
      200,
    );
    assert.equal(attempts.length, before + 1);
  }
});

test("webhook acceptance records its HTTP receipt without claiming a network publication", async () => {
  configure();
  mode = "success";
  const approved = await piece("linkedin");
  const reply = await request(`${route(approved)}/publish`, {
    method: "POST",
    body: await confirmation(approved),
  });
  assert.equal(reply.status, 200);
  assert.equal(attempts.at(-1).provider, "webhook");
  assert.equal(attempts.at(-1).body.piece.id, approved.id);
  assert.ok(attempts.at(-1).headers["idempotency-key"]);
  assert.equal(reply.data.publicationReceipt.status, 202);
  assert.equal(reply.data.publicationReceipt.requestId, "SIMULATED-request-1");
  assert.doesNotMatch(
    JSON.stringify(reply.data.publicationReceipt),
    /SIMULATED_QUERY|SIMULATED_WEBHOOK_SECRET/,
  );
});

test("a definite rejection allows only a deliberate retry with the same idempotency key", async () => {
  configure();
  const approved = await piece("linkedin");
  const body = await confirmation(approved),
    before = attempts.length;
  mode = "reject";
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body }))
      .status,
    502,
  );
  const failed = await request(`${route(approved)}/publish`);
  assert.equal(failed.data.status, "failed");
  assert.equal(
    attempts.length,
    before + 1,
    "Reading status cannot retry a delivery",
  );
  mode = "success";
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body }))
      .status,
    200,
  );
  assert.equal(attempts.length, before + 2);
  assert.equal(
    attempts.at(-1).headers["idempotency-key"],
    attempts.at(-2).headers["idempotency-key"],
  );
});

test("Telegram success without a message receipt remains uncertain", async () => {
  configure();
  const approved = await piece();
  const body = await confirmation(approved),
    before = attempts.length;
  mode = "invalidReceipt";
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body }))
      .status,
    502,
  );
  assert.equal(
    (await request(`${route(approved)}/publish`)).data.status,
    "uncertain",
  );
  mode = "success";
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body }))
      .status,
    409,
  );
  assert.equal(attempts.length, before + 1);
});

test("a webhook server error is ambiguous and must not become a retryable rejection", async () => {
  configure();
  for (const failure of ["serverError", "requestTimeout"]) {
    const approved = await piece("linkedin");
    const body = await confirmation(approved),
      before = attempts.length;
    mode = failure;
    assert.equal(
      (await request(`${route(approved)}/publish`, { method: "POST", body }))
        .status,
      502,
    );
    assert.equal(
      (await request(`${route(approved)}/publish`)).data.status,
      "uncertain",
    );
    mode = "success";
    assert.equal(
      (await request(`${route(approved)}/publish`, { method: "POST", body }))
        .status,
      409,
    );
    assert.equal(attempts.length, before + 1);
  }
});

test("an uncertain delivery remains blocked after reload and preserves mutation gates", async () => {
  configure();
  const approved = await piece();
  const body = await confirmation(approved),
    before = attempts.length;
  mode = "uncertain";
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body }))
      .status,
    400,
  );
  assert.equal(
    (await request(`${route(approved)}/publish`)).data.status,
    "uncertain",
  );
  mode = "success";
  assert.equal(
    (await request(`${route(approved)}/publish`, { method: "POST", body }))
      .status,
    409,
  );
  assert.equal(
    (
      await request(route(approved), {
        method: "PATCH",
        body: {
          status: "draft",
          script: "Forbidden during uncertain delivery",
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(route(approved), { method: "DELETE" })).status,
    409,
  );
  assert.equal(attempts.length, before + 1);
  assert.equal(
    database.getRecord(brand.id, "pieces", approved.id).status,
    "approved",
  );
});

test("an in-flight send exposes pending state and blocks double submits and edits", async () => {
  configure();
  const approved = await piece();
  const body = await confirmation(approved),
    before = attempts.length;
  mode = "pending";
  release = null;
  const sending = request(`${route(approved)}/publish`, {
    method: "POST",
    body,
  });
  for (let tick = 0; !release && tick < 100; tick++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(release, "Synthetic transport should be in-flight");
  try {
    assert.equal(
      (await request(`${route(approved)}/publish`)).data.status,
      "sending",
    );
    assert.equal(
      (await request(`${route(approved)}/publish`, { method: "POST", body }))
        .status,
      409,
    );
    assert.equal(
      (
        await request(route(approved), {
          method: "PATCH",
          body: { status: "draft" },
        })
      ).status,
      409,
    );
  } finally {
    mode = "success";
    release();
  }
  assert.equal((await sending).status, 200);
  assert.equal(attempts.length, before + 1);
});
