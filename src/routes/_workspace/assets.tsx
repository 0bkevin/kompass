import { createFileRoute } from "@tanstack/react-router";
import Assets from "../../features/Assets";

export const Route = createFileRoute("/_workspace/assets")({
  component: Assets,
});
