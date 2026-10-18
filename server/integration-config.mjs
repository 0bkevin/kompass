// Deployment defaults stay on the server. A workspace can override or disable AI
// without copying a shared platform credential into its own secret record.
export function resolveAiConfig(stored, env = process.env) {
  if (stored?.disabled) return null;
  const apiKey = stored?.apiKey || env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return null;
  return {
    apiKey,
    model: (stored?.apiKey ? stored.model : env.OPENAI_MODEL) || "gpt-4.1-mini",
    baseUrl:
      (stored?.apiKey ? stored.baseUrl : env.OPENAI_BASE_URL) ||
      "https://api.openai.com/v1",
    managedBy: stored?.apiKey ? "workspace" : "platform",
  };
}
