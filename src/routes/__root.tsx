import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import "../styles.css";
import "../workspace.css";

export const Route = createRootRoute({
  validateSearch: (
    search: Record<string, unknown>,
  ): Record<string, unknown> => {
    const validated = { ...search };
    if (validated.invite !== undefined && typeof validated.invite !== "string")
      delete validated.invite;
    return validated;
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "kompass · Le damos dirección a tu contenido",
      },
      {
        name: "description",
        content:
          "Decide qué contar y por qué. Contrasta las necesidades de tu audiencia con fuentes públicas y prepara guiones para revisar y planificar con tu equipo.",
      },
      { name: "theme-color", content: "#f7f8f5" },
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/icon.svg" }],
  }),
  component: RootDocument,
  notFoundComponent: NotFoundPage,
});

function RootDocument() {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundPage() {
  return (
    <main className="not-found-page">
      <h1>No encontramos esta página.</h1>
      <p className="muted">
        Revisa la dirección o vuelve a una sección de kompass.
      </p>
      <nav aria-label="Secciones de kompass">
        <Link to="/radar">Explorar fuentes</Link>
        <Link to="/inbox">Bandeja</Link>
        <Link to="/studio">Estudio</Link>
        <Link to="/settings">Configuración</Link>
      </nav>
    </main>
  );
}
