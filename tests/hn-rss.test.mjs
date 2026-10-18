import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kompass-hn-rss-"));
process.env.DATA_DIR = directory;
process.env.SOURCE_ACCESS_POLICY_FILE = path.join(
  directory,
  "no-extra-grants.json",
);
const { db } = await import("../server/db.mjs");
const { webAccessPolicy, sourceAccessPolicy, assertAiProviderAllowed } =
  await import("../server/access-policy.mjs");
const { parseFeed, fetchSource } = await import("../server/intelligence.mjs");
after(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
const FEED = "https://news.ycombinator.com/rss";
const source = {
  id: "hn-rss",
  type: "rss",
  name: "Hacker News · RSS oficial",
  url: FEED,
};
const xml = `<rss version="2.0"><channel><title>Hacker News</title><item>
<title>Public synthetic headline</title><link>https://publisher.example/story</link>
<pubDate>Sun, 18 Oct 2026 15:00:00 GMT</pubDate>
<comments>https://news.ycombinator.com/item?id=123</comments>
<description><![CDATA[<a href="https://news.ycombinator.com/item?id=123">Comments</a>]]></description>
<author>Do not retain this author</author><score>9000</score>
</item></channel></rss>`;

test("only the exact official HN feed receives the built-in RSS grant", () => {
  assert.equal(sourceAccessPolicy(source).allowed, true);
  assert.equal(webAccessPolicy(FEED, "rss").reviewedAt, "2026-10-18");
  for (const url of [
    "http://news.ycombinator.com/rss",
    `${FEED}/`,
    `${FEED}?x=1`,
    `${FEED}?`,
    `${FEED}#section`,
    `${FEED}#`,
    "https://news.ycombinator.com:443/rss",
    "https://user:password@news.ycombinator.com/rss",
    "https://news.ycombinator.com.evil.example/rss",
    "https://www.news.ycombinator.com/rss",
    "https://news.ycombinator.com/RSS",
    "https://news.ycombinator.com/item?id=123",
    "https://news.ycombinator.com/robots.txt",
    "https://publisher.example/story",
  ])
    assert.equal(webAccessPolicy(url, "rss").allowed, false, url);
  for (const purpose of ["website", "metadata", "ai", "webhook"])
    assert.equal(webAccessPolicy(FEED, purpose).allowed, false, purpose);
  assert.throws(() => assertAiProviderAllowed(FEED));
  assert.equal(sourceAccessPolicy({ type: "hackernews" }).allowed, true);
});

test("official RSS preserves article and discussion citations as metadata without body or metrics", () => {
  const [item] = parseFeed(xml, source);
  assert.equal(item.title, "Public synthetic headline");
  assert.equal(item.url, "https://publisher.example/story");
  assert.equal(item.discussionUrl, "https://news.ycombinator.com/item?id=123");
  assert.deepEqual(item.relatedUrls, [item.discussionUrl]);
  assert.equal(item.sourceUrl, FEED);
  assert.equal(item.publishedAt, "2026-10-18T15:00:00.000Z");
  assert.equal(item.contentScope, "metadata_only");
  assert.equal(item.text, "");
  assert.equal(item.author, undefined);
  assert.equal(item.metrics, undefined);
  assert.equal(item.officialRank, undefined);
  assert.equal(item.providerAttributions[0].name, "Hacker News");
  assert.doesNotMatch(JSON.stringify(item), /9000|Do not retain|<a/);
});

test("RSS collection reads the feed once without reading articles or discussion", async () => {
  const calls = [];
  const items = await fetchSource({}, source, {
    fetcher: async (url) => {
      calls.push(url);
      return { ok: true, text: async () => xml };
    },
  });
  assert.deepEqual(calls, [FEED]);
  assert.equal(items.length, 1);
  assert.equal(items[0].ingestionAccess.purpose, "rss");
});

test("malicious XML entities are rejected and unsafe comment links are not citations", () => {
  for (const declaration of [
    '<!DOCTYPE rss SYSTEM "https://evil.example/entity">',
    '<!ENTITY xxe SYSTEM "file:///etc/passwd">',
  ])
    assert.throws(
      () => parseFeed(declaration + xml, source),
      /entidades externas/,
    );
  for (const discussion of [
    "javascript:alert(1)",
    "https://evil.example/item?id=123",
    "https://news.ycombinator.com/item?id=123&amp;token=secret",
  ])
    assert.deepEqual(
      parseFeed(
        xml.replace(
          "<comments>https://news.ycombinator.com/item?id=123</comments>",
          `<comments>${discussion}</comments>`,
        ),
        source,
      )[0].relatedUrls,
      [],
    );
});
