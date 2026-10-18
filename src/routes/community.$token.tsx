import { createFileRoute } from "@tanstack/react-router";
import { CommunityQuestion } from "../features/Community";

export const Route = createFileRoute("/community/$token")({
  component: Question,
});
function Question() {
  const { token } = Route.useParams();
  return <CommunityQuestion key={token} token={token} />;
}
