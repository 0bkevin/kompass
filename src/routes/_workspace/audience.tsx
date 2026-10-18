import { createFileRoute } from "@tanstack/react-router";
import { AudienceIntelligence } from "../../features/Journey";
import { CommunitySensor } from "../../features/Community";
import { useAudienceEvidence } from "../../lib/audience-evidence";
import { useWorkspace } from "../../lib/workspace";

export const Route = createFileRoute("/_workspace/audience")({
  component: Audience,
});
function Audience() {
  const { state } = useWorkspace();
  const evidence = useAudienceEvidence();
  return (
    <>
      <AudienceIntelligence resource={evidence} />
      <CommunitySensor key={state.brand.id} resource={evidence} />
    </>
  );
}
