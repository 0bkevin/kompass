import { createFileRoute, redirect } from "@tanstack/react-router";
import { LandingPage } from "../features/landing/LandingPage";

export const Route = createFileRoute("/")({
  beforeLoad: ({ search }) => {
    if (
      (typeof search.invite === "string" && search.invite) ||
      (typeof search.authError === "string" && search.authError)
    ) {
      throw redirect({
        to: "/home",
        search: (previous) => previous,
        replace: true,
      });
    }
  },
  head: () => ({
    meta: [
      { title: "30X Radar · Le damos dirección a tu contenido" },
      {
        name: "description",
        content:
          "Consulta fuentes públicas y prepara guiones con tu equipo a partir de las preguntas de tu audiencia. Revisa cada pieza y organiza las fechas en el calendario.",
      },
      { name: "theme-color", content: "#0c0c10" },
    ],
    links: [
      {
        rel: "preload",
        href: "/fonts/landing/hedvig-letters-serif-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  component: LandingPage,
});
