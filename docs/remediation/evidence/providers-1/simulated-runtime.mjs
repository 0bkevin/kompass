// QA ONLY. Explicitly simulated transport; this file is never imported by the app.
import https from "node:https";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import fs from "node:fs";

const directory = "/tmp/30x-remediation-providers-1";
if (process.env.DATA_DIR !== directory || process.env.PORT !== "4519")
  throw new Error(
    "This synthetic runtime is restricted to the providers-1 QA directory and port.",
  );
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  delete process.env[key];
process.env.DISCOVERY_ENABLED = "false";
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
https.request = (url, options, callback) => {
  if (!["api.telegram.org", "webhook.example.com"].includes(url.hostname))
    throw new Error(
      "External network is disabled in the simulated QA transport.",
    );
  const request = new EventEmitter();
  request.write = () => {};
  request.destroy = (error) => {
    if (error) request.emit("error", error);
    request.emit("close");
  };
  request.end = () => {
    const mode = fs.existsSync(`${directory}/transport-mode.json`)
      ? JSON.parse(fs.readFileSync(`${directory}/transport-mode.json`, "utf8"))
          .mode
      : "success";
    const telegram = url.hostname === "api.telegram.org";
    fs.appendFileSync(
      `${directory}/transport-events.ndjson`,
      JSON.stringify({
        simulated: true,
        provider: telegram ? "telegram" : "webhook",
        mode,
      }) + "\n",
    );
    setTimeout(
      () => {
        if (mode === "uncertain")
          return request.destroy(
            new Error("SIMULATED response lost after write"),
          );
        const incoming = new EventEmitter();
        incoming.statusCode = mode === "reject" ? 403 : telegram ? 200 : 202;
        incoming.headers = {
          "content-type": "application/json",
          "x-request-id": "SIMULATED-browser-request",
        };
        incoming.destroy = () => {};
        callback(incoming);
        incoming.emit(
          "data",
          Buffer.from(
            JSON.stringify({
              ok: mode !== "reject",
              result: { message_id: 901, chat: { id: -1001234567890 } },
            }),
          ),
        );
        incoming.emit("end");
        request.emit("close");
      },
      mode === "pending" ? 5000 : 100,
    );
  };
  return request;
};
const { createApp } = await import("../../../../server/index.mjs");
const server = createApp({ apiOnly: true }).listen(4519, "0.0.0.0", () =>
  console.log(
    "SIMULATED publication transport only: port 4519; no external delivery.",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
