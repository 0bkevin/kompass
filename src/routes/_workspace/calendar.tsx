import { createFileRoute } from "@tanstack/react-router";
import Calendar from "../../features/Calendar";

export const Route = createFileRoute("/_workspace/calendar")({
  component: Calendar,
});
