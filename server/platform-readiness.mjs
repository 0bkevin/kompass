import { resolveAiConfig } from "./integration-config.mjs";
import {
  aiProviderAccessPolicy,
  sourceAccessPolicy,
  providerAccessPolicy,
} from "./access-policy.mjs";

// Match the connector's configuration rules without importing its database-backed
// runtime or inspecting an operator's actual account/session.
function officialYoutubeOAuthConfigured(env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  if (
    !clientId ||
    !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    !env.GOOGLE_CLIENT_SECRET?.trim() ||
    !env.GOOGLE_YOUTUBE_REDIRECT_URI?.trim()
  )
    return false;
  try {
    const redirect = new URL(env.GOOGLE_YOUTUBE_REDIRECT_URI.trim());
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      redirect.hostname,
    );
    return (
      redirect.pathname === "/api/social/youtube/callback" &&
      !redirect.search &&
      !redirect.hash &&
      !redirect.username &&
      !redirect.password &&
      (redirect.protocol === "https:" ||
        (redirect.protocol === "http:" && loopback))
    );
  } catch {
    return false;
  }
}

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
      ...(ai?.dataMode ? { dataMode: ai.dataMode } : {}),
      action: !ai
        ? "Set the platform OPENAI_API_KEY in the deployment secret store."
        : !aiPolicy.allowed
          ? "Provide the operator's current AI permission review in SOURCE_ACCESS_POLICY_FILE."
          : "Available to workspaces by default; provider quota and connectivity still require a real request.",
    },
    media: {
      enabled: process.env.MEDIA_GENERATION_ENABLED === "true",
      provider: "codex-chatgpt",
      execution: "local-worker",
      verification: "configuration-only",
      runtimeVerificationRequired: true,
      video: { mode: "local-composition", audio: false },
      action:
        process.env.MEDIA_GENERATION_ENABLED === "true"
          ? "The runtime must verify Codex ChatGPT sign-in; video composition also needs FFmpeg and FFprobe. This report does not inspect the account or generate media."
          : "Enable MEDIA_GENERATION_ENABLED only after installing Codex and signing in with the authorized ChatGPT account on this server.",
    },
    officialSocial: {
      verification: "configuration-only",
      runtimeVerificationRequired: true,
      youtube: {
        publicDataConfigured:
          !!process.env.YOUTUBE_DATA_API_KEY?.trim() &&
          process.env.YOUTUBE_DATA_API_KEY.trim().length <= 500,
        accountOAuthConfigured: officialYoutubeOAuthConfigured(process.env),
      },
      automaticSyncEnabled: process.env.SOCIAL_SYNC_ENABLED !== "false",
      action:
        "Configured credentials do not prove API availability, quota or a company's account authorization. Check each connection at runtime; legacy scraping remains restricted.",
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
