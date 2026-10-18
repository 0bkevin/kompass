import { createFileRoute } from "@tanstack/react-router";
import Studio from "../../../features/Studio";

export const Route = createFileRoute("/_workspace/studio/$pieceId")({
  component: Studio,
});
