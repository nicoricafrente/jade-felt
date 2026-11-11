import { saveHand } from "@/lib/house-book.functions";
import { BUY_IN, type GameId } from "@/lib/wallet";

export type SeatLine = {
  name: string;
  delta: number;
  note: string;
};

export type BookedHand = {
  id: string;
  game: GameId;
  at: number;
  summary: string;
  seats: SeatLine[];
};

export const GAME_CATALOG: { id: GameId; name: string; mark: string; line: string }[] = [
  { id: "holdem", name: "Hold'em", mark: "♠", line: "No-limit. Three seats. Blinds 10 and 20." },
  { id: "blackjack", name: "Blackjack", mark: "♥", line: "Four decks. Dealer stands on every 17." },
  { id: "tongits", name: "Tong-its", mark: "♣", line: "Melds, lay-offs, and a fight for the low count." },
  { id: "chinese", name: "Chinese poker", mark: "♦", line: "Thirteen cards across back, middle, and front." },
];

export const CAST: { name: string; role: string }[] = [
  { name: "You", role: "The seat" },
  { name: "Mina", role: "Hold'em regular" },
  { name: "Rafa", role: "Hold'em regular" },
  { name: "Dealer", role: "House shoe" },
  { name: "Liza", role: "Tong-its regular" },
  { name: "Nico", role: "Tong-its regular" },
  { name: "Wen", role: "Chinese poker regular" },
  { name: "Paolo", role: "Chinese poker regular" },
];

export type GameSlice = { hands: number; wins: number; net: number };

export type PlayerStat = {
  name: string;
  role: string;
  hands: number;
  wins: number;
  losses: number;
  pushes: number;
  net: number;
  best: number;
  worst: number;
  byGame: Record<GameId, GameSlice>;
};

function emptySlices(): Record<GameId, GameSlice> {
  return {
    holdem: { hands: 0, wins: 0, net: 0 },
    blackjack: { hands: 0, wins: 0, net: 0 },
    tongits: { hands: 0, wins: 0, net: 0 },
    chinese: { hands: 0, wins: 0, net: 0 },
  };
}

let lastPrint = "";
let lastAt = 0;

export function recordHand(input: { game: GameId; summary: string; seats: SeatLine[] }) {
  const seats = input.seats.map((seat) => ({
    name: seat.name.trim(),
    delta: Math.trunc(seat.delta),
    note: seat.note.slice(0, 200),
  }));
  const summary = input.summary.trim().slice(0, 500) || "Hand settled";
  const print = `${input.game}|${summary}|${seats.map((seat) => `${seat.name}:${seat.delta}`).join(",")}`;
  const now = Date.now();
  if (print === lastPrint && now - lastAt < 2000) return;
  lastPrint = print;
  lastAt = now;
  void saveHand({ data: { game: input.game, summary, seats } }).catch(() => undefined);
}

export function buyInLabel(game: GameId): number {
  return BUY_IN[game];
}

export function playerStats(hands: readonly BookedHand[]): PlayerStat[] {
  const known = new Map(CAST.map((person) => [person.name, person.role]));
  const stats = new Map<string, PlayerStat>();
  const ensure = (name: string): PlayerStat => {
    const existing = stats.get(name);
    if (existing) return existing;
    const created: PlayerStat = {
      name,
      role: known.get(name) ?? "Guest",
      hands: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      net: 0,
      best: 0,
      worst: 0,
      byGame: emptySlices(),
    };
    stats.set(name, created);
    return created;
  };
  for (const person of CAST) ensure(person.name);
  for (const hand of hands) {
    for (const seat of hand.seats) {
      const stat = ensure(seat.name);
      const slice = stat.byGame[hand.game];
      stat.hands += 1;
      stat.net += seat.delta;
      slice.hands += 1;
      slice.net += seat.delta;
      if (seat.delta > 0) {
        stat.wins += 1;
        slice.wins += 1;
        stat.best = Math.max(stat.best, seat.delta);
      } else if (seat.delta < 0) {
        stat.losses += 1;
        stat.worst = Math.min(stat.worst, seat.delta);
      } else stat.pushes += 1;
    }
  }
  return [...stats.values()].sort((a, b) => {
    if (a.name === "You") return -1;
    if (b.name === "You") return 1;
    return b.hands - a.hands || a.name.localeCompare(b.name);
  });
}
