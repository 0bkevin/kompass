import { createFileRoute } from "@tanstack/react-router";
import { AudiencePage } from "../../features/Brand";

export const Route = createFileRoute("/_workspace/audience")({
  component: AudiencePage,
});
