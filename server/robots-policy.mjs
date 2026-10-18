// RFC 9309 matching for the reader's product token. This is an additional
// restriction: an Allow directive never supplies permission to use content.
const TOKEN = "kompass";
// Keep historical restrictions in force when a site still addresses the old
// crawler name, so the product rename cannot grant access that was denied.
const LEGACY_TOKEN = "30xradar";
function octets(value) {
  return value
    .replace(/%[\da-f]{2}/gi, (encoded) => {
      const code = Number.parseInt(encoded.slice(1), 16);
      const char = String.fromCharCode(code);
      return /[A-Za-z0-9._~-]/.test(char) ? char : encoded.toUpperCase();
    })
    .replace(/[^\x00-\x7f]/gu, (char) => encodeURIComponent(char));
}
export function robotsAllows(text, value) {
  const groups = [];
  let group = null,
    hasRules = false;
  for (const raw of String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase(),
      field = match[2].trim();
    if (key === "user-agent") {
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(field.toLowerCase());
    } else if (group && ["allow", "disallow"].includes(key)) {
      hasRules = true;
      if (field)
        group.rules.push({ allow: key === "allow", pattern: octets(field) });
    }
  }
  const exact = groups.filter((item) => item.agents.includes(TOKEN));
  const selected = exact.length
    ? exact
    : groups.filter((item) => item.agents.includes("*"));
  const legacy = groups.filter((item) => item.agents.includes(LEGACY_TOKEN));
  const url = new URL(value),
    path = octets(`${url.pathname}${url.search}`);
  return rulesAllow(selected, path) && rulesAllow(legacy, path);
}

function rulesAllow(groups, path) {
  let best = null;
  for (const { rules } of groups)
    for (const rule of rules) {
      const end = rule.pattern.endsWith("$");
      const body = end ? rule.pattern.slice(0, -1) : rule.pattern;
      const expression = body
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      if (!new RegExp(`^${expression}${end ? "$" : ""}`).test(path)) continue;
      const length = Buffer.byteLength(body.replace(/\*/g, ""));
      if (
        !best ||
        length > best.length ||
        (length === best.length && rule.allow)
      )
        best = { ...rule, length };
    }
  return best?.allow ?? true;
}
