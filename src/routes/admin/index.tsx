import { Link, createFileRoute } from "@tanstack/react-router";
import { AdminHeading, BookError, BookNote, Figure, HandRow } from "@/components/admin/bits";
import { seatDelta, signed, tone } from "@/components/admin/format";
import { useBookedHands } from "@/components/admin/use-hands";
import { playerStats } from "@/lib/ledger";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Overview · House book · Jade Felt" }],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { hands, ready, error } = useBookedHands();
  const booked = ready ? hands : [];
  const yours = booked.reduce((sum, hand) => sum + seatDelta(hand), 0);
  const wins = booked.filter((hand) => seatDelta(hand) > 0).length;
  const players = playerStats(booked).filter((stat) => stat.hands > 0).length;
  const latest = [...booked].reverse().slice(0, 5);
  const show = ready && !error;

  return (
    <>
      <AdminHeading title="Overview" lede="The floor at a glance. Open a section when you want the full book." />
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Hands" value={show ? String(hands.length) : "—"} />
        <Figure label="Your net" value={show ? signed(yours) : "—"} className={show ? tone(yours) : undefined} />
        <Figure label="Your wins" value={show ? String(wins) : "—"} />
        <Figure label="Players" value={show ? String(players) : "—"} />
      </section>
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-3xl text-cream">Latest hands</h2>
          {show && hands.length > 0 && (
            <Link
              to="/admin/hands"
              search={{ game: "all" }}
              className="inline-flex min-h-11 items-center text-sm font-medium text-gold hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              All hands
            </Link>
          )}
        </div>
        {error ? (
          <BookError>{error}</BookError>
        ) : latest.length === 0 ? (
          <BookNote>{ready ? "No hands in the book yet. Finish a hand at any table and it will be written here." : "Opening the book…"}</BookNote>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {latest.map((hand) => (
              <HandRow key={hand.id} hand={hand} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
