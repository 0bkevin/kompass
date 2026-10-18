import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { legacyUrlTarget } from "./lib/legacy-navigation.mjs";

export function getRouter() {
  if (typeof window !== "undefined") {
    const target = legacyUrlTarget({
      hash: window.location.hash,
      search: window.location.search,
    });
    if (target) {
      window.history.replaceState(window.history.state, "", target);
    }
  }

  return createRouter({
    routeTree,
    notFoundMode: "root",
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
