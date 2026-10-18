import { createFileRoute } from "@tanstack/react-router";
import ChallengeReport from "../../features/ChallengeReport";

export const Route = createFileRoute("/_workspace/research")({
  head: () => ({ meta: [{ title: "Informe semanal · kompass" }] }),
  component: ChallengeReport,
});
