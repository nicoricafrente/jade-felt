import { createFileRoute } from "@tanstack/react-router";
import { Salon } from "@/components/salon";

export const Route = createFileRoute("/")({
  component: Salon,
});
