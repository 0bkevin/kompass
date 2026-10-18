import { createFileRoute } from "@tanstack/react-router";
import { Results } from "../../features/Journey";

export const Route = createFileRoute("/_workspace/results")({
  component: Results,
});
