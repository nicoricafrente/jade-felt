export type Suit = "s" | "h" | "d" | "c";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type Card = {
  suit: Suit;
  rank: Rank;
  id: string;
};

const SUITS: Suit[] = ["s", "h", "d", "c"];

const RANK_WORD = [
  "",
  "",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "jack",
  "queen",
  "king",
  "ace",
];

export function rankLabel(rank: number): string {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}

export function rankWord(rank: number): string {
  return RANK_WORD[rank] ?? String(rank);
}

export function rankPlural(rank: number): string {
  if (rank === 6) return "sixes";
  return `${rankWord(rank)}s`;
}

export function suitSymbol(suit: Suit): string {
  if (suit === "s") return "♠";
  if (suit === "h") return "♥";
  if (suit === "d") return "♦";
  return "♣";
}

export function suitName(suit: Suit): string {
  if (suit === "s") return "spades";
  if (suit === "h") return "hearts";
  if (suit === "d") return "diamonds";
  return "clubs";
}

export function isRed(suit: Suit): boolean {
  return suit === "h" || suit === "d";
}

export function cardName(card: Card): string {
  return `${rankWord(card.rank)} of ${suitName(card.suit)}`;
}

export function freshDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      const r = rank as Rank;
      cards.push({ suit, rank: r, id: `${rankLabel(r)}${suit}` });
    }
  }
  return shuffle(cards);
}

export function shoe(decks: number): Card[] {
  const cards: Card[] = [];
  for (let copy = 0; copy < decks; copy++) {
    for (const card of freshDeck()) {
      cards.push({ ...card, id: `${card.id}#${copy}` });
    }
  }
  return shuffle(cards);
}

export function shuffle<T>(list: readonly T[], rng: () => number = Math.random): T[] {
  const next = list.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = next[i]!;
    next[i] = next[j]!;
    next[j] = swap;
  }
  return next;
}

export function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const n = items.length;
  if (k < 0 || k > n) return out;
  const index = Array.from({ length: k }, (_, i) => i);
  if (k === 0) return [[]];
  while (true) {
    out.push(index.map((i) => items[i]!));
    let i = k - 1;
    while (i >= 0 && index[i] === n - k + i) i--;
    if (i < 0) break;
    index[i]!++;
    for (let j = i + 1; j < k; j++) index[j] = index[j - 1]! + 1;
  }
  return out;
}

/** Tong-its: aces are low. */
export function tongitsRank(card: Card): number {
  return card.rank === 14 ? 1 : card.rank;
}

export function tongitsPoint(card: Card): number {
  if (card.rank === 14) return 1;
  if (card.rank >= 10) return 10;
  return card.rank;
}

export function tongitsPoints(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + tongitsPoint(card), 0);
}
