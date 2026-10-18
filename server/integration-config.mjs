// Deployment defaults stay on the server. A workspace can override or disable AI
// without copying a shared platform credential into its own secret record.
export function resolveAiConfig(stored, env = process.env) {
  if (stored?.disabled) return null;
  if (!stored?.apiKey && env.PLATFORM_TEXT_PROVIDER === "codex-chatgpt")
    return {
      provider: "codex-chatgpt",
      model: "ChatGPT · Codex",
      baseUrl: "https://chatgpt.com",
      managedBy: "platform",
    };
  const apiKey = stored?.apiKey || env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return null;
  const managedBy = stored?.apiKey ? "workspace" : "platform";
  const baseUrl =
    (stored?.apiKey ? stored.baseUrl : env.OPENAI_BASE_URL) ||
    "https://api.openai.com/v1";
  // This describes the operator's selected Gemini test service. A company's
  // own credential has separate terms and must not inherit this disclosure.
  const publicTest =
    managedBy === "platform" &&
    env.AI_DATA_MODE === "public-test" &&
    baseUrl.replace(/\/$/, "") ===
      "https://generativelanguage.googleapis.com/v1beta/openai";
  return {
    apiKey,
    model: (stored?.apiKey ? stored.model : env.OPENAI_MODEL) || "gpt-4.1-mini",
    baseUrl,
    managedBy,
    ...(publicTest ? { dataMode: "public-test" } : {}),
  };
}
