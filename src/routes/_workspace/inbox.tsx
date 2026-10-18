import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "../../features/Discovery";

export const Route = createFileRoute("/_workspace/inbox")({
  component: InboxPage,
});
