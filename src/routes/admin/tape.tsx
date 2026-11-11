import { createFileRoute } from "@tanstack/react-router";
import { AdminHeading } from "@/components/admin/bits";
import { SessionDesk } from "@/components/session-replay";

export const Route = createFileRoute("/admin/tape")({
  head: () => ({
    meta: [{ title: "Session tape · House book · Jade Felt" }],
  }),
  component: TapePage,
});

function TapePage() {
  return (
    <>
      <AdminHeading
        title="Session tape"
        lede="Every sit-down, chip move, turn, check, fold, raise, draw, and throw, with the time it happened. Replay walks the table back through that record. Export saves one text file for the whole sitting, every hand in it, oldest move first. Import reads that file back onto the tape."
      />
      <SessionDesk />
    </>
  );
}
