import { createFileRoute } from "@tanstack/react-router";
import { Home } from "../../features/Journey";

export const Route = createFileRoute("/_workspace/home")({ component: Home });
