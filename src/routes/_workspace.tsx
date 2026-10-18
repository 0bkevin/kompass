import { createFileRoute } from "@tanstack/react-router";
import App from "../App";

export const Route = createFileRoute("/_workspace")({
  ssr: false,
  head: () => ({ meta: [{ title: "kompass" }] }),
  component: App,
});
