import { Link, createFileRoute } from "@tanstack/react-router";
import { AdminHeading } from "@/components/admin/bits";
import { seatDelta, signed, tone } from "@/components/admin/format";
import { useBookedHands } from "@/components/admin/use-hands";
import { cn } from "@/lib/cn";
import { buyInLabel, GAME_CATALOG } from "@/lib/ledger";

export const Route = createFileRoute("/admin/games")({
  head: () => ({
    meta: [{ title: "Game types · House book · Jade Felt" }],
  }),
  component: GamesPage,
});

function GamesPage() {
  const { hands, ready, error } = useBookedHands();
  const booked = ready && !error ? hands : [];

  return (
    <>
      <AdminHeading title="Game types" lede="Four tables. Your net at each one, and a way into the hands." />
      {error && <p className="mt-4 text-sm text-suit">{error}</p>}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {GAME_CATALOG.map((game) => {
          const played = booked.filter((hand) => hand.game === game.id);
          const net = played.reduce((sum, hand) => sum + seatDelta(hand), 0);
          return (
            <Link
              key={game.id}
              to="/admin/hands"
              search={{ game: game.id }}
              className="flex min-h-28 flex-col items-start justify-between rounded-3xl border border-line bg-rail/60 p-5 text-left transition-colors duration-200 hover:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <span className="flex w-full items-baseline justify-between gap-3">
                <span className="font-display text-2xl text-cream">
                  <span className="mr-2 text-gold" aria-hidden>
                    {game.mark}
                  </span>
                  {game.name}
                </span>
                <span className={cn("font-display text-2xl tabular-nums", tone(net))}>{ready && !error ? signed(net) : "—"}</span>
              </span>
              <span className="mt-3 block text-sm text-muted">
                {game.line} Buy-in {buyInLabel(game.id)}. {ready && !error ? `${played.length} booked` : "—"}
              </span>
              <span className="mt-3 block text-sm text-gold">Open the hands</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
