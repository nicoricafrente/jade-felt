import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminHeading } from "@/components/admin/bits";
import { count, signed, tone } from "@/components/admin/format";
import { useBookedHands } from "@/components/admin/use-hands";
import { cn } from "@/lib/cn";
import { GAME_CATALOG, playerStats, type PlayerStat } from "@/lib/ledger";

export const Route = createFileRoute("/admin/players")({
  head: () => ({
    meta: [{ title: "Players · House book · Jade Felt" }],
  }),
  component: PlayersPage,
});

function PlayersPage() {
  const { hands, ready, error } = useBookedHands();
  const stats = playerStats(ready ? hands : []);
  const [who, setWho] = useState("You");
  const selected = stats.find((stat) => stat.name === who) ?? stats[0];

  return (
    <>
      <AdminHeading title="Players" lede="The regulars, and anyone else the book has seen." />
      {error && <p className="mt-4 text-sm text-suit">{error}</p>}
      <div className="mt-8 grid items-start gap-4 lg:grid-cols-2">
        <ul className="grid gap-2">
          {stats.map((stat) => (
            <li key={stat.name}>
              <button
                type="button"
                onClick={() => setWho(stat.name)}
                aria-pressed={selected?.name === stat.name}
                className={cn(
                  "flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                  selected?.name === stat.name ? "border-gold bg-rail" : "border-line bg-rail/50 hover:border-gold",
                )}
              >
                <span>
                  <span className="block font-medium text-cream">{stat.name}</span>
                  <span className="block text-sm text-muted">
                    {stat.role}
                    {stat.hands > 0 ? ` · ${count(stat.hands, "hand")}` : " · no hands yet"}
                  </span>
                </span>
                <span className={cn("font-display text-2xl tabular-nums", tone(stat.net))}>{ready ? signed(stat.net) : "—"}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <div className="lg:sticky lg:top-8">
            <StatSheet stat={selected} />
          </div>
        )}
      </div>
    </>
  );
}

function StatSheet({ stat }: { stat: PlayerStat }) {
  return (
    <div className="rounded-3xl border border-line bg-felt-light/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Player stats</p>
          <h2 className="font-display text-3xl text-cream">{stat.name}</h2>
          <p className="text-sm text-muted">{stat.role}</p>
        </div>
        <p className={cn("font-display text-4xl tabular-nums", tone(stat.net))}>{signed(stat.net)}</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Mini label="Hands" value={String(stat.hands)} />
        <Mini label="Wins" value={String(stat.wins)} />
        <Mini label="Losses" value={String(stat.losses)} />
        <Mini label="Pushes" value={String(stat.pushes)} />
        <Mini label="Best swing" value={signed(stat.best)} />
        <Mini label="Worst swing" value={signed(stat.worst)} />
      </dl>
      <ul className="mt-4 flex flex-col gap-2">
        {GAME_CATALOG.map((game) => {
          const slice = stat.byGame[game.id];
          return (
            <li key={game.id} className="flex items-baseline justify-between gap-3 border-t border-line pt-2 text-sm">
              <span className="text-cream">
                {game.mark} {game.name}
              </span>
              <span className="text-right text-muted">
                {count(slice.hands, "hand")} · {count(slice.wins, "win")} · <span className={tone(slice.net)}>{signed(slice.net)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums text-cream">{value}</dd>
    </div>
  );
}
