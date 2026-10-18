import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/")({
  beforeLoad: () => {
    throw redirect({
      to: "/radar",
      search: (previous) => previous,
      replace: true,
    });
  },
});
