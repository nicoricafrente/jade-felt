import { Link, createFileRoute } from "@tanstack/react-router";
import { AdminHeading, BookError, BookNote, HandRow } from "@/components/admin/bits";
import { handFilter, type HandFilter } from "@/components/admin/format";
import { useBookedHands } from "@/components/admin/use-hands";
import { cn } from "@/lib/cn";
import { GAME_CATALOG } from "@/lib/ledger";

export const Route = createFileRoute("/admin/hands")({
  validateSearch: (search: Record<string, unknown>) => ({
    game: handFilter(search.game),
  }),
  head: () => ({
    meta: [{ title: "Hands · House book · Jade Felt" }],
  }),
  component: HandsPage,
});

function HandsPage() {
  const { game } = Route.useSearch();
  const { hands, ready, error } = useBookedHands();
  const booked = ready ? hands : [];
  const shown = game === "all" ? booked : booked.filter((hand) => hand.game === game);

  return (
    <>
      <AdminHeading title="Hands" lede="Finished hands, newest first. Filter by the table." />
      <div className="mt-8 flex flex-wrap gap-2">
        <FilterLink game="all" active={game === "all"}>
          All
        </FilterLink>
        {GAME_CATALOG.map((item) => (
          <FilterLink key={item.id} game={item.id} active={game === item.id}>
            {item.name}
          </FilterLink>
        ))}
      </div>
      {error ? (
        <BookError>{error}</BookError>
      ) : shown.length === 0 ? (
        <BookNote>{ready ? "No hands in the book yet. Finish a hand at any table and it will be written here." : "Opening the book…"}</BookNote>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {[...shown].reverse().map((hand) => (
            <HandRow key={hand.id} hand={hand} />
          ))}
        </ul>
      )}
    </>
  );
}

function FilterLink({ game, active, children }: { game: HandFilter; active: boolean; children: string }) {
  return (
    <Link
      to="/admin/hands"
      search={{ game }}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        active ? "border-gold bg-gold text-ink" : "border-line text-cream hover:bg-rail",
      )}
    >
      {children}
    </Link>
  );
}
