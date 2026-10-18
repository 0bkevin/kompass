import { createFileRoute } from "@tanstack/react-router";
import Radar from "../../features/Discovery";

export const Route = createFileRoute("/_workspace/radar")({
  component: Radar,
});
