import { createFileRoute } from "@tanstack/react-router";
import { CompanyContext } from "../../features/Journey";

export const Route = createFileRoute("/_workspace/brand")({
  component: CompanyContext,
});
