import { createFileRoute } from "@tanstack/react-router";
import { Opportunities } from "../../features/Journey";

export const Route = createFileRoute("/_workspace/opportunities")({
  component: Opportunities,
});
