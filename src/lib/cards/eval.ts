import { combinations, rankPlural, rankWord, type Card } from "@/lib/cards/model";

export type HandRank = {
  cat: number;
  kickers: number[];
  name: string;
};

export function better(a: HandRank, b: HandRank): number {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < n; i++) {
    const diff = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export function rankKey(hand: HandRank): number {
  let key = hand.cat;
  for (const kicker of hand.kickers) key = key * 16 + kicker;
  return key;
}

function straightHigh(ranksDesc: number[]): number | null {
  const unique = [...new Set(ranksDesc)].sort((a, b) => a - b);
  if (unique.length !== 5) return null;
  const wheel = unique[0] === 2 && unique[1] === 3 && unique[2] === 4 && unique[3] === 5 && unique[4] === 14;
  if (wheel) return 5;
  if (unique[4]! - unique[0]! === 4) return unique[4]!;
  return null;
}

export function rankFive(cards: readonly Card[]): HandRank {
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const high = straightHigh(ranks);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (flush && high) {
    return {
      cat: 8,
      kickers: [high],
      name: high === 14 ? "Royal flush" : `Straight flush, ${rankWord(high)} high`,
    };
  }
  if (groups[0]?.[1] === 4) {
    return {
      cat: 7,
      kickers: [groups[0][0], groups[1]?.[0] ?? 0],
      name: `Four ${rankPlural(groups[0][0])}`,
    };
  }
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) {
    return {
      cat: 6,
      kickers: [groups[0][0], groups[1][0]],
      name: `${rankPlural(groups[0][0])} full of ${rankPlural(groups[1][0])}`,
    };
  }
  if (flush) {
    return { cat: 5, kickers: ranks, name: `Flush, ${rankWord(ranks[0] ?? 0)} high` };
  }
  if (high) {
    return { cat: 4, kickers: [high], name: `Straight, ${rankWord(high)} high` };
  }
  if (groups[0]?.[1] === 3) {
    return {
      cat: 3,
      kickers: [groups[0][0], ...groups.slice(1).map((group) => group[0])],
      name: `Three ${rankPlural(groups[0][0])}`,
    };
  }
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return {
      cat: 2,
      kickers: [pairs[0]!, pairs[1]!, groups[2]?.[0] ?? 0],
      name: `${rankPlural(pairs[0]!)} and ${rankPlural(pairs[1]!)}`,
    };
  }
  if (groups[0]?.[1] === 2) {
    return {
      cat: 1,
      kickers: [groups[0][0], ...groups.slice(1).map((group) => group[0])],
      name: `Pair of ${rankPlural(groups[0][0])}`,
    };
  }
  return { cat: 0, kickers: ranks, name: `${rankWord(ranks[0] ?? 0)} high` };
}

/** Front row: trips, pair, or high card. Straights and flushes do not count. */
export function rankFront(cards: readonly Card[]): HandRank {
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (groups[0]?.[1] === 3) {
    return { cat: 3, kickers: [groups[0][0]], name: `Three ${rankPlural(groups[0][0])}` };
  }
  if (groups[0]?.[1] === 2) {
    return {
      cat: 1,
      kickers: [groups[0][0], groups[1]?.[0] ?? 0],
      name: `Pair of ${rankPlural(groups[0][0])}`,
    };
  }
  return { cat: 0, kickers: ranks, name: `${rankWord(ranks[0] ?? 0)} high` };
}

export function bestHand(cards: readonly Card[]): HandRank {
  if (cards.length < 5) {
    return { cat: 0, kickers: [], name: "Incomplete" };
  }
  if (cards.length === 5) return rankFive(cards);
  let best: HandRank | null = null;
  for (const combo of combinations(cards, 5)) {
    const rank = rankFive(combo);
    if (!best || better(rank, best) > 0) best = rank;
  }
  return best ?? rankFive(cards.slice(0, 5));
}
