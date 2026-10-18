import { resolveAiConfig } from "./integration-config.mjs";
import {
  aiProviderAccessPolicy,
  sourceAccessPolicy,
  providerAccessPolicy,
} from "./access-policy.mjs";

// Configuration inspection only: no paid request, no user data and no secrets.
export function platformReadiness() {
  const ai = resolveAiConfig(null);
  const aiPolicy = aiProviderAccessPolicy(
    ai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  );
  const discovery = [
    { name: "Hacker News", type: "hackernews" },
    { name: "GDELT", type: "gdelt" },
    {
      name: "Google Trends",
      type: "rss",
      url: "https://trends.google.com/trending/rss?geo=US",
    },
  ].map((source) => ({
    name: source.name,
    available: sourceAccessPolicy(source).allowed,
    credentialRequired: false,
  }));
  return {
    coreReady: discovery.some((source) => source.available),
    verification: "configuration-only",
    discovery,
    ai: {
      configured: !!ai,
      ready: !!ai && aiPolicy.allowed,
      action: !ai
        ? "Set the platform OPENAI_API_KEY in the deployment secret store."
        : !aiPolicy.allowed
          ? "Provide the operator's current AI permission review in SOURCE_ACCESS_POLICY_FILE."
          : "Available to workspaces by default; provider quota and connectivity still require a real request.",
    },
    publishing: {
      exportReady: true,
      automaticSocialPublishing: false,
      webhook:
        "Per-company destination and access review required for optional delivery.",
    },
    restricted: ["apify", "youtube", "gemini", "reddit"].map((provider) => ({
      provider,
      available: providerAccessPolicy(provider).allowed,
    })),
    operatorActions: [
      ...(!ai
        ? [
            "Configure a platform AI credential once; customers do not need their own key.",
          ]
        : []),
      ...(!aiPolicy.allowed
        ? [
            "Review the AI provider and record the allowed origin, path, purpose and expiry.",
          ]
        : []),
      "Social scraping and remote video analysis remain unavailable; credentials alone do not enable them.",
    ],
  };
}
