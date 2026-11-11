import type { ReactNode } from "react";
import type { BookedHand } from "@/lib/ledger";
import { cn } from "@/lib/cn";
import { gameName, seatDelta, signed, tone, when } from "@/components/admin/format";

export function AdminHeading({ title, lede }: { title: string; lede: string }) {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-widest text-gold">House book</p>
      <h1 className="font-display text-4xl text-cream sm:text-5xl">{title}</h1>
      <p className="mt-2 max-w-xl text-muted">{lede}</p>
    </header>
  );
}

export function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-rail px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className={cn("mt-1 font-display text-3xl tabular-nums", className ?? "text-cream")}>{value}</p>
    </div>
  );
}

export function BookNote({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-3xl border border-dashed border-line px-5 py-8 text-muted">{children}</p>;
}

export function BookError({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-3xl border border-suit px-5 py-8 text-cream">{children}</p>;
}

export function HandRow({ hand }: { hand: BookedHand }) {
  const you = seatDelta(hand);
  return (
    <li className="rounded-2xl border border-line bg-rail/70 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-cream">{gameName(hand.game)}</p>
        <p className={cn("font-display text-2xl tabular-nums", tone(you))}>{signed(you)}</p>
      </div>
      <p className="mt-1 text-sm text-cream">{hand.summary}</p>
      <p className="mt-1 text-sm text-muted">{hand.seats.map((seat) => `${seat.name} ${signed(seat.delta)}`).join(" · ")}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-muted">{when(hand.at)}</p>
    </li>
  );
}
