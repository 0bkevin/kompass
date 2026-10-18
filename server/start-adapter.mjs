import { createRequest, sendResponse } from "@mjackson/node-fetch-server";

/**
 * Adapt a TanStack Start Fetch handler to an Express middleware. API routes and
 * client assets can run before this middleware in the same Node process.
 */
export function createStartMiddleware(startEntry) {
  const fetch =
    typeof startEntry === "function" ? startEntry : startEntry?.fetch;
  if (typeof fetch !== "function") {
    throw new TypeError(
      "TanStack Start server entry must expose fetch(request)",
    );
  }

  return async function startMiddleware(req, res, next) {
    try {
      const protocol = req.protocol.endsWith(":")
        ? req.protocol
        : `${req.protocol}:`;
      const request = createRequest(req, res, { protocol });
      const response = await fetch(request);
      if (!(response instanceof Response)) {
        throw new TypeError(
          "TanStack Start fetch handler did not return a Response",
        );
      }
      await sendResponse(res, response);
    } catch (error) {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      next(error);
    }
  };
}
