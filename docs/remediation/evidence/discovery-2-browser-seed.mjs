// Synthetic HN JSON, executed through production syncSources. No HN/network calls.
import { getBrand, listRecords, saveRecord, db } from "../../../server/db.mjs";
import { syncSources } from "../../../server/intelligence.mjs";

const brand = getBrand(process.argv[2]);
if (!brand || !brand.name.includes("QA"))
  throw new Error("Dedicated QA brand required.");
for (const source of listRecords(brand.id, "sources"))
  saveRecord(brand.id, "sources", { ...source, enabled: false });
const previous = listRecords(brand.id, "sources").find(
  (source) => source.name === "HN — JSON simulado, no proveedor real",
);
saveRecord(brand.id, "sources", {
  ...previous,
  name: "HN — JSON simulado, no proveedor real",
  type: "hackernews",
  query: "synthetic fixture",
  enabled: true,
});
const hits = [
  {
    objectID: "900000001",
    title:
      "AdFection QA — https:&#x2F;&#x2F;example.com&#x2F;public — it&#x27;s readable",
    story_text:
      "<p>JSON HN simulado; no es evidencia de un proveedor real.</p><p>Enlace: https:&#x2F;&#x2F;example.com&#x2F;public. Unicode: &#241; &#xE9; &#128512; &#x1F680;. Tipografía: &copy; &ndash; &hellip; &euro;.</p><p>Texto literal: &lt;tag&gt;fin&lt;/tag&gt; &lt;img src=x onerror=&quot;window.__discoveryXss=true&quot;&gt;.</p><p>Una sola pasada: &amp;lt;tag&amp;gt; &amp;#x27; &amp;quot;.</p><script>window.__discoveryXss=true</script>",
    url: "https://example.com/discovery-2/900000001",
    points: 47,
    num_comments: 8,
    author: "synthetic-public-author",
    created_at: new Date().toISOString(),
  },
];
const requests = [];
const result = await syncSources(brand, {
  fetcher: async (value) => {
    const url = new URL(value);
    if (url.origin !== "https://hn.algolia.com")
      throw new Error("Unexpected provider; transport forbidden.");
    requests.push(url.pathname);
    return new Response(JSON.stringify({ hits }), {
      headers: { "content-type": "application/json" },
    });
  },
});
console.log(
  JSON.stringify(
    {
      simulated: true,
      requests,
      result,
      references: listRecords(brand.id, "references").map(
        ({ id, title, text, sourceUrl, trend }) => ({
          id,
          title,
          text,
          sourceUrl,
          metrics: trend?.metrics,
        }),
      ),
    },
    null,
    2,
  ),
);
db.close();
