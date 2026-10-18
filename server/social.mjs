import express from "express";
import { getSecret, setSecret } from "./db.mjs";
import { requireAuth, requireBrand, requireOwner } from "./core.mjs";
import { getSocialSettings } from "./social-providers.mjs";
import { getApifyBudgetStatus } from "./provider-budget.mjs";
import {
  publicAccessPolicies,
  providerAccessPolicy,
} from "./access-policy.mjs";

const PROVIDERS = Object.freeze({
  youtube: { secretKey: "youtube", credential: "apiKey", maxCredential: 500 },
  apify: { secretKey: "apify", credential: "apiToken", maxCredential: 1000 },
  gemini: { secretKey: "gemini", credential: "apiKey", maxCredential: 500 },
});

function bad(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    bad(`${label} debe ser un objeto JSON.`);
  return value;
}

function validatePatch(provider, value) {
  if (value === null) return null;
  const config = PROVIDERS[provider];
  const input = object(value, provider);
  const allowed = new Set([config.credential, "disabled"]);
  if (provider === "gemini") allowed.add("model");
  if (Object.keys(input).some((key) => !allowed.has(key)))
    bad(`Configuración de ${provider} contiene campos no admitidos.`);
  if (input.disabled !== undefined && typeof input.disabled !== "boolean")
    bad(`${provider}.disabled debe ser booleano.`);
  let credential;
  if (input[config.credential] !== undefined) {
    if (typeof input[config.credential] !== "string")
      bad(`${provider}.${config.credential} debe ser texto.`);
    credential = input[config.credential].trim();
    if (credential.length > config.maxCredential)
      bad(`La credencial de ${provider} es demasiado larga.`);
  }
  let model;
  if (provider === "gemini" && input.model !== undefined) {
    if (typeof input.model !== "string") bad("gemini.model debe ser texto.");
    model = input.model.trim();
    if (!/^[\w.-]{1,100}$/.test(model))
      bad(
        "gemini.model solo admite letras, números, punto, guion y guion bajo (máximo 100).",
      );
  }
  return {
    ...(credential ? { credential } : {}),
    ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
    ...(model ? { model } : {}),
  };
}

export function createSocialRouter() {
  const router = express.Router();
  router.get(
    "/brands/:brandId/social/budget",
    requireAuth,
    requireBrand,
    (req, res) => {
      const settings = getSocialSettings(req.brand.id);
      const stored = getSecret(req.brand.id, "apify");
      const credential =
        !stored?.disabled && (stored?.apiToken || process.env.APIFY_API_TOKEN);
      const budget =
        credential && settings.apify.configured
          ? getApifyBudgetStatus(credential)
          : null;
      res.json({
        configured: settings.apify.configured,
        budget,
        accessPolicy: providerAccessPolicy("apify"),
      });
    },
  );
  router.get(
    "/brands/:brandId/social/settings",
    requireAuth,
    requireBrand,
    (req, res) =>
      res.json({
        ...getSocialSettings(req.brand.id),
        policies: publicAccessPolicies(),
      }),
  );
  router.put(
    "/brands/:brandId/social/settings",
    requireAuth,
    requireBrand,
    requireOwner,
    (req, res) => {
      const body = object(req.body, "La configuración");
      if (Object.keys(body).some((key) => !Object.hasOwn(PROVIDERS, key)))
        bad("Solo se admiten youtube, apify y gemini.");
      const patches = Object.entries(body).map(([provider, value]) => [
        provider,
        validatePatch(provider, value),
      ]);
      // Validate all permission changes before storing any secret.
      for (const [provider, patch] of patches) {
        if (
          patch &&
          patch.disabled !== true &&
          !providerAccessPolicy(provider).allowed
        )
          throw Object.assign(
            new Error(providerAccessPolicy(provider).reason),
            { status: 403 },
          );
      }
      for (const [provider, patch] of patches) {
        if (patch === null) {
          // Remove stored credentials and prevent an environment alias from
          // silently reconnecting a provider the owner just disconnected.
          setSecret(req.brand.id, PROVIDERS[provider].secretKey, {
            disabled: true,
          });
          continue;
        }
        const key = PROVIDERS[provider].secretKey;
        const current = getSecret(req.brand.id, key) || {};
        const next = { ...current };
        if (patch.credential) {
          next[PROVIDERS[provider].credential] = patch.credential;
          if (patch.disabled === undefined) next.disabled = false;
        }
        if (patch.disabled !== undefined) next.disabled = patch.disabled;
        if (patch.model) next.model = patch.model;
        setSecret(req.brand.id, key, next);
      }
      res.json({
        ...getSocialSettings(req.brand.id),
        policies: publicAccessPolicies(),
      });
    },
  );
  return router;
}
