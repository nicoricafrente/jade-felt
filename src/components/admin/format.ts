import { GAME_CATALOG, type BookedHand } from "@/lib/ledger";
import type { GameId } from "@/lib/wallet";

export type HandFilter = GameId | "all";

export function handFilter(value: unknown): HandFilter {
  if (value === "holdem" || value === "blackjack" || value === "tongits" || value === "chinese") return value;
  return "all";
}

export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function tone(value: number): string {
  if (value > 0) return "text-gold";
  if (value < 0) return "text-suit";
  return "text-muted";
}

export function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function when(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

export function seatDelta(hand: BookedHand, name = "You"): number {
  return hand.seats.find((seat) => seat.name === name)?.delta ?? 0;
}

export function gameName(id: string): string {
  return GAME_CATALOG.find((game) => game.id === id)?.name ?? id;
}
