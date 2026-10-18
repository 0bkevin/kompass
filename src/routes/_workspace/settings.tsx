import { createFileRoute } from "@tanstack/react-router";
import SettingsPage from "../../features/Settings";

export const Route = createFileRoute("/_workspace/settings")({
  component: SettingsPage,
});
