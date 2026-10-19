import { createFileRoute } from "@tanstack/react-router";
import pitch from "../features/pitch/deck.html?raw";

// Serve the portable deck directly, without the workspace shell or authentication.
const page = pitch.replace('<html lang="es">', '<html lang="es" class="pitch-page">');

export const Route = createFileRoute("/pitch")({
  server: {
    handlers: {
      GET: () =>
        new Response(page, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    },
  },
});
