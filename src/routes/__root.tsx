import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import "../styles.css";

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
        title: "30X Radar — Ideas que conectan",
      },
      {
        name: "description",
        content:
          "Descubre señales, organiza referencias y convierte tendencias en contenido para tu marca.",
      },
      { name: "theme-color", content: "#f7f8f5" },
    ],
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
      <p className="eyebrow">SEÑAL FUERA DEL RADAR</p>
      <h1>No encontramos esta página.</h1>
      <p className="muted">
        Revisa la dirección o vuelve a una sección de 30X Radar.
      </p>
      <nav aria-label="Secciones de 30X Radar">
        <Link to="/radar">Radar</Link>
        <Link to="/inbox">Bandeja</Link>
        <Link to="/studio">Estudio</Link>
        <Link to="/settings">Configuración</Link>
      </nav>
    </main>
  );
}
