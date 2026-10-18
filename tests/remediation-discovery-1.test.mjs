import { installPermissionFixture } from "./permission-fixture.mjs";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-discovery-1-"));
process.env.DATA_DIR = dataDir;
installPermissionFixture(dataDir, [
  {
    origin: "https://www.nasa.gov",
    pathPrefix: "/feed",
    purposes: ["metadata", "rss"],
  },
  {
    origin: "https://redirect.synthetic.test",
    pathPrefix: "/feed",
    purposes: ["metadata"],
  },
  {
    origin: "https://mixed.synthetic.test",
    pathPrefix: "/feed",
    purposes: ["metadata"],
  },
]);
const { db } = await import("../server/db.mjs");
const { isPublicAddress, validatePublicUrl, safeFetch } =
  await import("../server/connectors.mjs");
const { fetchSource } = await import("../server/intelligence.mjs");
after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const nasaUrl = "https://www.nasa.gov/feed/";
const nasaAddress = { address: "192.0.66.108", family: 4 };
const privateError = /direcciones privadas|reservadas/;

// The DNS and HTTP stream are synthetic. URL validation, socket lookup pinning,
// redirect handling and feed parsing execute the production implementation.
function transportFixture(t, { lookup, respond, robotsRespond }) {
  const requests = [];
  const contentRequests = [];
  const robotsRequests = [];
  const dnsMock = t.mock.method(dns, "lookup", lookup);
  const request = (url, options, callback) => {
    const captured = { url: url.href, headers: options.headers };
    options.lookup(url.hostname, { all: true }, (error, addresses) => {
      assert.ifError(error);
      captured.addresses = addresses;
    });
    options.lookup(url.hostname, {}, (error, address, family) => {
      assert.ifError(error);
      captured.firstAddress = { address, family };
    });
    requests.push(captured);
    const isRobots = url.pathname === "/robots.txt";
    (isRobots ? robotsRequests : contentRequests).push(captured);
    const outgoing = new EventEmitter();
    outgoing.write = () => {};
    outgoing.destroy = (error) => {
      if (error) outgoing.emit("error", error);
      outgoing.emit("close");
    };
    outgoing.end = () => {
      queueMicrotask(() => {
        const reply = isRobots
          ? robotsRespond?.(url) || {
              status: 200,
              headers: { "content-type": "text/plain" },
              body: "User-agent: *\nAllow: /\n",
            }
          : respond(url, contentRequests.length);
        const incoming = new EventEmitter();
        incoming.statusCode = reply.status || 200;
        incoming.headers = reply.headers || {};
        incoming.destroy = () => {};
        callback(incoming);
        if (reply.body) incoming.emit("data", Buffer.from(reply.body));
        incoming.emit("end");
        outgoing.emit("close");
      });
    };
    return outgoing;
  };
  t.mock.method(https, "request", request);
  t.mock.method(http, "request", request);
  return { requests, contentRequests, robotsRequests, dnsMock };
}

test("NASA RSS URL accepts its public 192.0.66.108 DNS result", async () => {
  const calls = [];
  const result = await validatePublicUrl(nasaUrl, {
    lookup: async (...args) => {
      calls.push(args);
      return [nasaAddress];
    },
  });
  assert.equal(result.url.href, nasaUrl);
  assert.deepEqual(result.addresses, [nasaAddress]);
  assert.deepEqual(calls, [["www.nasa.gov", { all: true, verbatim: true }]]);
});

test("192.0.0.0/24 allows only the two globally reachable IANA exceptions", () => {
  for (let last = 0; last < 256; last++) {
    const address = `192.0.0.${last}`;
    assert.equal(isPublicAddress(address), last === 9 || last === 10, address);
  }
});

test("192.0.2.0/24 documentation remains blocked after narrowing 192.0/16", () => {
  for (let last = 0; last < 256; last++) {
    const address = `192.0.2.${last}`;
    assert.equal(isPublicAddress(address), false, address);
  }
});

test("public IPv4 addresses adjacent to special ranges remain usable", async () => {
  for (const address of [
    "1.0.0.0",
    "9.255.255.255",
    "11.0.0.0",
    "100.63.255.255",
    "100.128.0.0",
    "126.255.255.255",
    "128.0.0.0",
    "169.253.255.255",
    "169.255.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "192.0.0.9",
    "192.0.0.10",
    "192.0.1.0",
    "192.0.1.255",
    "192.0.3.0",
    "192.0.66.108",
    "192.0.255.255",
    "192.31.196.1",
    "192.52.193.1",
    "192.88.98.255",
    "192.88.100.0",
    "192.167.255.255",
    "192.169.0.0",
    "192.175.48.1",
    "198.17.255.255",
    "198.20.0.0",
    "198.51.99.255",
    "198.51.101.0",
    "203.0.112.255",
    "203.0.114.0",
    "223.255.255.255",
  ]) {
    assert.equal(isPublicAddress(address), true, address);
    const result = await validatePublicUrl(`https://${address}/`);
    assert.deepEqual(result.addresses, [{ address, family: 4 }]);
  }
});

const blockedV4 = [
  "0.0.0.0",
  "0.255.255.255",
  "10.0.0.0",
  "10.255.255.255",
  "100.64.0.0",
  "100.127.255.255",
  "127.0.0.0",
  "127.255.255.255",
  "169.254.0.0",
  "169.254.169.254",
  "169.254.255.255",
  "172.16.0.0",
  "172.31.255.255",
  "192.0.0.0",
  "192.0.0.8",
  "192.0.0.11",
  "192.0.0.170",
  "192.0.0.171",
  "192.0.0.255",
  "192.0.2.0",
  "192.0.2.255",
  "192.88.99.0",
  "192.88.99.2",
  "192.88.99.255",
  "192.168.0.0",
  "192.168.255.255",
  "198.18.0.0",
  "198.19.255.255",
  "198.51.100.0",
  "198.51.100.255",
  "203.0.113.0",
  "203.0.113.255",
  "224.0.0.0",
  "239.255.255.255",
  "240.0.0.0",
  "255.255.255.255",
];
const blockedV6 = [
  "::",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:192.0.66.108",
  "::ffff:c000:426c",
  "::192.0.66.108",
  "64:ff9b::c000:426c",
  "64:ff9b:1::c000:426c",
  "100::1",
  "fc00::1",
  "fdff:ffff::1",
  "fe80::1",
  "ff02::1",
  "ff0e::1",
  "2001::1",
  "2001:0:ffff::1",
  "2001:db8::1",
  "2001:0DB8:ffff:ffff:ffff:ffff:ffff:ffff",
  "2002:c000:426c::1",
  "3fff::1",
  "3fff:0:ffff::1",
];

test("private and special IPv4 ranges stay blocked through DNS and literal URLs", async () => {
  for (const address of blockedV4) {
    assert.equal(isPublicAddress(address), false, address);
    await assert.rejects(
      validatePublicUrl(`https://${address}/`),
      privateError,
    );
    await assert.rejects(
      validatePublicUrl(nasaUrl, {
        lookup: async () => [{ address, family: 4 }],
      }),
      privateError,
    );
  }
});

test("IPv6 private, documentation and transition ranges retain their denials", async () => {
  for (const address of blockedV6) {
    assert.equal(isPublicAddress(address), false, address);
    await assert.rejects(
      validatePublicUrl(`https://[${address}]/`),
      privateError,
    );
    await assert.rejects(
      validatePublicUrl(nasaUrl, {
        lookup: async () => [{ address, family: 6 }],
      }),
      privateError,
    );
  }
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("2001:4860:4860::8888"), true);
});

test("localhost, metadata names, encoded private hosts, credentials and nonstandard ports stay blocked", async () => {
  for (const value of [
    "https://localhost/",
    "https://a.localhost/",
    "https://service.local/",
    "https://service.internal/",
    "https://metadata.google.internal/",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "https://user:password@www.nasa.gov/feed/",
    "https://user@www.nasa.gov/feed/",
    "https://www.nasa.gov:8080/feed/",
    "https://www.nasa.gov:22/feed/",
    "file:///etc/passwd",
    "ftp://www.nasa.gov/feed/",
  ])
    await assert.rejects(validatePublicUrl(value));
  await assert.rejects(
    validatePublicUrl("http://www.nasa.gov/feed/", {
      requireHttps: true,
    }),
    /HTTPS/,
  );
});

test("mixed public/private DNS answers are rejected before creating a request", async (t) => {
  const fixture = transportFixture(t, {
    lookup: async () => [nasaAddress, { address: "10.0.0.1", family: 4 }],
    respond: () => {
      throw new Error("A private destination must never be requested");
    },
  });
  await assert.rejects(safeFetch(nasaUrl), privateError);
  assert.equal(fixture.requests.length, 0);
});

test("NASA RSS discovery checks robots and pins each request without resolving the content socket again", async (t) => {
  let resolutions = 0;
  const robotsAddress = { address: "192.0.67.108", family: 4 };
  const fixture = transportFixture(t, {
    lookup: async (hostname, options) => {
      resolutions++;
      assert.equal(hostname, "www.nasa.gov");
      assert.deepEqual(options, { all: true, verbatim: true });
      // Page and robots are separate requests. A third DNS resolution would
      // improperly re-resolve an already validated socket and reach loopback.
      return resolutions === 1
        ? [nasaAddress]
        : resolutions === 2
          ? [robotsAddress]
          : [{ address: "127.0.0.1", family: 4 }];
    },
    respond: () => ({
      headers: { "content-type": "application/rss+xml" },
      body: '<?xml version="1.0"?><rss version="2.0"><channel><title>Synthetic NASA regression fixture</title><item><title>Synthetic mission update</title><link>https://www.nasa.gov/synthetic-regression-fixture/</link><guid>synthetic-nasa-fixture-1</guid><description>Explicitly synthetic feed content for this test.</description></item></channel></rss>',
    }),
  });
  const results = await fetchSource(
    {},
    {
      type: "rss",
      name: "NASA regression fixture",
      url: nasaUrl,
    },
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Synthetic mission update");
  assert.equal(
    results[0].url,
    "https://www.nasa.gov/synthetic-regression-fixture/",
  );
  assert.equal(fixture.dnsMock.mock.callCount(), 2);
  assert.equal(fixture.contentRequests.length, 1);
  assert.equal(fixture.robotsRequests.length, 1);
  assert.equal(
    fixture.robotsRequests[0].url,
    "https://www.nasa.gov/robots.txt",
  );
  assert.deepEqual(fixture.robotsRequests[0].addresses, [robotsAddress]);
  assert.deepEqual(fixture.robotsRequests[0].firstAddress, robotsAddress);
  assert.equal(fixture.contentRequests[0].url, nasaUrl);
  assert.deepEqual(fixture.contentRequests[0].addresses, [nasaAddress]);
  assert.deepEqual(fixture.contentRequests[0].firstAddress, nasaAddress);
});

test("a private DNS answer for robots cannot open either a robots or content socket", async (t) => {
  let resolutions = 0;
  const fixture = transportFixture(t, {
    lookup: async () =>
      ++resolutions === 1
        ? [nasaAddress]
        : [{ address: "127.0.0.1", family: 4 }],
    respond: () => {
      throw new Error("A failed robots preflight must not fetch content");
    },
  });
  await assert.rejects(safeFetch(nasaUrl), privateError);
  assert.equal(resolutions, 2);
  assert.equal(fixture.requests.length, 0);
});

test("robots denial or unverified access blocks content despite a reviewed source permission", async (t) => {
  for (const reply of [
    { status: 200, body: "User-agent: *\nDisallow: /feed\n" },
    { status: 403 },
    { status: 503 },
  ]) {
    await t.test(`robots HTTP ${reply.status}`, async (child) => {
      const fixture = transportFixture(child, {
        lookup: async () => [nasaAddress],
        robotsRespond: () => reply,
        respond: () => {
          throw new Error("Robots restrictions must prevent content requests");
        },
      });
      await assert.rejects(
        safeFetch(nasaUrl),
        (error) => error.status === 403 && /robots\.txt/.test(error.message),
      );
      assert.equal(fixture.robotsRequests.length, 1);
      assert.equal(fixture.contentRequests.length, 0);
    });
  }
});

test("safeFetch revalidates redirect destinations before opening their socket", async (t) => {
  const targets = [
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://192.168.0.1/",
    "http://192.0.2.1/",
    "http://192.0.0.170/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:192.0.66.108]/",
    "http://[2002:c000:426c::1]/",
    "https://localhost/",
    "https://metadata.google.internal/",
    "https://user:secret@www.nasa.gov/",
    "https://www.nasa.gov:8080/",
    "https://mixed.synthetic.test/feed/",
  ];
  for (const [index, location] of targets.entries()) {
    await t.test(location, async (child) => {
      const fixture = transportFixture(child, {
        lookup: async (host) =>
          host === "mixed.synthetic.test"
            ? [nasaAddress, { address: "fc00::1", family: 6 }]
            : [nasaAddress],
        respond: () => ({
          status: [301, 302, 303, 307, 308][index % 5],
          headers: { location },
        }),
      });
      await assert.rejects(safeFetch(nasaUrl));
      assert.equal(
        fixture.contentRequests.length,
        1,
        "Only the reviewed public origin's content may be requested",
      );
      assert.equal(fixture.robotsRequests.length, 1);
      assert.deepEqual(fixture.contentRequests[0].addresses, [nasaAddress]);
    });
  }
});

test("safeFetch follows a public redirect with its own pinned DNS and strips sensitive headers", async (t) => {
  const redirectedAddress = { address: "192.0.67.108", family: 4 };
  const fixture = transportFixture(t, {
    lookup: async (hostname) =>
      hostname === "www.nasa.gov" ? [nasaAddress] : [redirectedAddress],
    respond: (_url, index) =>
      index === 1
        ? {
            status: 302,
            headers: { location: "https://redirect.synthetic.test/feed/" },
          }
        : { body: "synthetic public response" },
  });
  const response = await safeFetch(nasaUrl, {
    headers: {
      Authorization: "synthetic-token",
      Cookie: "synthetic-cookie",
      "X-Secret": "synthetic-secret",
      "X-Fixture": "kept",
    },
  });
  assert.equal(await response.text(), "synthetic public response");
  assert.equal(fixture.dnsMock.mock.callCount(), 4);
  assert.equal(fixture.contentRequests.length, 2);
  assert.deepEqual(
    fixture.robotsRequests.map((request) => request.url),
    [
      "https://www.nasa.gov/robots.txt",
      "https://redirect.synthetic.test/robots.txt",
    ],
  );
  assert.deepEqual(fixture.contentRequests[0].addresses, [nasaAddress]);
  assert.deepEqual(fixture.contentRequests[1].addresses, [redirectedAddress]);
  assert.deepEqual(fixture.contentRequests[1].firstAddress, redirectedAddress);
  assert.equal(fixture.contentRequests[1].headers.Authorization, undefined);
  assert.equal(fixture.contentRequests[1].headers.Cookie, undefined);
  assert.equal(fixture.contentRequests[1].headers["X-Secret"], undefined);
  assert.equal(fixture.contentRequests[1].headers["X-Fixture"], "kept");
});

test("safeFetch keeps the redirect budget and HTTPS requirement", async (t) => {
  for (const options of [
    { maxRedirects: 0 },
    { method: "POST" },
    { requireHttps: true },
  ]) {
    await t.test(JSON.stringify(options), async (child) => {
      const fixture = transportFixture(child, {
        lookup: async () => [nasaAddress],
        respond: () => ({
          status: 302,
          headers: { location: "http://www.nasa.gov/next" },
        }),
      });
      await assert.rejects(safeFetch(nasaUrl, options));
      assert.equal(fixture.contentRequests.length, 1);
      assert.equal(fixture.robotsRequests.length, 1);
    });
  }
});
