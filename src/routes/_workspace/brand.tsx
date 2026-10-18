import { createFileRoute } from "@tanstack/react-router";
import { BrandPage } from "../../features/Brand";

export const Route = createFileRoute("/_workspace/brand")({
  component: BrandPage,
});
