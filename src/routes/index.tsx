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
      { title: "30X Radar — Contenido con fundamento" },
      {
        name: "description",
        content:
          "De qué publicamos a una idea con fundamento. Conecta necesidades de audiencia con evidencia pública y lleva cada idea al guion, la revisión y el calendario de tu equipo.",
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
